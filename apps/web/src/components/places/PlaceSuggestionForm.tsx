import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Select, Switch, Button, Space, Alert, Typography, Segmented, TimePicker, Grid, message } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { PlaceSearchInput } from '../map/PlaceSearchInput';
import { SelectWithOther, OTHER_VALUE } from '../common/SelectWithOther';
import { LocationPickerMap } from '../map/LocationPickerMap';
import { PhotoStrip, readyAssetIds, hasPhotoInFlight, type StripPhoto } from '../media/PhotoStrip';
import { DynamicFieldsForm } from '../admin/DynamicFieldsForm';
import { usePublicFieldDefs } from './DynamicFieldsDisplay';
import { appliesToCategory, isEmptyValue, SIMPLE_DATA_TYPES } from '../../utils/dynamicFields';
import { WIFI_LABEL, SOCKET_LABEL, NOISE_LABEL, STUDY_LABEL, PARKING_LABEL } from '../../utils/amenityLabels';
import { TriangleAlert, CircleCheck, Clock } from 'lucide-react';

const { Text, Title } = Typography;

interface PlaceSuggestionFormProps {
  onSubmitted: () => void;
  onCancel?: () => void;
  /** Đề xuất cũ cần sửa & gửi lại (trạng thái "Cần bổ sung" / bản nháp) — form nạp sẵn dữ liệu, gửi bằng PUT. */
  editing?: any | null;
}

const opts = (map: Record<string, string>, order: string[]) => order.map((v) => ({ value: v, label: map[v] }));
const TRI = [
  { label: 'Có', value: 'true' },
  { label: 'Không', value: 'false' },
  { label: 'Chưa rõ', value: 'null' },
];
const triProps = {
  getValueProps: (v: unknown) => ({ value: v === true ? 'true' : v === false ? 'false' : 'null' }),
  normalize: (v: string) => (v === 'true' ? true : v === 'false' ? false : null),
};

