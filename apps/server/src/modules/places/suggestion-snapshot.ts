import { prisma } from '../../lib/prisma.js';
import { PlaceSnapshotDataSchema, PlaceAmenitiesSchema, OperationalStatus } from '@ssg/shared';

/**
 * Dựng hồ sơ quán (snapshot) từ một đề xuất của sinh viên.
 * Nguyên tắc: KHÔNG bịa dữ liệu — ô sinh viên không điền thì để trống / "Chưa rõ", không gán mặc định giả
 * (trước đây bản duyệt tự gán Wi-Fi mạnh, máy lạnh có, giảm 10%, giờ 07:00–22:30, điểm 5.0...).
 * Trả về snapshot đã qua Zod + danh sách vấn đề (ví dụ thiếu vị trí) để admin quyết định.
 */

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface SuggestionLike {
  id: string;
  userId: string;
  proposedName: string;
  categoryId: string;
  addressDescription: string;
  campusId: string | null;
  initialData: unknown;
  createdAt: Date;
  user?: { email?: string | null; username?: string | null } | null;
}

export const slugifyName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

/** Lịch 7 ngày từ khung giờ chung (sinh viên chỉ nhập một khung) hoặc dùng lịch chi tiết nếu đã có. */
function buildSchedule(initial: any): any[] {
  if (Array.isArray(initial.weeklySchedule) && initial.weeklySchedule.length) return initial.weeklySchedule;
  const sch = initial.schedule || {};
  const is24h = Boolean(sch.is24h ?? initial.is24h);
  const open = str(sch.openTime ?? initial.openTime);
  const close = str(sch.closeTime ?? initial.closeTime);
  if (!is24h && !(open && close && TIME_RE.test(open) && TIME_RE.test(close))) return [];
  const shifts = is24h ? [] : [{ shiftName: 'Cả ngày', openTime: open!, closeTime: close!, isOvernight: Boolean(sch.isOvernight ?? initial.isOvernight) }];
  return [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({ dayOfWeek, isClosed: false, is24h, shifts }));
}

/** Tiện ích học tập: chỉ nhận giá trị hợp lệ, còn lại UNKNOWN/null (schema tự điền). */
function buildAmenities(initial: any) {
  const raw = initial.amenities && typeof initial.amenities === 'object' ? initial.amenities : {};
  const parsed = PlaceAmenitiesSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Từng khoá lỗi -> bỏ khoá đó rồi parse lại (giữ những gì hợp lệ)
  const cleaned: Record<string, unknown> = { ...raw };
  for (const issue of parsed.error.issues) {
    const k = issue.path[0];
    if (typeof k === 'string') delete cleaned[k];
  }
  const again = PlaceAmenitiesSchema.safeParse(cleaned);
  return again.success ? again.data : PlaceAmenitiesSchema.parse({});
}

/** Ảnh sinh viên tải lên: chỉ lấy ảnh do chính người đề xuất sở hữu và đã xử lý xong. */
async function buildGallery(initial: any, ownerUserId: string) {
  const ids: string[] = Array.isArray(initial.galleryAssetIds)
    ? initial.galleryAssetIds.filter((x: unknown) => typeof x === 'string')
    : Array.isArray(initial.gallery)
      ? initial.gallery.map((g: any) => g?.assetId).filter((x: unknown) => typeof x === 'string')
      : [];
  if (ids.length === 0) return [];
  const assets = await prisma.asset.findMany({
    where: { id: { in: ids }, uploaderId: ownerUserId, technicalStatus: 'READY' },
    select: { id: true, currentRevisionId: true },
  });
  const byId = new Map(assets.map((a) => [a.id, a]));
  return ids
    .filter((id) => byId.has(id))
    .map((id, idx) => ({ assetId: id, assetRevisionId: byId.get(id)!.currentRevisionId ?? null, isCover: idx === 0, caption: '', displayOrder: idx }));
}

/** Trường động: nhận dạng {key: value} (form sinh viên) hoặc mảng đầy đủ; tra định nghĩa để gắn id/version. */
async function buildDynamicFieldValues(initial: any, categoryId: string) {
  const out: any[] = [];
  const defs = await prisma.fieldDefinition.findMany({
    where: { isArchived: false },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 }, categoryBindings: { select: { categoryId: true } } },
  });
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const applies = (d: (typeof defs)[number]) => d.categoryBindings.length === 0 || d.categoryBindings.some((b) => b.categoryId === categoryId);

  if (Array.isArray(initial.dynamicFieldValues)) {
    for (const v of initial.dynamicFieldValues) {
      const d = v?.fieldKey ? byKey.get(v.fieldKey) : null;
      if (!d || !applies(d) || v.value === null || v.value === undefined || v.value === '') continue;
      out.push({ fieldDefinitionId: d.id, fieldDefinitionVersionId: d.versions[0]?.id ?? d.id, fieldKey: d.key, dataType: d.dataType, value: v.value });
    }
  }
  const dyn = initial.dyn && typeof initial.dyn === 'object' ? initial.dyn : {};
  for (const [key, value] of Object.entries(dyn)) {
    const d = byKey.get(key);
    if (!d || !applies(d) || out.some((o) => o.fieldKey === key)) continue;
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.values(value as object).every((x) => x === null || x === undefined || x === '')) continue;
    out.push({ fieldDefinitionId: d.id, fieldDefinitionVersionId: d.versions[0]?.id ?? d.id, fieldKey: d.key, dataType: d.dataType, value });
  }
  return out;
}

