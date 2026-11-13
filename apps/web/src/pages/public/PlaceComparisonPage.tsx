import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Typography, Button, Select, Tag, Rate, Empty, Spin, Grid, Tooltip } from 'antd';
import { Scale, X, Coffee, Plus, ArrowLeft, CircleCheck } from 'lucide-react';
import { WIFI_LABEL, SOCKET_LABEL, NOISE_LABEL, STUDY_LABEL, PARKING_LABEL, labelOf } from '../../utils/amenityLabels';
import { usePublicFieldDefs } from '../../components/places/DynamicFieldsDisplay';
import { formatDynamicValue, isEmptyValue, SIMPLE_DATA_TYPES } from '../../utils/dynamicFields';

const { Title, Text } = Typography;

const MAX = 4;
const NA = <Text type="secondary">—</Text>;
const RANK: Record<string, string[]> = {
  wifiQuality: ['NONE', 'WEAK', 'MODERATE', 'STRONG'],
  socketDensity: ['NONE', 'SPARSE', 'MANY', 'EVERY_TABLE'],
  noiseLevel: ['LOUD', 'MODERATE', 'QUIET', 'SILENT'],
  studySuitability: ['POOR', 'FAIR', 'GOOD', 'EXCELLENT'],
  motorcycleParking: ['NONE', 'PAID', 'FREE'],
};
const rank = (key: string, v: unknown) => (typeof v === 'string' && RANK[key] ? RANK[key].indexOf(v) : -1);
const tri = (v: unknown) => (v === true ? <Tag color="green" style={{ margin: 0 }}>Có</Tag> : v === false ? <Tag style={{ margin: 0 }}>Không</Tag> : NA);
const enumTag = (map: Record<string, string>, v: unknown) => {
  if (!v || v === 'UNKNOWN' || v === 'Chưa có thông tin') return NA;
  const label = labelOf(map, String(v));
  return <Tag color="green" style={{ margin: 0 }}>{label}</Tag>;
};

interface RowDef {
  key: string;
  label: string;
  hint?: string;
  render: (p: any) => React.ReactNode;
  /** Điểm để tô ô "tốt nhất" (cao hơn = tốt hơn); null = không xếp hạng. */
  score?: (p: any) => number | null;
}
interface RowGroup {
  key: string;
  label: string;
  rows: RowDef[];
}

const todayText = (p: any) => {
  if (p.is24h) return 'Mở 24/24';
  const dow = new Date().getDay();
  const d = (p.weeklySchedule || []).find((x: any) => x.dayOfWeek === dow);
  if (!d) return null;
  if (d.isClosed) return 'Hôm nay nghỉ';
  if (d.is24h) return 'Mở 24/24';
  const s = (d.shifts || []).map((sh: any) => `${sh.openTime}–${sh.closeTime}${sh.isOvernight ? ' (qua đêm)' : ''}`).join(', ');
  return s || null;
};

/**
 * So sánh quán: bảng tiêu chí (cột đầu dính trái), mỗi quán một cột, ô tốt nhất trong hàng được tô đậm.
 * Điện thoại: cùng bảng, cuộn ngang, cột tiêu chí hẹp và cố định — không còn ô ảnh khổng lồ / chữ bị cắt.
 * Tiêu chí lấy từ dữ liệu thật: giá, điểm, tiện ích học tập, giờ hôm nay và mọi trường động "cho phép so sánh".
 */
