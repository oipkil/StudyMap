/** Định nghĩa trường động rút gọn dùng ở web (từ /api/v1/places/field-definitions hoặc /api/v1/admin/field-definitions). */
export interface DynamicFieldDef {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  dataType: string;
  unit?: string | null;
  options?: string[];
  versionId?: string | null;
  group?: { id: string; key: string; label: string; sortOrder: number } | null;
  categoryIds?: string[];
  isComparable?: boolean;
  isFilterable?: boolean;
}

/** Giá trị đã lưu trong snapshot.dynamicFieldValues */
export interface DynamicFieldValue {
  fieldDefinitionId: string;
  fieldDefinitionVersionId: string;
  fieldKey: string;
  dataType: string;
  value: unknown;
}

/** Các kiểu mà form/trang hiển thị chung xử lý được (REPEATER phòng học nhóm có giao diện riêng). */
export const SIMPLE_DATA_TYPES = new Set([
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'NUMBER_WITH_UNIT',
  'CURRENCY',
  'RANGE',
  'SELECT_ONE',
  'SELECT_MANY',
  'BOOLEAN_TRI_STATE',
  'DATE',
  'TIME',
  'SAFE_LINK',
]);

/** Chuẩn hoá bản ghi từ API admin (có versions[]/fieldGroup) hoặc API công khai (đã phẳng) về một dạng. */
export function normalizeFieldDef(raw: any): DynamicFieldDef {
  const v = Array.isArray(raw.versions) ? raw.versions[0] : null;
  return {
    id: raw.id,
    key: raw.key,
    label: v?.label ?? raw.label,
    description: raw.description ?? null,
    dataType: raw.dataType,
    unit: v?.unit ?? raw.unit ?? null,
    options: v?.options ?? raw.options ?? [],
    versionId: v?.id ?? raw.versionId ?? null,
    group: raw.fieldGroup ?? raw.group ?? null,
    categoryIds: raw.categoryIds ?? (Array.isArray(raw.categoryBindings) ? raw.categoryBindings.map((b: any) => b.categoryId) : []),
    isComparable: raw.isComparable,
    isFilterable: raw.isFilterable,
  };
}

/** Trường có áp dụng cho danh mục này không (không gắn danh mục nào = áp dụng cho tất cả). */
export function appliesToCategory(def: DynamicFieldDef, categoryId?: string | null) {
  if (!categoryId || !def.categoryIds || def.categoryIds.length === 0) return true;
  return def.categoryIds.includes(categoryId);
}

/** Giá trị coi là "trống" -> không lưu / không hiển thị. */
export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.values(o).every((x) => x === null || x === undefined || x === '');
  }
  return false;
}

const fmtNumber = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('vi-VN') : String(n));

/** Chuỗi hiển thị cho một giá trị theo kiểu dữ liệu (kèm đơn vị). */
export function formatDynamicValue(def: DynamicFieldDef, value: unknown): string {
  if (isEmptyValue(value)) return '';
  switch (def.dataType) {
    case 'BOOLEAN_TRI_STATE':
      return value === true ? 'Có' : value === false ? 'Không' : 'Chưa rõ';
    case 'CURRENCY':
      return typeof value === 'number' && value === 0 ? 'Miễn phí' : `${fmtNumber(value)} ${def.unit || 'VND'}`.replace(' VND', 'đ');
    case 'NUMBER':
    case 'NUMBER_WITH_UNIT':
      return def.unit ? `${fmtNumber(value)} ${def.unit}` : fmtNumber(value);
    case 'RANGE': {
      const r = value as { min?: number; max?: number };
      const u = def.unit ? ` ${def.unit}` : '';
      if (r.min != null && r.max != null) return `${fmtNumber(r.min)} – ${fmtNumber(r.max)}${u}`;
      if (r.min != null) return `từ ${fmtNumber(r.min)}${u}`;
      if (r.max != null) return `đến ${fmtNumber(r.max)}${u}`;
      return '';
    }
    case 'SELECT_MANY':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'DATE': {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('vi-VN');
    }
    default:
      return String(value);
  }
}

/** Nhóm các định nghĩa theo fieldGroup, sắp theo sortOrder; trường không có nhóm vào "Thông tin khác". */
export function groupFieldDefs(defs: DynamicFieldDef[]) {
  const map = new Map<string, { key: string; label: string; sortOrder: number; defs: DynamicFieldDef[] }>();
  for (const d of defs) {
    const g = d.group ?? { key: '_other', label: 'Thông tin khác', sortOrder: 999, id: '_other' };
    if (!map.has(g.key)) map.set(g.key, { key: g.key, label: g.label, sortOrder: g.sortOrder ?? 999, defs: [] });
    map.get(g.key)!.defs.push(d);
  }
  return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder);
}