export async function buildSnapshotFromSuggestion(
  suggestion: SuggestionLike,
  opts: { slug?: string; categoryId?: string | null; nearestCampusId?: string | null } = {},
) {
  const initial: any = (suggestion.initialData as any) || {};
  const issues: string[] = [];
  // Cảnh báo không chặn: sinh viên ghi "trường khác" / "loại hình khác" chưa có trong danh sách -> admin xem xét
  const warnings: string[] = [];
  if (str(initial.campusOther)) warnings.push(`Trường/cơ sở chưa có trong danh sách: "${str(initial.campusOther)}" — thêm ở "Cơ sở trường & danh mục" rồi chọn lại, hoặc chọn cơ sở gần nhất có sẵn`);
  if (str(initial.categoryOther)) warnings.push(`Loại hình sinh viên ghi thêm: "${str(initial.categoryOther)}" — chọn danh mục phù hợp khi duyệt (hoặc tạo danh mục mới)`);
  const categoryId = opts.categoryId || suggestion.categoryId;
  const campusOverride = opts.nearestCampusId === undefined ? undefined : opts.nearestCampusId;

  const latitude = num(initial.latitude ?? initial.coordinates?.latitude);
  const longitude = num(initial.longitude ?? initial.coordinates?.longitude);
  if (latitude === undefined || longitude === undefined) issues.push('Chưa có vị trí trên bản đồ (kinh độ / vĩ độ)');

  const priceMin = num(initial.priceMin);
  const priceMax = num(initial.priceMax);
  const website = str(initial.website);
  const submitter = suggestion.user?.email || suggestion.user?.username || suggestion.userId;
  const notes = str(initial.otherNotes);

  const snapshot: Record<string, unknown> = {
    name: suggestion.proposedName,
    alternateNames: Array.isArray(initial.alternateNames) ? initial.alternateNames.filter((x: unknown) => typeof x === 'string') : [],
    slug: opts.slug ?? `${slugifyName(suggestion.proposedName)}-${Date.now().toString().slice(-4)}`,
    categoryId,
    operationalStatus: OperationalStatus.OPERATING,
    shortDescription: str(initial.shortDescription),
    fullDescription: str(initial.fullDescription) ?? (notes ? `Ghi chú của người đề xuất: ${notes}` : undefined),
    publicPhone: str(initial.phone ?? initial.publicPhone),
    website: website && /^https?:\/\//i.test(website) ? website : undefined,
    socialLinks: initial.socialLinks && typeof initial.socialLinks === 'object' ? initial.socialLinks : {},
    sourceInfo: [
      `Đề xuất từ sinh viên ${submitter} ngày ${new Date(suggestion.createdAt).toLocaleDateString('vi-VN')}`,
      str(initial.campusOther) ? `Trường sinh viên ghi: ${str(initial.campusOther)}` : '',
      str(initial.categoryOther) ? `Loại hình sinh viên ghi: ${str(initial.categoryOther)}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    address: suggestion.addressDescription,
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    entranceGuide: str(initial.entranceGuide),
    parkingGuide: str(initial.parkingGuide),
    nearestCampusId: campusOverride !== undefined ? campusOverride ?? undefined : (str(initial.nearestCampusId) ?? suggestion.campusId ?? undefined),
    timezone: 'Asia/Ho_Chi_Minh',
    weeklySchedule: buildSchedule(initial),
    scheduleExceptions: [],
    priceMin,
    priceMax,
    currency: 'VND',
    studentDiscountDetails: str(initial.studentDiscountDetails),
    amenities: buildAmenities(initial),
    menuGroups: [],
    galleryAssetIds: [],
    gallery: await buildGallery(initial, suggestion.userId),
    dynamicFieldValues: await buildDynamicFieldValues(initial, categoryId),
    contentBlocks: [],
  };
  // Zod không nhận undefined/null cho một số khoá tuỳ chọn -> bỏ khoá rỗng
  for (const k of Object.keys(snapshot)) if (snapshot[k] === undefined || snapshot[k] === null) delete snapshot[k];
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) issues.push('Giá thấp nhất lớn hơn giá cao nhất');

  const parsed = PlaceSnapshotDataSchema.safeParse(snapshot);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push(`${i.path.join('.') || 'snapshot'}: ${i.message}`);
    return { snapshot, issues, warnings, valid: false as const };
  }
  const data = parsed.data as any;
  const is24h = Array.isArray(data.weeklySchedule) && data.weeklySchedule.length === 7 && data.weeklySchedule.every((d: any) => d.is24h);
  return { snapshot: { ...data, is24h }, issues, warnings, valid: issues.length === 0 };
}
