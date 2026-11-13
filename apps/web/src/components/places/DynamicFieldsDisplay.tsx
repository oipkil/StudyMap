import React, { useEffect, useMemo, useState } from 'react';
import { Descriptions, Typography, Tag } from 'antd';
import axios from 'axios';
import { type DynamicFieldDef, type DynamicFieldValue, formatDynamicValue, groupFieldDefs, isEmptyValue, SIMPLE_DATA_TYPES } from '../../utils/dynamicFields';
import { Link2 } from 'lucide-react';

const { Title, Text } = Typography;

let cache: { at: number; defs: DynamicFieldDef[] } | null = null;

/** Nạp định nghĩa trường động công khai (cache 60s trong phiên). */
export function usePublicFieldDefs() {
  const [defs, setDefs] = useState<DynamicFieldDef[]>(cache?.defs ?? []);
  useEffect(() => {
    if (cache && Date.now() - cache.at < 60_000) return;
    axios
      .get('/api/v1/places/field-definitions')
      .then((res) => {
        const list: DynamicFieldDef[] = res.data?.data ?? [];
        cache = { at: Date.now(), defs: list };
        setDefs(list);
      })
      .catch(() => {});
  }, []);
  return defs;
}

interface Props {
  values: DynamicFieldValue[] | undefined | null;
  /** Ẩn tiêu đề nhóm lớn (dùng trong khung so sánh). */
  compact?: boolean;
}

/**
 * Hiển thị các trường động đã điền của một quán, nhóm theo fieldGroup (Không gian, Học tập, Đồ uống, Dịch vụ...).
 * Chỉ hiện ô có giá trị; trường nội bộ (isPublic=false) không có trong API công khai nên tự động bị ẩn.
 */
export const DynamicFieldsDisplay: React.FC<Props> = ({ values, compact }) => {
  const defs = usePublicFieldDefs();
  const groups = useMemo(() => {
    const byKey = new Map<string, unknown>();
    for (const v of Array.isArray(values) ? values : []) {
      if (v && v.fieldKey && !isEmptyValue(v.value)) byKey.set(v.fieldKey, v.value);
    }
    const filled = defs.filter((d) => SIMPLE_DATA_TYPES.has(d.dataType) && byKey.has(d.key));
    return groupFieldDefs(filled).map((g) => ({ ...g, items: g.defs.map((d) => ({ def: d, value: byKey.get(d.key) })) }));
  }, [defs, values]);

  if (groups.length === 0) return null;

  return (
    <div data-testid="dynamic-fields">
      {groups.map((g) => (
        <div key={g.key} style={{ marginTop: compact ? 12 : 20 }}>
          {compact ? (
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              {g.label}
            </Text>
          ) : (
            <Title level={5} style={{ margin: '0 0 8px' }}>
              {g.label}
            </Title>
          )}
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} styles={{ label: { width: compact ? 140 : 180, background: '#FAF9F6' } }}>
            {g.items.map(({ def, value }) => (
              <Descriptions.Item key={def.key} label={def.label}>
                {def.dataType === 'SAFE_LINK' ? (
                  <a href={String(value)} target="_blank" rel="noopener noreferrer nofollow">
                    <Link2 size="1em" /> {String(value).replace(/^https?:\/\//, '').slice(0, 40)}
                  </a>
                ) : def.dataType === 'SELECT_MANY' && Array.isArray(value) ? (
                  <span>
                    {value.map((v) => (
                      <Tag key={String(v)} style={{ marginBottom: 2 }}>
                        {String(v)}
                      </Tag>
                    ))}
                  </span>
                ) : def.dataType === 'BOOLEAN_TRI_STATE' ? (
                  <Text type={value === false ? 'secondary' : undefined} strong={value === true}>
                    {formatDynamicValue(def, value)}
                  </Text>
                ) : (
                  formatDynamicValue(def, value)
                )}
              </Descriptions.Item>
            ))}
          </Descriptions>
        </div>
      ))}
    </div>
  );
};

export default DynamicFieldsDisplay;
