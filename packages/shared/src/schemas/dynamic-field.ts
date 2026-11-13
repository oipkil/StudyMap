import { z } from 'zod';
import { DataType } from '../constants/status.js';

// Định nghĩa cột cho kiểu TABLE
export const TableColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    DataType.TEXT,
    DataType.NUMBER,
    DataType.CURRENCY,
    DataType.SAFE_LINK,
    DataType.BOOLEAN_TRI_STATE,
  ]),
  unit: z.string().optional(),
  required: z.boolean().default(false),
});
export type TableColumn = z.infer<typeof TableColumnSchema>;

// Định nghĩa trường con cho kiểu REPEATER
export const RepeaterSubFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum([
    DataType.TEXT,
    DataType.LONG_TEXT,
    DataType.NUMBER,
    DataType.NUMBER_WITH_UNIT,
    DataType.CURRENCY,
    DataType.SELECT_ONE,
    DataType.SELECT_MANY,
    DataType.BOOLEAN_TRI_STATE,
    DataType.SAFE_LINK,
    DataType.IMAGE,
  ]),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
  isFilterable: z.boolean().default(false),
  isComparable: z.boolean().default(false),
});
export type RepeaterSubField = z.infer<typeof RepeaterSubFieldSchema>;

// Cấu hình REPEATER
export const RepeaterConfigSchema = z.object({
  minItems: z.number().int().nonnegative().default(0),
  maxItems: z.number().int().positive().default(20), // Giá trị cấu hình, không hardcode
  subFields: z.array(RepeaterSubFieldSchema).min(1),
});
export type RepeaterConfig = z.infer<typeof RepeaterConfigSchema>;

// Lịch sử định nghĩa trường động (FieldDefinitionVersion)
export const FieldDefinitionVersionSchema = z.object({
  version: z.number().int().positive(),
  label: z.string().min(1),
  dataType: z.enum([
    DataType.TEXT,
    DataType.LONG_TEXT,
    DataType.RICH_TEXT,
    DataType.NUMBER,
    DataType.NUMBER_WITH_UNIT,
    DataType.CURRENCY,
    DataType.RANGE,
    DataType.SELECT_ONE,
    DataType.SELECT_MANY,
    DataType.BOOLEAN_TRI_STATE,
    DataType.DATE,
    DataType.TIME,
    DataType.SAFE_LINK,
    DataType.IMAGE,
    DataType.GALLERY,
    DataType.TABLE,
    DataType.REPEATER,
  ]),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
  tableColumnsConfig: z.array(TableColumnSchema).optional(),
  repeaterConfig: RepeaterConfigSchema.optional(),
  displayConditions: z
    .array(
      z.object({
        fieldKey: z.string(),
        operator: z.enum(['EQUALS', 'NOT_EQUALS', 'IN', 'EXISTS']),
        expectedValue: z.any(),
      })
    )
    .optional(),
  permissions: z
    .object({
      viewRole: z.enum(['PUBLIC', 'USER', 'ADMIN']).default('PUBLIC'),
      editRole: z.enum(['USER', 'ADMIN']).default('ADMIN'),
    })
    .default({ viewRole: 'PUBLIC', editRole: 'ADMIN' }),
});
export type FieldDefinitionVersion = z.infer<typeof FieldDefinitionVersionSchema>;

// Giá trị của một trường động trong Snapshot (gắn liền với version ID định nghĩa)
export const FieldValueSnapshotSchema = z.object({
  fieldDefinitionId: z.string().uuid(),
  fieldDefinitionVersionId: z.string().uuid(),
  fieldKey: z.string(),
  dataType: z.string(),
  value: z.any(), // Sẽ được validate theo dataType tương ứng
});
export type FieldValueSnapshot = z.infer<typeof FieldValueSnapshotSchema>;

/**
 * Hàm kiểm tra bộ lọc đồng thời trên cùng một phần tử trong REPEATER (Co-location / Intra-element filter)
 * Ví dụ: Phòng học có giá <= 100.000 VÀ sức chứa >= 10 người phải thỏa mãn trên CÙNG một phòng.
 */
export function matchesRepeaterItemCriteria(
  items: Array<Record<string, any>>,
  criteria: Record<string, { op: 'LTE' | 'GTE' | 'EQ' | 'IN'; value: any }>
): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;

  return items.some((item) => {
    return Object.entries(criteria).every(([key, condition]) => {
      const itemVal = item[key];
      if (itemVal === undefined || itemVal === null) return false;

      switch (condition.op) {
        case 'LTE':
          return Number(itemVal) <= Number(condition.value);
        case 'GTE':
          return Number(itemVal) >= Number(condition.value);
        case 'EQ':
          return itemVal === condition.value;
        case 'IN':
          return (
            Array.isArray(condition.value) && condition.value.includes(itemVal)
          );
        default:
          return false;
      }
    });
  });
}
