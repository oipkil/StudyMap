import { writeAudit } from '../../lib/audit.js';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { DataType, ErrorCode } from '@ssg/shared';

const router = Router();
router.use(requireAuth);
router.use(requireRole('ADMIN'));

// 1. Lấy danh sách tất cả các định nghĩa trường động
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const fields = await prisma.fieldDefinition.findMany({
      where: { isArchived: false },
      include: {
        versions: {
          orderBy: { version: 'desc' },
        },
        categoryBindings: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
        fieldGroup: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: fields });
  } catch (err) {
    next(err);
  }
});

// Schema tạo trường động mới
const CreateFieldSchema = z.object({
  key: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/, 'Key chỉ chứa chữ thường, số và dấu gạch dưới'),
  label: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
  dataType: z.nativeEnum(DataType),
  unit: z.string().max(20).optional(),
  isRequired: z.boolean().default(false),
  isFilterable: z.boolean().default(false),
  isComparable: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  tableColumnsConfig: z.any().optional(),
  repeaterConfig: z.any().optional(),
  displayConditions: z.any().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  // Nhóm hiển thị (ví dụ "Học tập & làm việc"): truyền id có sẵn, hoặc key+label để tự tạo nhóm nếu chưa có
  fieldGroupId: z.string().uuid().optional().nullable(),
  fieldGroupKey: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/).optional(),
  fieldGroupLabel: z.string().min(1).max(100).optional(),
  fieldGroupSortOrder: z.number().int().min(0).max(1000).optional(),
  isPublic: z.boolean().default(true),
});

/** Tìm hoặc tạo nhóm trường theo key (dùng cho seed & form admin). */
async function resolveFieldGroupId(tx: any, data: { fieldGroupId?: string | null; fieldGroupKey?: string; fieldGroupLabel?: string; fieldGroupSortOrder?: number }) {
  if (data.fieldGroupId) return data.fieldGroupId;
  if (!data.fieldGroupKey) return null;
  const existing = await tx.fieldGroup.findUnique({ where: { key: data.fieldGroupKey } });
  if (existing) {
    // Cho phép đổi tên / thứ tự nhóm khi truyền label mới (seed cập nhật nhãn nhóm cũ)
    const patch: Record<string, unknown> = {};
    if (data.fieldGroupLabel && data.fieldGroupLabel !== existing.label) patch.label = data.fieldGroupLabel;
    if (data.fieldGroupSortOrder !== undefined && data.fieldGroupSortOrder !== existing.sortOrder) patch.sortOrder = data.fieldGroupSortOrder;
    if (Object.keys(patch).length) await tx.fieldGroup.update({ where: { id: existing.id }, data: patch });
    return existing.id;
  }
  const created = await tx.fieldGroup.create({
    data: { key: data.fieldGroupKey, label: data.fieldGroupLabel || data.fieldGroupKey, sortOrder: data.fieldGroupSortOrder ?? 0 },
  });
  return created.id;
}

// 1b. Danh sách nhóm trường
router.get('/groups', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const groups = await prisma.fieldGroup.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { fields: true } } } });
    return res.json({ success: true, data: groups.map((g) => ({ ...g, fieldCount: g._count.fields, _count: undefined })) });
  } catch (err) {
    next(err);
  }
});

// 2. Tạo định nghĩa trường động mới (tự động khởi tạo phiên bản 1)
router.post('/', validateBody(CreateFieldSchema), async (req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => { if (res.statusCode < 300) void writeAudit({ adminUserId: req.user!.id, action: 'CREATE_FIELD_DEFINITION', targetEntity: 'FieldDefinition', targetId: String(req.body?.key), details: { label: req.body?.label, dataType: req.body?.dataType }, ipAddress: req.ip }); });
  try {
    const data = req.body;

    // Kiểm tra trùng key
    const existing = await prisma.fieldDefinition.findUnique({ where: { key: data.key } });
    if (existing) {
      return res.status(409).json({
        success: false,
        errorCode: ErrorCode.CONFLICT,
        message: `Mã trường động '${data.key}' đã tồn tại trong hệ thống`,
      });
    }

    const field = await prisma.$transaction(async (tx) => {
      const def = await tx.fieldDefinition.create({
        data: {
          key: data.key,
          label: data.label,
          description: data.description,
          dataType: data.dataType,
          isRequired: data.isRequired,
          isFilterable: data.isFilterable,
          isComparable: data.isComparable,
          isPublic: data.isPublic ?? true,
          fieldGroupId: await resolveFieldGroupId(tx, data),
          currentVersion: 1,
        },
      });

      const ver = await tx.fieldDefinitionVersion.create({
        data: {
          fieldDefinitionId: def.id,
          version: 1,
          label: data.label,
          dataType: data.dataType,
          unit: data.unit,
          options: data.options,
          tableColumnsConfig: data.tableColumnsConfig,
          repeaterConfig: data.repeaterConfig,
          displayConditions: data.displayConditions,
          createdByAdminId: req.user!.id,
        },
      });

      if (data.categoryIds && data.categoryIds.length > 0) {
        await tx.categoryFieldBinding.createMany({
          data: data.categoryIds.map((categoryId: string) => ({
            categoryId,
            fieldDefinitionId: def.id,
          })),
        });
      }

      return { ...def, initialVersion: ver };
    });

    return res.status(201).json({ success: true, data: field });
  } catch (err) {
    next(err);
  }
});

