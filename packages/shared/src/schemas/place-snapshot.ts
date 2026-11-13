import { z } from 'zod';
import { OperationalStatus } from '../constants/status.js';
import { FieldValueSnapshotSchema } from './dynamic-field.js';

export const ScheduleShiftSchema = z.object({
  shiftName: z.string().optional(), // Ví dụ: Ca sáng, Ca chiều
  openTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:mm
  closeTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/), // HH:mm
  isOvernight: z.boolean().default(false), // Ví dụ: 21:00 đến 02:00
});
export type ScheduleShift = z.infer<typeof ScheduleShiftSchema>;

export const DayScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6), // 0: Chủ Nhật, 1: Thứ Hai...
  isClosed: z.boolean().default(false),
  is24h: z.boolean().default(false),
  shifts: z.array(ScheduleShiftSchema).default([]),
});
export type DaySchedule = z.infer<typeof DayScheduleSchema>;

export const ScheduleExceptionSchema = z.object({
  specificDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  reason: z.string().min(1),
  isOpen: z.boolean(),
  shifts: z.array(ScheduleShiftSchema).default([]),
});
export type ScheduleException = z.infer<typeof ScheduleExceptionSchema>;

export const MenuItemVariantSchema = z.object({
  name: z.string().min(1),
  price: z.number().nonnegative(),
  isDefault: z.boolean().default(false),
});
export type MenuItemVariant = z.infer<typeof MenuItemVariantSchema>;

export const MenuItemSnapshotSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  basePrice: z.number().nonnegative(),
  priceMax: z.number().nonnegative().optional(),
  unit: z.string().default('VND'),
  photoAssetId: z.string().uuid().optional().nullable(),
  status: z.enum(['AVAILABLE', 'TEMPORARILY_OUT', 'UNKNOWN']).default('AVAILABLE'),
  allergyNotice: z.string().optional(),
  variants: z.array(MenuItemVariantSchema).default([]),
  customFields: z.record(z.string(), z.any()).default({}),
  sortOrder: z.number().int().default(0),
});
export type MenuItemSnapshot = z.infer<typeof MenuItemSnapshotSchema>;

export const MenuGroupSnapshotSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  items: z.array(MenuItemSnapshotSchema).default([]),
});
export type MenuGroupSnapshot = z.infer<typeof MenuGroupSnapshotSchema>;

export const ContentBlockSnapshotSchema = z.object({
  id: z.string().uuid().optional(),
  blockType: z.string(),
  contentPayload: z.record(z.string(), z.any()),
  sortOrder: z.number().int().default(0),
});
export type ContentBlockSnapshot = z.infer<typeof ContentBlockSnapshotSchema>;

export const PlaceAmenitiesSchema = z.object({
  wifiQuality: z.enum(['NONE', 'WEAK', 'MODERATE', 'STRONG', 'UNKNOWN']).default('UNKNOWN'),
  socketDensity: z.enum(['NONE', 'SPARSE', 'EVERY_TABLE', 'MANY', 'UNKNOWN']).default('UNKNOWN'),
  noiseLevel: z.enum(['SILENT', 'QUIET', 'MODERATE', 'LOUD', 'UNKNOWN']).default('UNKNOWN'),
  studySuitability: z.enum(['POOR', 'FAIR', 'GOOD', 'EXCELLENT', 'UNKNOWN']).default('UNKNOWN'),
  groupStudyAllowed: z.boolean().nullable().default(null),
  privateRoomsCount: z.number().int().nonnegative().default(0),
  laptopPolicy: z.string().optional(),
  seatingCapacity: z.number().int().nonnegative().optional(),
  airConditioned: z.boolean().nullable().default(null),
  restRoomQuality: z.string().optional(),
  petFriendly: z.boolean().nullable().default(null),
  wheelchairAccessible: z.boolean().nullable().default(null),
  motorcycleParking: z.enum(['FREE', 'PAID', 'NONE', 'UNKNOWN']).default('UNKNOWN'),
  carParking: z.enum(['FREE', 'PAID', 'NONE', 'UNKNOWN']).default('UNKNOWN'),
});
export type PlaceAmenities = z.infer<typeof PlaceAmenitiesSchema>;

