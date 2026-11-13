import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { writeAudit } from '../../lib/audit.js';
import { ErrorCode } from '@ssg/shared';

/**
 * Dữ liệu tham chiếu do admin quản lý: cơ sở trường (campus) và danh mục quán (category).
 * Trước đây chỉ có seed, không có màn hình nào để thêm/sửa -> dropdown "Cơ sở trường" chỉ có 2 dòng.
 */
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// ---------------- Cơ sở trường ----------------
const CampusSchema = z.object({
  name: z.string().min(2).max(150),
  universityName: z.string().min(2).max(150),
  address: z.string().min(3).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  regionId: z.string().uuid().optional().nullable(),
});

router.get('/campuses', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [campuses, regions] = await Promise.all([
      prisma.campus.findMany({ orderBy: [{ universityName: 'asc' }, { name: 'asc' }], include: { _count: { select: { projections: true } } } }),
      prisma.region.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return res.json({
      success: true,
      data: campuses.map((c) => ({ ...c, placeCount: c._count.projections, _count: undefined })),
      regions,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/campuses', validateBody(CampusSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof CampusSchema>;
    const regionId = body.regionId ?? (await prisma.region.findFirst({ orderBy: { createdAt: 'asc' } }))?.id ?? null;
    const campus = await prisma.campus.create({ data: { ...body, regionId } });
    await writeAudit({ adminUserId: req.user!.id, action: 'CREATE_CAMPUS', targetEntity: 'Campus', targetId: campus.id, details: { name: campus.name }, ipAddress: req.ip });
    return res.status(201).json({ success: true, data: campus });
  } catch (err) {
    next(err);
  }
});

router.put('/campuses/:id', validateBody(CampusSchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const campus = await prisma.campus.update({ where: { id }, data: req.body });
    await writeAudit({ adminUserId: req.user!.id, action: 'UPDATE_CAMPUS', targetEntity: 'Campus', targetId: id, details: { name: campus.name }, ipAddress: req.ip });
    return res.json({ success: true, data: campus });
  } catch (err) {
    next(err);
  }
});

router.delete('/campuses/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const inUse = await prisma.placePublishedProjection.count({ where: { campusId: id } });
    if (inUse > 0) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: `Cơ sở này đang gắn với ${inUse} quán — đổi cơ sở của các quán đó trước khi xoá.` });
    }
    await prisma.campus.delete({ where: { id } });
    await writeAudit({ adminUserId: req.user!.id, action: 'DELETE_CAMPUS', targetEntity: 'Campus', targetId: id, ipAddress: req.ip });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------- Danh mục quán ----------------
const CategorySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

router.get('/categories', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { places: true } } } });
    return res.json({ success: true, data: categories.map((c) => ({ ...c, placeCount: c._count.places, _count: undefined })) });
  } catch (err) {
    next(err);
  }
});

router.post('/categories', validateBody(CategorySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as z.infer<typeof CategorySchema>;
    const slug = body.slug || slugify(body.name);
    const exists = await prisma.category.findUnique({ where: { slug } });
    if (exists) return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: 'Slug danh mục đã tồn tại' });
    const category = await prisma.category.create({ data: { ...body, slug, sortOrder: body.sortOrder ?? 0, isActive: body.isActive ?? true } });
    await writeAudit({ adminUserId: req.user!.id, action: 'CREATE_CATEGORY', targetEntity: 'Category', targetId: category.id, details: { name: category.name }, ipAddress: req.ip });
    return res.status(201).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

router.put('/categories/:id', validateBody(CategorySchema.partial()), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const category = await prisma.category.update({ where: { id }, data: req.body });
    await writeAudit({ adminUserId: req.user!.id, action: 'UPDATE_CATEGORY', targetEntity: 'Category', targetId: id, details: { name: category.name }, ipAddress: req.ip });
    return res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

router.delete('/categories/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const inUse = await prisma.place.count({ where: { categoryId: id } });
    if (inUse > 0) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: `Danh mục đang có ${inUse} quán — hãy tắt (ẩn) thay vì xoá.` });
    }
    await prisma.category.delete({ where: { id } });
    await writeAudit({ adminUserId: req.user!.id, action: 'DELETE_CATEGORY', targetEntity: 'Category', targetId: id, ipAddress: req.ip });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
