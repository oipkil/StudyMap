import React from 'react';
import { Form, Input, InputNumber, Select, Segmented, DatePicker, TimePicker, Collapse, Typography, Row, Col, Tag } from 'antd';
import dayjs from 'dayjs';
import { type DynamicFieldDef, groupFieldDefs } from '../../utils/dynamicFields';

const { Text } = Typography;

interface DynamicFieldsFormProps {
  /** Định nghĩa đã lọc theo danh mục, kiểu đơn giản (không REPEATER). */
  defs: DynamicFieldDef[];
  /** Tên namespace trong Form (mặc định 'dyn' -> giá trị ở values.dyn[key]). */
  namespace?: string;
  compact?: boolean;
  /** Gập hết các nhóm lúc đầu (form sinh viên: bớt rối). */
  defaultCollapsed?: boolean;
}

/**
 * Một ô nhập theo kiểu dữ liệu của trường động.
 * Form.Item truyền id/value/onChange qua props -> phải chuyển tiếp () vào ô nhập thật, nếu không form không nhận giá trị.
 */
const FieldInput: React.FC<{ def: DynamicFieldDef } & Record<string, unknown>> = ({ def, ...rest }) => {
  const unit = def.unit || undefined;
  switch (def.dataType) {
    case 'BOOLEAN_TRI_STATE':
      return (
        <Segmented
          {...(rest as any)}
          size="small"
          options={[
            { label: 'Có', value: 'true' },
            { label: 'Không', value: 'false' },
            { label: 'Chưa rõ', value: 'null' },
          ]}
        />
      );
    case 'SELECT_ONE':
      return <Select {...(rest as any)} allowClear placeholder="Chọn…" options={(def.options || []).map((o) => ({ value: o, label: o }))} />;
    case 'SELECT_MANY':
      return <Select {...(rest as any)} mode="multiple" allowClear placeholder="Chọn một hoặc nhiều…" options={(def.options || []).map((o) => ({ value: o, label: o }))} />;
    case 'NUMBER':
    case 'NUMBER_WITH_UNIT':
      return <InputNumber {...(rest as any)} style={{ width: '100%' }} addonAfter={unit} min={0} />;
    case 'CURRENCY':
      return <InputNumber<number> {...(rest as any)} style={{ width: '100%' }} addonAfter={unit || 'VND'} min={0} step={1000} formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')} parser={(v) => Number((v || '').replace(/\./g, ''))} />;
    case 'LONG_TEXT':
      return <Input.TextArea {...(rest as any)} rows={2} maxLength={1000} />;
    case 'SAFE_LINK':
      return <Input {...(rest as any)} placeholder="https://…" inputMode="url" />;
    case 'DATE':
      return <DatePicker {...(rest as any)} style={{ width: '100%' }} format="DD/MM/YYYY" />;
    case 'TIME':
      return <TimePicker {...(rest as any)} style={{ width: '100%' }} format="HH:mm" />;
    default:
      return <Input {...(rest as any)} maxLength={300} />;
  }
};

/** Chuyển đổi giá trị lưu <-> giá trị ô nhập cho các kiểu đặc biệt (boolean 3 trạng thái, ngày, giờ, khoảng). */
function itemProps(def: DynamicFieldDef) {
  switch (def.dataType) {
    case 'BOOLEAN_TRI_STATE':
      return {
        getValueProps: (v: unknown) => ({ value: v === true ? 'true' : v === false ? 'false' : 'null' }),
        normalize: (v: string) => (v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : undefined),
      };
    case 'DATE':
      return {
        getValueProps: (v: unknown) => ({ value: v ? dayjs(String(v)) : undefined }),
        normalize: (v: any) => (v ? dayjs(v).format('YYYY-MM-DD') : undefined),
      };
    case 'TIME':
      return {
        getValueProps: (v: unknown) => ({ value: v ? dayjs(String(v), 'HH:mm') : undefined }),
        normalize: (v: any) => (v ? dayjs(v).format('HH:mm') : undefined),
      };
    default:
      return {};
  }
}

/**
 * Form nhập TẤT CẢ trường động (do admin định nghĩa ở "Trường động"), nhóm theo fieldGroup.
 * Giá trị nằm ở values[namespace][fieldKey]; kiểu RANGE lưu {min,max}.
 */
export const DynamicFieldsForm: React.FC<DynamicFieldsFormProps> = ({ defs, namespace = 'dyn', compact, defaultCollapsed }) => {
  const groups = groupFieldDefs(defs);
  if (defs.length === 0) {
    return <Text type="secondary">Chưa có trường động nào cho danh mục này. Thêm ở mục Quản trị → Trường động.</Text>;
  }
  return (
    <Collapse
      defaultActiveKey={defaultCollapsed ? [] : groups.map((g) => g.key)}
      size={compact ? 'small' : 'middle'}
      items={groups.map((g) => ({
        key: g.key,
        label: (
          <span>
            <Text strong>{g.label}</Text> <Tag style={{ marginLeft: 6 }}>{g.defs.length}</Tag>
          </span>
        ),
        children: (
          <Row gutter={[12, 0]}>
            {g.defs.map((def) => {
              const wide = def.dataType === 'LONG_TEXT' || def.dataType === 'SELECT_MANY';
              if (def.dataType === 'RANGE') {
                return (
                  <Col xs={24} sm={12} key={def.key}>
                    <Form.Item label={def.label} tooltip={def.description || undefined} style={{ marginBottom: 12 }}>
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name={[namespace, def.key, 'min']} noStyle>
                            <InputNumber style={{ width: '100%' }} placeholder="từ" addonAfter={def.unit || undefined} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name={[namespace, def.key, 'max']} noStyle>
                            <InputNumber style={{ width: '100%' }} placeholder="đến" addonAfter={def.unit || undefined} />
                          </Form.Item>
                        </Col>
                      </Row>
                    </Form.Item>
                  </Col>
                );
              }
              return (
                <Col xs={24} sm={wide ? 24 : 12} lg={wide ? 12 : 8} key={def.key}>
                  <Form.Item
                    name={[namespace, def.key]}
                    label={def.label}
                    tooltip={def.description || undefined}
                    style={{ marginBottom: 12 }}
                    rules={def.dataType === 'SAFE_LINK' ? [{ type: 'url', message: 'Nhập đường dẫn đầy đủ (https://…)' }] : undefined}
                    {...itemProps(def)}
                  >
                    <FieldInput def={def} />
                  </Form.Item>
                </Col>
              );
            })}
          </Row>
        ),
      }))}
    />
  );
};

export default DynamicFieldsForm;