export const PlaceComparisonPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const navigate = useNavigate();
  const defs = usePublicFieldDefs();

  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [places, setPlaces] = useState<any[]>([]);
  const [allPlaces, setAllPlaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = (searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, MAX);
    setPlaceIds(ids);
  }, [searchParams]);

  useEffect(() => {
    axios
      .get('/api/v1/places?limit=100')
      .then((res) => res.data.success && setAllPlaces(res.data.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (placeIds.length === 0) return setPlaces([]);
    setLoading(true);
    axios
      .get(`/api/v1/places/compare?ids=${placeIds.join(',')}`)
      .then((res) => {
        const list: any[] = res.data.success ? res.data.data || [] : [];
        // Giữ đúng thứ tự người dùng chọn
        setPlaces(placeIds.map((id) => list.find((p) => p.placeId === id || p.id === id)).filter(Boolean));
      })
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, [placeIds]);

  const setIds = (ids: string[]) => setSearchParams(ids.length ? { ids: ids.join(',') } : {});
  const add = (id: string) => id && !placeIds.includes(id) && placeIds.length < MAX && setIds([...placeIds, id]);
  const remove = (id: string) => setIds(placeIds.filter((x) => x !== id));

  const groups: RowGroup[] = useMemo(() => {
    const priceOf = (p: any) => (typeof p.priceMin === 'number' ? p.priceMin : null);
    const base: RowGroup[] = [
      {
        key: 'overview',
        label: 'Tổng quan',
        rows: [
          {
            key: 'rating',
            label: 'Điểm đánh giá',
            render: (p) =>
              p.reviewCount > 0 && p.ratingOverall > 0 ? (
                <span style={{ whiteSpace: 'nowrap' }}>
                  <Rate disabled allowHalf value={p.ratingOverall} style={{ fontSize: 12, color: '#C67D34' }} />{' '}
                  <Text strong>{Number(p.ratingOverall).toFixed(1)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {' '}
                    ({p.reviewCount})
                  </Text>
                </span>
              ) : (
                <Text type="secondary">Chưa có đánh giá</Text>
              ),
            score: (p) => (p.reviewCount > 0 ? Number(p.ratingOverall) : null),
          },
          {
            key: 'price',
            label: 'Khoảng giá',
            hint: 'Thấp hơn được tô',
            render: (p) => (p.priceMin != null || p.priceMax != null ? <Text strong>{[p.priceMin, p.priceMax].filter((x) => x != null).map((x) => Number(x).toLocaleString('vi-VN')).join(' – ')}đ</Text> : NA),
            score: (p) => (priceOf(p) != null ? -priceOf(p)! : null),
          },
          { key: 'discount', label: 'Ưu đãi sinh viên', render: (p) => (p.studentDiscountDetails ? <Text>{p.studentDiscountDetails}</Text> : NA), score: (p) => (p.studentDiscountDetails ? 1 : 0) },
          { key: 'category', label: 'Loại hình', render: (p) => (p.category?.name ? <Tag style={{ margin: 0 }}>{p.category.name}</Tag> : NA) },
          { key: 'campus', label: 'Gần trường', render: (p) => (p.campus?.name ? <Text>{p.campus.name}</Text> : NA) },
          { key: 'address', label: 'Địa chỉ', render: (p) => (p.address ? <Text style={{ fontSize: 13 }}>{p.address}</Text> : NA) },
        ],
      },
      {
        key: 'hours',
        label: 'Giờ mở cửa',
        rows: [
          {
            key: 'today',
            label: 'Hôm nay',
            render: (p) => {
              const t = todayText(p);
              const open = p.openStatus?.isOpen;
              return t ? (
                <span>
                  {open === true && <Tag color="green" style={{ margin: '0 6px 0 0' }}>Đang mở</Tag>}
                  {open === false && <Tag style={{ margin: '0 6px 0 0' }}>Đang đóng</Tag>}
                  <Text>{t}</Text>
                </span>
              ) : (
                NA
              );
            },
            score: (p) => (p.is24h ? 2 : p.openStatus?.isOpen ? 1 : null),
          },
        ],
      },
      {
        key: 'study',
        label: 'Tiện ích học tập',
        rows: [
          { key: 'wifi', label: 'Wi-Fi', render: (p) => enumTag(WIFI_LABEL, p.amenities?.wifiQuality), score: (p) => (rank('wifiQuality', p.amenities?.wifiQuality) >= 0 ? rank('wifiQuality', p.amenities?.wifiQuality) : null) },
          { key: 'socket', label: 'Ổ cắm điện', render: (p) => enumTag(SOCKET_LABEL, p.amenities?.socketDensity), score: (p) => (rank('socketDensity', p.amenities?.socketDensity) >= 0 ? rank('socketDensity', p.amenities?.socketDensity) : null) },
          { key: 'noise', label: 'Độ ồn', render: (p) => enumTag(NOISE_LABEL, p.amenities?.noiseLevel), score: (p) => (rank('noiseLevel', p.amenities?.noiseLevel) >= 0 ? rank('noiseLevel', p.amenities?.noiseLevel) : null) },
          { key: 'studyfit', label: 'Phù hợp học bài', render: (p) => enumTag(STUDY_LABEL, p.amenities?.studySuitability), score: (p) => (rank('studySuitability', p.amenities?.studySuitability) >= 0 ? rank('studySuitability', p.amenities?.studySuitability) : null) },
          { key: 'group', label: 'Học nhóm', render: (p) => tri(p.amenities?.groupStudyAllowed), score: (p) => (p.amenities?.groupStudyAllowed === true ? 1 : p.amenities?.groupStudyAllowed === false ? 0 : null) },
          { key: 'ac', label: 'Máy lạnh', render: (p) => tri(p.amenities?.airConditioned), score: (p) => (p.amenities?.airConditioned === true ? 1 : p.amenities?.airConditioned === false ? 0 : null) },
          { key: 'parking', label: 'Gửi xe máy', render: (p) => enumTag(PARKING_LABEL, p.amenities?.motorcycleParking), score: (p) => (rank('motorcycleParking', p.amenities?.motorcycleParking) >= 0 ? rank('motorcycleParking', p.amenities?.motorcycleParking) : null) },
          { key: 'rooms', label: 'Phòng riêng', render: (p) => (typeof p.amenities?.privateRoomsCount === 'number' && p.amenities.privateRoomsCount > 0 ? <Text strong>{p.amenities.privateRoomsCount} phòng</Text> : NA), score: (p) => (typeof p.amenities?.privateRoomsCount === 'number' ? p.amenities.privateRoomsCount : null) },
        ],
      },
    ];
    // Trường động "cho phép so sánh" — chỉ hiện hàng có ít nhất một quán điền; nhóm theo fieldGroup
    const byKey = new Map<string, any[]>();
    for (const p of places) for (const v of p.dynamicFieldValues || []) if (v?.fieldKey && !isEmptyValue(v.value)) byKey.set(v.fieldKey, [...(byKey.get(v.fieldKey) || []), v]);
    const comparable = defs.filter((d) => SIMPLE_DATA_TYPES.has(d.dataType) && byKey.has(d.key));
    const groupMap = new Map<string, RowGroup>();
    for (const def of comparable) {
      const gk = def.group?.key || '_other';
      if (!groupMap.has(gk)) groupMap.set(gk, { key: 'dyn-' + gk, label: def.group?.label || 'Thông tin khác', rows: [] });
      const lowerBetter = /price|fee|spend|cost|distance|max_sitting/.test(def.key);
      groupMap.get(gk)!.rows.push({
        key: 'dyn-' + def.key,
        label: def.label,
        render: (p) => {
          const v = (p.dynamicFieldValues || []).find((x: any) => x.fieldKey === def.key)?.value;
          if (isEmptyValue(v)) return NA;
          if (def.dataType === 'BOOLEAN_TRI_STATE') return tri(v);
          if (def.dataType === 'SAFE_LINK')
            return (
              <a href={String(v)} target="_blank" rel="noopener noreferrer nofollow">
                Mở link
              </a>
            );
          return <Text>{formatDynamicValue(def, v)}</Text>;
        },
        score: def.isComparable
          ? (p) => {
              const v = (p.dynamicFieldValues || []).find((x: any) => x.fieldKey === def.key)?.value;
              if (isEmptyValue(v)) return null;
              if (def.dataType === 'BOOLEAN_TRI_STATE') return v === true ? 1 : v === false ? 0 : null;
              if (typeof v === 'number') return lowerBetter ? -v : v;
              if (def.dataType === 'SELECT_ONE' && def.options?.length) return def.options.indexOf(String(v));
              return null;
            }
          : undefined,
      });
    }
    return [...base, ...Array.from(groupMap.values())];
  }, [places, defs]);

  /** Chỉ số cột "tốt nhất" của một hàng (cần ≥2 quán có điểm và có duy nhất một max). */
  const bestOf = (row: RowDef): Set<number> => {
    if (!row.score || places.length < 2) return new Set();
    const scores = places.map((p) => row.score!(p));
    const valid = scores.filter((s): s is number => typeof s === 'number');
    if (valid.length < 2) return new Set();
    const max = Math.max(...valid);
    if (valid.every((s) => s === max)) return new Set();
    return new Set(scores.map((s, i) => (s === max ? i : -1)).filter((i) => i >= 0));
  };

  const options = allPlaces.filter((p) => !placeIds.includes(p.placeId || p.id)).map((p) => ({ value: p.placeId || p.id, label: p.name }));
  // Cột quán cỡ cố định (không kéo giãn theo màn hình) để ảnh/tiêu đề gọn dù chỉ so 2 quán
  const colW = isMobile ? 168 : 280;
  const firstW = isMobile ? 112 : 200;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <Button type="text" icon={<ArrowLeft size="1em" />} onClick={() => navigate('/')} style={{ marginLeft: -8 }}>
            Khám phá
          </Button>
          <Title level={isMobile ? 4 : 3} style={{ margin: '4px 0 0', color: '#3E2415', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Scale size={22} color="#6F4E37" /> So sánh góc học & cà phê
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Chọn 2–{MAX} quán. Ô màu kem ấm là quán có tiện ích hỗ trợ học tập tốt hơn ở tiêu chí đó.
          </Text>
        </div>
        <Select
          showSearch
          value={null}
          placeholder={placeIds.length >= MAX ? `Đã đủ ${MAX} quán` : 'Thêm quán để so sánh…'}
          disabled={placeIds.length >= MAX}
          optionFilterProp="label"
          options={options}
          onSelect={(v) => add(String(v))}
          style={{ width: isMobile ? '100%' : 320 }}
          suffixIcon={<Plus size={14} />}
          data-testid="compare-add"
        />
      </div>

      {placeIds.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {places.map((p) => (
            <Tag key={p.placeId} closable onClose={() => remove(p.placeId)} closeIcon={<X size={12} />} style={{ margin: 0, padding: '2px 8px', fontSize: 13, borderRadius: 6 }}>
              {p.name}
            </Tag>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : places.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có quán nào để so sánh. Chọn quán ở ô trên, hoặc bấm 'So sánh' trên thẻ quán ở trang Khám phá." style={{ padding: '48px 0' }}>
          <Button type="primary" onClick={() => navigate('/')}>
            Về trang khám phá
          </Button>
        </Empty>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #EAE3D9', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 18px rgba(74, 46, 24, 0.05)' }}>
          {places.length === 1 && (
            <div style={{ padding: '8px 12px', background: '#FAF7F2', borderBottom: '1px solid #EAE3D9', fontSize: 13, color: '#6F4E37' }}>Thêm quán thứ hai để thấy ô vượt trội được tô nổi bật.</div>
          )}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} data-testid="compare-table">
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: firstW + colW * places.length, maxWidth: '100%', minWidth: isMobile ? firstW + colW * places.length : undefined, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: firstW }} />
                {places.map((p) => (
                  <col key={p.placeId} style={{ width: colW }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 3, background: '#FAF7F2', borderBottom: '1px solid #EAE3D9', borderRight: '1px solid #EAE3D9', padding: 10, textAlign: 'left', verticalAlign: 'bottom' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Tiêu chí học tập
                    </Text>
                  </th>
                  {places.map((p) => (
                    <th key={p.placeId} style={{ borderBottom: '1px solid #EAE3D9', padding: isMobile ? 8 : 12, textAlign: 'left', verticalAlign: 'top', fontWeight: 400 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <Link to={`/places/${p.slug}`} className="group photo-zoom-container" style={{ display: 'block', borderRadius: 8, overflow: 'hidden', background: '#FAF7F2', aspectRatio: '16 / 9', maxHeight: 150, border: '1px solid #EAE3D9' }}>
                          {p.coverPhoto?.thumbUrl ? (
                            <img src={p.coverPhoto.thumbUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s ease' }} />
                          ) : (
                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8C5326', fontSize: 12, gap: 4 }}>
                              <Coffee size={16} /> Chưa có ảnh
                            </div>
                          )}
                        </Link>
                        <Link to={`/places/${p.slug}`} style={{ color: '#261C14', fontWeight: 600, fontSize: isMobile ? 13 : 15, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={p.name}>
                          {p.name}
                        </Link>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Button size="small" onClick={() => navigate(`/places/${p.slug}`)} style={{ borderRadius: 6, borderColor: '#EAE3D9', color: '#4A2E18', fontSize: 12 }}>
                            Chi tiết
                          </Button>
                          <Tooltip title="Bỏ khỏi so sánh">
                            <Button size="small" type="text" icon={<X size={14} style={{ verticalAlign: 'middle' }} />} onClick={() => remove(p.placeId)} aria-label="Bỏ khỏi so sánh" />
                          </Tooltip>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <React.Fragment key={g.key}>
                    <tr>
                      <td colSpan={places.length + 1} style={{ padding: '8px 10px', background: '#F5EFEB', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6F4E37', position: 'sticky', left: 0 }}>
                        {g.label}
                      </td>
                    </tr>
                    {g.rows.map((row) => {
                      const best = bestOf(row);
                      return (
                        <tr key={row.key}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #F4ECE4', borderRight: '1px solid #EAE3D9', padding: isMobile ? '8px 10px' : '10px 12px', verticalAlign: 'top' }}>
                            <Text strong style={{ fontSize: isMobile ? 12.5 : 14 }}>
                              {row.label}
                            </Text>
                            {row.hint && !isMobile && (
                              <div>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                  {row.hint}
                                </Text>
                              </div>
                            )}
                          </td>
                          {places.map((p, i) => (
                            <td key={p.placeId} style={{ borderBottom: '1px solid #F4ECE4', padding: isMobile ? '8px 10px' : '10px 12px', verticalAlign: 'top', background: best.has(i) ? '#F9F4EE' : undefined, fontSize: isMobile ? 13 : 14 }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                {best.has(i) && <CircleCheck size="1em" style={{ color: '#2D5A43', marginTop: 3, flexShrink: 0 }} aria-label="Tốt hơn" />}
                                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{row.render(p)}</div>
                              </div>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaceComparisonPage;