const Section: React.FC<{ n: number; title: string; hint?: string; mobile?: boolean; id?: string; children: React.ReactNode }> = ({ n, title, hint, mobile, id, children }) => (
  <section id={id} style={{ marginBottom: mobile ? 16 : 24, padding: mobile ? '12px 12px 4px' : '16px 18px 6px', background: '#FAF9F6', border: '1px solid #EEECE7', borderRadius: 12, scrollMarginTop: 72 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#2F6B4F', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <Title level={5} style={{ margin: 0, fontSize: mobile ? 16 : 17, lineHeight: 1.3 }}>
          {title}
        </Title>
        {hint && (
          <Text type="secondary" style={{ fontSize: 12.5, lineHeight: 1.4, display: 'block', marginTop: 2 }}>
            {hint}
          </Text>
        )}
      </div>
    </div>
    {children}
  </section>
);

/**
 * Form đề xuất quán mới cho sinh viên — cùng bộ trường như form của admin (tên chọn từ bản đồ, vị trí kéo ghim,
 * giờ, giá, tiện ích học tập, mọi trường động, ảnh) nhưng xếp thành một trang cuộn 7 mục, chỉ 4 ô bắt buộc.
 * Dữ liệu gửi vào `initialData`; admin duyệt là quán lên bản đồ với đúng những gì sinh viên điền.
 */
export const PlaceSuggestionForm: React.FC<PlaceSuggestionFormProps> = ({ onSubmitted, onCancel, editing }) => {
  const [form] = Form.useForm();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [categories, setCategories] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [photos, setPhotos] = useState<StripPhoto[]>([]);
  const [dupes, setDupes] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const defs = usePublicFieldDefs();
  const categoryId = Form.useWatch('categoryId', form);
  const is24h = Form.useWatch('is24h', form);
  const coords = Form.useWatch(['latitude'], form);
  const coordsLng = Form.useWatch(['longitude'], form);
  const nameVal = Form.useWatch('proposedName', form);
  const campusVal = Form.useWatch('campusId', form);
  const OTHER = OTHER_VALUE;
  const addrVal = Form.useWatch('addressDescription', form);
  // Checklist 4 ô bắt buộc — người dùng thấy ngay còn thiếu gì, nút gửi nói rõ số mục còn thiếu
  const required = [
    { key: 'name', label: 'Tên quán', ok: Boolean(nameVal && String(nameVal).trim().length >= 2), target: 'sugg-sec-1' },
    { key: 'cat', label: 'Loại hình', ok: Boolean(categoryId), target: 'sugg-sec-1' },
    { key: 'addr', label: 'Địa chỉ', ok: Boolean(addrVal && String(addrVal).trim().length >= 5), target: 'sugg-sec-1' },
    { key: 'loc', label: 'Vị trí trên bản đồ', ok: coords != null && coordsLng != null, target: 'sugg-sec-1' },
  ];
  const missing = required.filter((r) => !r.ok);

  useEffect(() => {
    axios
      .get('/api/v1/places/meta')
      .then((r) => {
        setCategories(r.data?.data?.categories || []);
        setCampuses(r.data?.data?.campuses || []);
      })
      .catch(() => {});
  }, []);

  // Nạp lại dữ liệu đề xuất cũ khi sửa
  useEffect(() => {
    if (!editing) return;
    const d = editing.initialData || {};
    const am = d.amenities || {};
    const sch = d.schedule || {};
    form.setFieldsValue({
      proposedName: editing.proposedName,
      categoryId: d.categoryOther ? OTHER : editing.categoryId,
      categoryOther: d.categoryOther,
      campusId: d.campusOther ? OTHER : d.nearestCampusId || editing.campusId || undefined,
      campusOther: d.campusOther,
      addressDescription: editing.addressDescription,
      latitude: d.latitude,
      longitude: d.longitude,
      is24h: Boolean(sch.is24h),
      openTime: sch.openTime ? dayjs(sch.openTime, 'HH:mm') : undefined,
      closeTime: sch.closeTime ? dayjs(sch.closeTime, 'HH:mm') : undefined,
      isOvernight: Boolean(sch.isOvernight),
      priceMin: d.priceMin != null && d.priceMin !== '' ? Number(d.priceMin) : undefined,
      priceMax: d.priceMax != null && d.priceMax !== '' ? Number(d.priceMax) : undefined,
      studentDiscountDetails: d.studentDiscountDetails,
      am_wifiQuality: am.wifiQuality && am.wifiQuality !== 'UNKNOWN' ? am.wifiQuality : undefined,
      am_socketDensity: am.socketDensity && am.socketDensity !== 'UNKNOWN' ? am.socketDensity : undefined,
      am_noiseLevel: am.noiseLevel && am.noiseLevel !== 'UNKNOWN' ? am.noiseLevel : undefined,
      am_studySuitability: am.studySuitability && am.studySuitability !== 'UNKNOWN' ? am.studySuitability : undefined,
      am_motorcycleParking: am.motorcycleParking && am.motorcycleParking !== 'UNKNOWN' ? am.motorcycleParking : undefined,
      am_privateRoomsCount: am.privateRoomsCount || undefined,
      am_groupStudyAllowed: am.groupStudyAllowed ?? null,
      am_airConditioned: am.airConditioned ?? null,
      dyn: d.dyn || {},
      shortDescription: d.shortDescription,
      phone: d.phone,
      website: d.website,
      otherNotes: d.otherNotes,
    });
  }, [editing, form]);

  const dynDefs = useMemo(() => defs.filter((d) => SIMPLE_DATA_TYPES.has(d.dataType) && appliesToCategory(d, categoryId === OTHER ? categories[0]?.id : categoryId)), [defs, categoryId, categories]);

  // Cảnh báo trùng tên (không chặn — chi nhánh khác vẫn gửi được)
  let dupTimer: any;
  const checkDuplicate = (name: string) => {
    clearTimeout(dupTimer);
    if (!name || name.trim().length < 2) return setDupes([]);
    dupTimer = setTimeout(async () => {
      try {
        const res = await axios.get(`/api/v1/places/suggestions/check-duplicate?name=${encodeURIComponent(name)}`);
        setDupes(res.data?.data || []);
      } catch {
        setDupes([]);
      }
    }, 400);
  };

  const suggestCampus = (lat: number, lng: number) => {
    if (form.getFieldValue('campusId') || !campuses.length) return;
    const d = (c: any) => Math.hypot((c.latitude - lat) * 111, (c.longitude - lng) * 111 * Math.cos((lat * Math.PI) / 180));
    const nearest = [...campuses].sort((x, y) => d(x) - d(y))[0];
    if (nearest && d(nearest) <= 5) form.setFieldsValue({ campusId: nearest.id });
  };

  const submit = async (isDraft: boolean) => {
    let v: any;
    try {
      await form.validateFields();
      // Lấy cả giá trị trong nhóm trường động đang gập (validateFields chỉ trả ô đang hiển thị)
      v = form.getFieldsValue(true);
    } catch {
      message.warning('Còn ô bắt buộc chưa điền — xem phần đánh dấu đỏ');
      return;
    }
    if (!isDraft && (v.latitude == null || v.longitude == null)) {
      message.warning('Chọn vị trí quán trên bản đồ (mục 1) trước khi gửi duyệt');
      return;
    }
    if (hasPhotoInFlight(photos)) {
      message.info('Đang tải ảnh lên, đợi xong rồi gửi');
      return;
    }
    setSubmitting(true);
    try {
      const dyn: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v.dyn || {})) if (!isEmptyValue(val)) dyn[k] = val;
      const categoryIsOther = v.categoryId === OTHER;
      const campusIsOther = v.campusId === OTHER;
      // Loại hình khác: API cần một danh mục hợp lệ -> tạm dùng danh mục đầu tiên, admin chọn lại khi duyệt (có cảnh báo)
      const categoryIdToSend = categoryIsOther ? categories[0]?.id : v.categoryId;
      const initialData = {
        latitude: v.latitude,
        longitude: v.longitude,
        nearestCampusId: campusIsOther ? undefined : v.campusId || undefined,
        campusOther: campusIsOther ? v.campusOther : undefined,
        categoryOther: categoryIsOther ? v.categoryOther : undefined,
        shortDescription: v.shortDescription || undefined,
        phone: v.phone || undefined,
        website: v.website || undefined,
        priceMin: v.priceMin ?? undefined,
        priceMax: v.priceMax ?? undefined,
        studentDiscountDetails: v.studentDiscountDetails || undefined,
        schedule: { is24h: Boolean(v.is24h), openTime: v.openTime ? dayjs(v.openTime).format('HH:mm') : undefined, closeTime: v.closeTime ? dayjs(v.closeTime).format('HH:mm') : undefined, isOvernight: Boolean(v.isOvernight) },
        amenities: {
          wifiQuality: v.am_wifiQuality || 'UNKNOWN',
          socketDensity: v.am_socketDensity || 'UNKNOWN',
          noiseLevel: v.am_noiseLevel || 'UNKNOWN',
          studySuitability: v.am_studySuitability || 'UNKNOWN',
          motorcycleParking: v.am_motorcycleParking || 'UNKNOWN',
          groupStudyAllowed: v.am_groupStudyAllowed ?? null,
          airConditioned: v.am_airConditioned ?? null,
          privateRoomsCount: v.am_privateRoomsCount ?? 0,
        },
        dyn,
        // Ảnh cũ (khi sửa) + ảnh mới tải trong lần này
        galleryAssetIds: [...((editing?.initialData?.galleryAssetIds as string[] | undefined) || []), ...readyAssetIds(photos)],
        otherNotes: v.otherNotes || undefined,
      };
      const res = editing
        ? await axios.put(`/api/v1/me/contributions/suggestions/${editing.id}`, { proposedName: v.proposedName, addressDescription: v.addressDescription, initialData })
        : await axios.post('/api/v1/places/suggestions', {
            proposedName: v.proposedName,
            categoryId: categoryIdToSend,
            addressDescription: v.addressDescription,
            campusId: campusIsOther ? null : v.campusId || null,
            initialData,
            isDraft,
          });
      if (res.data.success) {
        message.success(editing ? 'Đã gửi lại đề xuất, chờ ban quản trị duyệt' : isDraft ? 'Đã lưu bản nháp — bạn có thể sửa và gửi lại ở tab Đóng góp' : 'Đã gửi đề xuất. Ban quản trị duyệt xong là quán lên bản đồ với đúng thông tin bạn điền.');
        form.resetFields();
        setPhotos([]);
        onSubmitted();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Có lỗi xảy ra khi gửi đề xuất');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" size={isMobile ? 'middle' : 'large'} initialValues={{ is24h: false, am_groupStudyAllowed: null, am_airConditioned: null }} data-testid="suggestion-form" style={{ fontSize: 15 }}>
      {/* Checklist bắt buộc: bấm vào mục để cuộn tới */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }} data-testid="suggestion-checklist">
        <Text type="secondary" style={{ fontSize: 12, marginRight: 2 }}>
          Bắt buộc:
        </Text>
        {required.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => document.getElementById(r.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid ' + (r.ok ? '#B7DFC9' : '#E8E6E1'), background: r.ok ? '#EEF6F1' : '#fff', color: r.ok ? '#2F6B4F' : '#6F6B66', borderRadius: 999, padding: '2px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            {r.ok ? <CircleCheck size="1em" /> : <Clock size="1em" />} {r.label}
          </button>
        ))}
        <Text type="secondary" style={{ fontSize: 12 }}>
          · phần còn lại tuỳ chọn
        </Text>
      </div>
      <Section n={1} id="sugg-sec-1" mobile={isMobile} title="Quán ở đâu?" hint="Đặt tên, gõ địa chỉ rồi chọn dòng gợi ý — ghim và trường gần nhất tự điền.">
        <Form.Item name="proposedName" label="Tên quán" rules={[{ required: true, min: 2, message: 'Nhập tên quán' }]}>
          <Input placeholder="Ví dụ: Bamos Coffee" maxLength={150} onChange={(e) => checkDuplicate(e.target.value)} />
        </Form.Item>
        {dupes.length > 0 && (
          <Alert
            type="warning"
            showIcon
            icon={<TriangleAlert size="1em" />}
            style={{ marginBottom: 12 }}
            title="Có quán tên gần giống đã có trên hệ thống"
            description={
              <div>
                {dupes.map((d) => (
                  <div key={d.id}>
                    <Text strong>{d.name}</Text> — {d.address}
                  </div>
                ))}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Nếu là chi nhánh khác, bạn vẫn gửi được.
                </Text>
              </div>
            }
          />
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: isMobile ? 0 : 12 }}>
          <Form.Item name="categoryId" label="Loại hình" rules={[{ required: true, message: 'Chọn loại hình quán' }]} style={{ minWidth: 0 }}>
            <SelectWithOther placeholder="Café học bài, quán ăn, không gian học…" style={{ width: '100%' }} options={categories.map((c) => ({ value: c.id, label: c.name }))} otherLabel="Loại hình khác (ghi rõ bên dưới)" otherButtonText="Không có loại hình phù hợp" otherTestId="suggest-category-other" />
          </Form.Item>
          <Form.Item name="campusId" label="Gần trường / cơ sở nào?" tooltip="Tự gợi ý theo vị trí; đổi nếu chưa đúng. Không có trong danh sách thì chọn 'Trường khác'." style={{ minWidth: 0 }}>
            <SelectWithOther allowClear showSearch optionFilterProp="label" placeholder="Chọn trường gần nhất" style={{ width: '100%' }} options={campuses.map((c) => ({ value: c.id, label: c.universityName ? `${c.name} — ${c.universityName}` : c.name }))} otherLabel="Trường khác — không có trong danh sách" otherButtonText="Trường gần quán không có trong danh sách" otherTestId="suggest-campus-other" />
          </Form.Item>
        </div>
        {categoryId === OTHER && (
          <Form.Item name="categoryOther" label="Loại hình đó là gì?" rules={[{ required: true, min: 2, message: 'Ghi rõ loại hình' }]} extra="Ban quản trị sẽ xếp vào danh mục phù hợp hoặc tạo danh mục mới.">
            <Input placeholder="Ví dụ: Thư viện tư nhân, coworking, tiệm bánh có chỗ ngồi học…" maxLength={100} />
          </Form.Item>
        )}
        {campusVal === OTHER && (
          <Form.Item name="campusOther" label="Tên trường / cơ sở gần quán" rules={[{ required: true, min: 2, message: 'Ghi tên trường' }]} extra="Ban quản trị sẽ thêm cơ sở này vào danh sách rồi gắn cho quán.">
            <Input placeholder="Ví dụ: ĐH Hutech - cơ sở Ung Văn Khiêm" maxLength={150} />
          </Form.Item>
        )}
        <Form.Item name="addressDescription" label="Địa chỉ" rules={[{ required: true, min: 5, message: 'Nhập địa chỉ rồi chọn từ gợi ý' }]} extra={isMobile ? 'Gõ số nhà + tên đường rồi chọn dòng gợi ý. Không thấy gợi ý? Bấm/kéo ghim trên bản đồ, địa chỉ tự điền.' : 'Gõ số nhà + tên đường (hoặc dán link Google Maps) rồi chọn đúng dòng gợi ý — ghim trên bản đồ tự nhảy tới. Không thấy gợi ý? Bấm hoặc kéo ghim trên bản đồ, địa chỉ sẽ tự điền theo vị trí.'}>
          <PlaceSearchInput
            placeholder="Ví dụ: 74A Lã Xuân Oai, Tăng Nhơn Phú"
            searchIcon
            onPick={(hit) => {
              form.setFieldsValue({ addressDescription: hit.address || hit.name, latitude: hit.latitude, longitude: hit.longitude });
              suggestCampus(hit.latitude, hit.longitude);
            }}
          />
        </Form.Item>
        <Form.Item label="Vị trí trên bản đồ" required tooltip="Bấm lên bản đồ hoặc kéo ghim nếu chưa đúng chỗ; đang ở quán thì bấm Vị trí của tôi. Địa chỉ ở ô trên đổi theo ghim.">
          <LocationPickerMap
            value={coords != null && coordsLng != null ? { latitude: Number(coords), longitude: Number(coordsLng) } : null}
            showSearch={false}
            height={isMobile ? 220 : 320}
            onChange={(pos, meta) => {
              form.setFieldsValue({ latitude: pos.latitude, longitude: pos.longitude });
              // Kéo ghim / bấm bản đồ / GPS -> địa chỉ đổi theo vị trí mới
              if (meta.address) form.setFieldsValue({ addressDescription: meta.address });
              suggestCampus(pos.latitude, pos.longitude);
            }}
          />
          <Form.Item name="latitude" hidden>
            <InputNumber />
          </Form.Item>
          <Form.Item name="longitude" hidden>
            <InputNumber />
          </Form.Item>
        </Form.Item>
      </Section>

      <Section n={2} mobile={isMobile} title="Giờ mở cửa" hint="Không chắc thì để trống — đừng đoán.">
        <Space size={isMobile ? 10 : 16} wrap align="center">
          <Form.Item name="is24h" label="Mở 24/24" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
          {!is24h && (
            <>
              <Form.Item name="openTime" label="Mở cửa" style={{ marginBottom: 0 }}>
                <TimePicker format="HH:mm" minuteStep={15} placeholder="07:00" />
              </Form.Item>
              <Form.Item name="closeTime" label="Đóng cửa" style={{ marginBottom: 0 }}>
                <TimePicker format="HH:mm" minuteStep={15} placeholder="22:00" />
              </Form.Item>
              <Form.Item name="isOvernight" label="Qua đêm" valuePropName="checked" tooltip="Đóng cửa sau nửa đêm (ví dụ 20:00 → 02:00)" style={{ marginBottom: 0 }}>
                <Switch />
              </Form.Item>
            </>
          )}
        </Space>
      </Section>

      <Section n={3} mobile={isMobile} title="Giá & ưu đãi">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr) minmax(0,2fr)', gap: isMobile ? 8 : 12 }}>
          <Form.Item name="priceMin" label="Giá thấp nhất (đ)">
            <InputNumber<number> min={0} step={5000} style={{ width: '100%' }} placeholder="20.000" formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')} parser={(v) => Number((v || '').replace(/\./g, ''))} />
          </Form.Item>
          <Form.Item name="priceMax" label="Giá cao nhất (đ)">
            <InputNumber<number> min={0} step={5000} style={{ width: '100%' }} placeholder="60.000" formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')} parser={(v) => Number((v || '').replace(/\./g, ''))} />
          </Form.Item>
          <Form.Item name="studentDiscountDetails" label="Ưu đãi sinh viên (nếu có)" style={{ gridColumn: isMobile ? '1 / -1' : undefined }}>
            <Input placeholder="Ví dụ: Giảm 10% khi có thẻ SV" />
          </Form.Item>
        </div>
      </Section>

      <Section n={4} mobile={isMobile} title="Tiện ích học tập" hint="Điều sinh viên hay hỏi nhất. Không chắc thì bỏ qua.">
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'repeat(3, minmax(0,1fr))', gap: isMobile ? 0 : 12 }}>
          <Form.Item name="am_wifiQuality" label="Wi-Fi">
            <Select allowClear placeholder="Chưa rõ" options={opts(WIFI_LABEL, ['NONE', 'WEAK', 'MODERATE', 'STRONG'])} />
          </Form.Item>
          <Form.Item name="am_socketDensity" label="Ổ cắm điện">
            <Select allowClear placeholder="Chưa rõ" options={opts(SOCKET_LABEL, ['NONE', 'SPARSE', 'MANY', 'EVERY_TABLE'])} />
          </Form.Item>
          <Form.Item name="am_noiseLevel" label="Độ ồn">
            <Select allowClear placeholder="Chưa rõ" options={opts(NOISE_LABEL, ['SILENT', 'QUIET', 'MODERATE', 'LOUD'])} />
          </Form.Item>
          <Form.Item name="am_studySuitability" label="Phù hợp học bài">
            <Select allowClear placeholder="Chưa rõ" options={opts(STUDY_LABEL, ['POOR', 'FAIR', 'GOOD', 'EXCELLENT'])} />
          </Form.Item>
          <Form.Item name="am_motorcycleParking" label="Gửi xe máy">
            <Select allowClear placeholder="Chưa rõ" options={opts(PARKING_LABEL, ['FREE', 'PAID', 'NONE'])} />
          </Form.Item>
          <Form.Item name="am_privateRoomsCount" label="Số phòng riêng">
            <InputNumber min={0} max={50} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
          <Form.Item name="am_groupStudyAllowed" label="Cho học nhóm" {...triProps}>
            <Segmented size={isMobile ? 'middle' : 'small'} block={isMobile} options={TRI} />
          </Form.Item>
          <Form.Item name="am_airConditioned" label="Máy lạnh" {...triProps}>
            <Segmented size={isMobile ? 'middle' : 'small'} block={isMobile} options={TRI} />
          </Form.Item>
        </div>
      </Section>

      <Section n={5} mobile={isMobile} title="Tiện ích chi tiết" hint="Mở nhóm nào bạn biết, điền ô chắc chắn, bỏ qua phần còn lại.">
        {categoryId ? <DynamicFieldsForm defs={dynDefs} compact defaultCollapsed /> : <Text type="secondary">Chọn loại hình ở mục 1 để hiện danh sách tiện ích phù hợp.</Text>}
      </Section>

      <Section n={6} mobile={isMobile} title="Ảnh quán" hint="Không gian, bàn ghế, ổ cắm, menu… Ảnh đầu là ảnh bìa.">
        {editing?.initialData?.galleryAssetIds?.length > 0 && (
          <Space wrap size={6} style={{ marginBottom: 8 }}>
            {(editing.initialData.galleryAssetIds as string[]).map((id) => (
              <img key={id} src={`/api/v1/media/${id}?variant=thumb&preview=true`} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: '1px solid #E8E6E1' }} />
            ))}
          </Space>
        )}
        <PhotoStrip photos={photos} onChange={setPhotos} max={10} size={isMobile ? 96 : 112} buttonLabel="Thêm ảnh" />
      </Section>

      <Section n={7} mobile={isMobile} title="Thông tin khác" hint="Có gì chưa có ô để điền? Ghi ở đây.">
        <Form.Item name="shortDescription" label="Mô tả ngắn về quán">
          <Input.TextArea rows={2} maxLength={300} showCount placeholder="Ví dụ: Quán 2 tầng, tầng trên yên tĩnh, có phòng nhóm đặt trước" />
        </Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)', gap: isMobile ? 0 : 12 }}>
          <Form.Item name="phone" label="Số điện thoại quán">
            <Input placeholder="0xxx xxx xxx" inputMode="tel" />
          </Form.Item>
          <Form.Item name="website" label="Website / Facebook" rules={[{ type: 'url', message: 'Nhập đường dẫn đầy đủ (https://…)' }]}>
            <Input placeholder="https://" inputMode="url" />
          </Form.Item>
        </div>
        <Form.Item name="otherNotes" label="Ghi chú khác cho ban quản trị">
          <Input.TextArea rows={3} maxLength={1000} placeholder="Điều gì bạn muốn bổ sung mà không có ô phù hợp…" />
        </Form.Item>
      </Section>

      <div
        style={{ position: 'sticky', bottom: 0, zIndex: 5, background: '#fff', borderTop: '1px solid #E8E6E1', margin: isMobile ? '0 -8px' : '0 -4px', padding: isMobile ? '10px 12px calc(10px + env(safe-area-inset-bottom))' : '12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        data-testid="suggestion-footer"
      >
        <Text type={missing.length ? 'warning' : 'success'} style={{ fontSize: 12.5 }}>
          {missing.length ? `Còn thiếu: ${missing.map((m) => m.label.toLowerCase()).join(', ')}` : 'Đủ thông tin bắt buộc — gửi được rồi'}
        </Text>
        <Space style={isMobile ? { width: '100%', justifyContent: 'flex-end' } : undefined}>
          {onCancel && !isMobile && <Button onClick={onCancel}>Hủy</Button>}
          {!editing && (
            <Button onClick={() => submit(true)} loading={submitting}>
              Lưu nháp
            </Button>
          )}
          <Button type="primary" onClick={() => submit(false)} loading={submitting} data-testid="suggestion-submit" style={isMobile ? { flex: 1 } : undefined}>
            {editing ? 'Gửi lại' : missing.length ? `Gửi duyệt (thiếu ${missing.length})` : 'Gửi duyệt'}
          </Button>
        </Space>
      </div>
    </Form>
  );
};

export default PlaceSuggestionForm;