// Schema cập nhật phiên bản trường động (bảo toàn tính bất biến phiên bản cũ)
const UpdateFieldVersionSchema = z.object({
  label: z.string().min(1).max(100),
  unit: z.string().max(20).optional(),
  options: z.array(z.string()).optional(),
  tableColumnsConfig: z.any().optional(),
  repeaterConfig: z.any().optional(),
  displayConditions: z.any().optional(),
  isRequired: z.boolean().optional(),
  isFilterable: z.boolean().optional(),
  isComparable: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  description: z.string().max(255).optional().nullable(),
  categoryIds: z.array(z.string().uuid()).optional(),
  fieldGroupId: z.string().uuid().optional().nullable(),
  fieldGroupKey: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/).optional(),
  fieldGroupLabel: z.string().min(1).max(100).optional(),
  fieldGroupSortOrder: z.number().int().min(0).max(1000).optional(),
});

// 3. Cập nhật trường động: TẠO PHIÊN BẢN MỚI (Immutable version history)
router.put('/:id', validateBody(UpdateFieldVersionSchema), async (req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => { if (res.statusCode < 300) void writeAudit({ adminUserId: req.user!.id, action: 'UPDATE_FIELD_DEFINITION', targetEntity: 'FieldDefinition', targetId: String(req.params.id), details: { label: req.body?.label }, ipAddress: req.ip }); });
  try {
    const id = req.params.id as string;
    const data = req.body;

    const currentDef = await prisma.fieldDefinition.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!currentDef) {
      return res.status(404).json({
        success: false,
        errorCode: ErrorCode.NOT_FOUND,
        message: 'Không tìm thấy trường động',
      });
    }

    const nextVersion = currentDef.currentVersion + 1;

    const updated = await prisma.$transaction(async (tx) => {
      const newVersion = await tx.fieldDefinitionVersion.create({
        data: {
          fieldDefinitionId: currentDef.id,
          version: nextVersion,
          label: data.label,
          dataType: currentDef.dataType,
          unit: data.unit,
          options: data.options || [],
          tableColumnsConfig: data.tableColumnsConfig,
          repeaterConfig: data.repeaterConfig,
          displayConditions: data.displayConditions,
          createdByAdminId: req.user!.id,
        },
      });

      const updatedDef = await tx.fieldDefinition.update({
        where: { id: currentDef.id },
        data: {
          label: data.label,
          currentVersion: nextVersion,
          isRequired: data.isRequired ?? currentDef.isRequired,
          isFilterable: data.isFilterable ?? currentDef.isFilterable,
          isComparable: data.isComparable ?? currentDef.isComparable,
          isPublic: data.isPublic ?? currentDef.isPublic,
          description: data.description === undefined ? currentDef.description : data.description,
          ...(data.fieldGroupId !== undefined || data.fieldGroupKey ? { fieldGroupId: await resolveFieldGroupId(tx, data) } : {}),
        },
      });

      if (data.categoryIds) {
        await tx.categoryFieldBinding.deleteMany({ where: { fieldDefinitionId: id } });
        await tx.categoryFieldBinding.createMany({
          data: data.categoryIds.map((categoryId: string) => ({
            categoryId,
            fieldDefinitionId: id,
          })),
        });
      }

      return { ...updatedDef, activeVersion: newVersion };
    });

    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// 4. Lưu trữ (archive) trường động thay vì xóa cứng làm mất dữ liệu lịch sử
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => { if (res.statusCode < 300) void writeAudit({ adminUserId: req.user!.id, action: 'DELETE_FIELD_DEFINITION', targetEntity: 'FieldDefinition', targetId: String(req.params.id), ipAddress: req.ip }); });
  try {
    const id = req.params.id as string;
    await prisma.fieldDefinition.update({
      where: { id },
      data: { isArchived: true },
    });

    return res.json({
      success: true,
      message: 'Đã lưu trữ trường động thành công mà không ảnh hưởng tới dữ liệu cũ',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