// Toàn bộ Snapshot của hồ sơ quán - Gắn với PlaceRevision
export const PlaceSnapshotDataSchema = z.object({
  // Nhóm nhận diện
  name: z.string().min(1),
  alternateNames: z.array(z.string()).default([]),
  slug: z.string().min(1),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().optional().nullable(),
  parentPlaceId: z.string().uuid().optional().nullable(),
  operationalStatus: z.enum([
    OperationalStatus.OPERATING,
    OperationalStatus.TEMPORARILY_CLOSED,
    OperationalStatus.PERMANENTLY_CLOSED,
    OperationalStatus.UNKNOWN,
  ]).default(OperationalStatus.OPERATING),
  shortDescription: z.string().optional(),
  fullDescription: z.string().optional(),
  avatarAssetId: z.string().uuid().optional().nullable(),
  coverAssetId: z.string().uuid().optional().nullable(),
  publicPhone: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  socialLinks: z.record(z.string(), z.string()).default({}),
  sourceInfo: z.string().optional(),
  lastVerifiedAt: z.string().datetime().optional(),

  // Nhóm vị trí
  address: z.string().min(1),
  oldAddress: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  entranceGuide: z.string().optional(),
  floor: z.string().optional(),
  parkingGuide: z.string().optional(),
  nearestCampusId: z.string().uuid().optional().nullable(),
  distanceToCampusMeters: z.number().nonnegative().optional(),

  // Nhóm hoạt động
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
  weeklySchedule: z.array(DayScheduleSchema).default([]),
  scheduleExceptions: z.array(ScheduleExceptionSchema).default([]),

  // Nhóm chi phí & ưu đãi
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().nonnegative().optional(),
  currency: z.string().default('VND'),
  studentDiscountDetails: z.string().optional(),
  discountValidUntil: z.string().datetime().optional().nullable(),
  hourlySeatRate: z.number().nonnegative().optional(),
  minimumSpend: z.number().nonnegative().optional(),
  pricingLastUpdated: z.string().datetime().optional(),

  // Nhóm phục vụ học tập & tiện ích
  amenities: PlaceAmenitiesSchema.default({
    wifiQuality: 'UNKNOWN',
    socketDensity: 'UNKNOWN',
    noiseLevel: 'UNKNOWN',
    studySuitability: 'UNKNOWN',
    groupStudyAllowed: null,
    privateRoomsCount: 0,
    airConditioned: null,
    petFriendly: null,
    wheelchairAccessible: null,
    motorcycleParking: 'UNKNOWN',
    carParking: 'UNKNOWN',
  }),

  // Nhóm Menu
  menuGroups: z.array(MenuGroupSnapshotSchema).default([]),
  menuLastUpdated: z.string().datetime().optional(),

  // Nhóm Gallery
  galleryAssetIds: z.array(z.string().uuid()).default([]),
  // Gallery đầy đủ do trình sửa quán gửi lên: ảnh + revision cố định + ảnh bìa + chú thích + thứ tự.
  // (Trước đây thiếu khai báo nên Zod lặng lẽ cắt bỏ -> ảnh gắn vào quán biến mất sau khi lưu.)
  gallery: z
    .array(
      z.object({
        assetId: z.string().uuid(),
        assetRevisionId: z.string().uuid().optional().nullable(),
        isCover: z.boolean().default(false),
        caption: z.string().max(300).optional().default(''),
        displayOrder: z.number().int().min(0).optional().default(0),
      }),
    )
    .max(30)
    .default([]),

  // Nhóm Dynamic Fields (Bao gồm TABLE và REPEATER)
  dynamicFieldValues: z.array(FieldValueSnapshotSchema).default([]),

  // Nhóm Content Blocks
  contentBlocks: z.array(ContentBlockSnapshotSchema).default([]),
});
export type PlaceSnapshotData = z.infer<typeof PlaceSnapshotDataSchema>;

/**
 * Tính toán trạng thái đang mở cửa chính xác tại thời điểm truy vấn
 * Hỗ trợ: Ngày ngoại lệ, ca xuyên đêm, nhiều ca trong ngày
 */
export function computeIsOpenNow(
  weeklySchedule: DaySchedule[] = [],
  exceptions: ScheduleException[] = [],
  timezone: string = 'Asia/Ho_Chi_Minh',
  targetDate: Date = new Date()
): { isOpen: boolean; currentShift?: ScheduleShift; nextChange?: string } {
  const safeWeekly = Array.isArray(weeklySchedule) ? weeklySchedule : [];
  const safeExceptions = Array.isArray(exceptions) ? exceptions : [];

  // Format current date in destination timezone
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(targetDate);
    const getVal = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    
    const yyyy = getVal('year');
    const mm = getVal('month');
    const dd = getVal('day');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const currentMinutes = parseInt(getVal('hour'), 10) * 60 + parseInt(getVal('minute'), 10);
    
    // Tính thứ trong tuần (0: Sunday, 1: Monday...)
    const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay();

    // 1. Kiểm tra ngày ngoại lệ trước (ưu tiên cao nhất)
    const exception = safeExceptions.find((e) => e?.specificDate === dateStr);
    if (exception) {
      if (!exception.isOpen) {
        return { isOpen: false, nextChange: 'Nghỉ theo lịch ngoại lệ' };
      }
      return checkShifts(exception.shifts || [], currentMinutes);
    }

    // 2. Kiểm tra lịch ngày trong tuần
    const todaySchedule = safeWeekly.find((s) => s?.dayOfWeek === dayOfWeek);
    if (!todaySchedule || todaySchedule.isClosed) {
      return { isOpen: false };
    }
    if (todaySchedule.is24h) {
      return { isOpen: true, nextChange: 'Mở cửa 24/24' };
    }

    return checkShifts(todaySchedule.shifts || [], currentMinutes);
  } catch {
    return { isOpen: false };
  }
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function checkShifts(shifts: ScheduleShift[] = [], currentMinutes: number): { isOpen: boolean; currentShift?: ScheduleShift } {
  const safeShifts = Array.isArray(shifts) ? shifts : [];
  for (const shift of safeShifts) {
    if (!shift || !shift.openTime || !shift.closeTime) continue;
    const openM = parseTimeToMinutes(shift.openTime);
    const closeM = parseTimeToMinutes(shift.closeTime);

    if (shift.isOvernight || closeM < openM) {
      // Ca xuyên đêm (ví dụ: 21:00 đến 02:00 hôm sau)
      if (currentMinutes >= openM || currentMinutes < closeM) {
        return { isOpen: true, currentShift: shift };
      }
    } else {
      // Ca trong ngày thông thường
      if (currentMinutes >= openM && currentMinutes < closeM) {
        return { isOpen: true, currentShift: shift };
      }
    }
  }

  return { isOpen: false };
}

