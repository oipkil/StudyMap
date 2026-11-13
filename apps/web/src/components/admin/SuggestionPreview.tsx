import React, { useEffect, useState } from 'react';
import { Descriptions, Tag, Alert, Spin, Typography, Image, Space } from 'antd';
import axios from 'axios';
import { DynamicFieldsDisplay } from '../places/DynamicFieldsDisplay';
import { WIFI_LABEL, SOCKET_LABEL, NOISE_LABEL, STUDY_LABEL, PARKING_LABEL, labelOf } from '../../utils/amenityLabels';

const { Text } = Typography;

export interface SuggestionPreviewData {
  snapshot: any;
  issues: string[];
  warnings?: string[];
  valid: boolean;
}

/** Nạp bản xem trước hồ sơ quán sẽ được tạo từ đề xuất (server dựng từ initialData, không bịa). */
export function useSuggestionPreview(suggestionId: string | null | undefined) {
  const [data, setData] = useState<SuggestionPreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!suggestionId) return setData(null);
    setLoading(true);
    axios
      .get(`/api/v1/admin/community/suggestions/${suggestionId}/preview`)
      .then((r) => setData(r.data?.data ?? null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [suggestionId]);
  return { data, loading };
}

const tri = (v: unknown) => (v === true ? 'Có' : v === false ? 'Không' : 'Chưa rõ');
const money = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('vi-VN') + 'đ' : 'Chưa có');
const DAY = (d: number) => (d === 0 ? 'CN' : `T${d + 1}`);

/**
 * Admin xem đúng những gì sẽ lên hồ sơ quán khi phê duyệt: vị trí, giờ, giá, tiện ích, trường động, ảnh, ghi chú.
 * Thiếu sót (ví dụ chưa có vị trí) hiện thành cảnh báo để admin yêu cầu bổ sung thay vì duyệt bừa.
 */
export const SuggestionPreview: React.FC<{ suggestion: any; preview: SuggestionPreviewData | null; loading: boolean }> = ({ suggestion, preview, loading }) => {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <Spin />
      </div>
    );
  }
  const snap = preview?.snapshot || {};
  const am = snap.amenities || {};
  const schedule: any[] = Array.isArray(snap.weeklySchedule) ? snap.weeklySchedule : [];
  const gallery: any[] = Array.isArray(snap.gallery) ? snap.gallery : [];
  const sameAllDays = schedule.length === 7 && new Set(schedule.map((d) => JSON.stringify([d.is24h, d.isClosed, d.shifts]))).size === 1;
  const scheduleText = (d: any) => (d.isClosed ? 'Đóng cửa' : d.is24h ? 'Mở 24/24' : (d.shifts || []).map((s: any) => `${s.openTime}–${s.closeTime}${s.isOvernight ? ' (qua đêm)' : ''}`).join(', ') || 'Chưa có thông tin');
  const hasAmenity = Object.values(am).some((v) => v !== 'UNKNOWN' && v !== null && v !== 0 && v !== undefined);

  return (
    <div>
      {preview && preview.issues.length > 0 && (
        <Alert
          type={preview.valid ? 'warning' : 'error'}
          showIcon
          style={{ marginBottom: 12 }}
          title={preview.valid ? 'Lưu ý' : 'Chưa đủ dữ liệu để tạo quán'}
          description={
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {preview.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          }
        />
      )}
      {preview && (preview.warnings?.length ?? 0) > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title="Sinh viên ghi thêm ngoài danh sách"
          description={
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {preview.warnings!.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          }
        />
      )}
      <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small" styles={{ label: { width: 150, background: '#FAF9F6' } }}>
        <Descriptions.Item label="Tên quán">{suggestion.proposedName}</Descriptions.Item>
        <Descriptions.Item label="Người gửi">
          {suggestion.user?.username} ({suggestion.user?.email})
        </Descriptions.Item>
        <Descriptions.Item label="Địa chỉ" span={2}>
          {suggestion.addressDescription}
        </Descriptions.Item>
        <Descriptions.Item label="Vị trí">
          {typeof snap.latitude === 'number' && snap.latitude !== 0 ? (
            <a href={`https://www.google.com/maps?q=${snap.latitude},${snap.longitude}`} target="_blank" rel="noopener noreferrer">
              {snap.latitude.toFixed(5)}, {snap.longitude.toFixed(5)} — mở Google Maps
            </a>
          ) : (
            <Text type="danger">Chưa có</Text>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Cơ sở gần nhất">{suggestion.campus?.name || (snap.nearestCampusId ? 'Đã chọn' : 'Chưa chọn')}</Descriptions.Item>
        <Descriptions.Item label="Giờ mở cửa" span={2}>
          {schedule.length === 0 ? 'Chưa có thông tin' : sameAllDays ? `Hằng ngày: ${scheduleText(schedule[0])}` : schedule.map((d) => `${DAY(d.dayOfWeek)}: ${scheduleText(d)}`).join(' · ')}
        </Descriptions.Item>
        <Descriptions.Item label="Giá">
          {snap.priceMin != null || snap.priceMax != null ? `${money(snap.priceMin)} – ${money(snap.priceMax)}` : 'Chưa có'}
        </Descriptions.Item>
        <Descriptions.Item label="Ưu đãi SV">{snap.studentDiscountDetails || 'Chưa có'}</Descriptions.Item>
        {hasAmenity && (
          <Descriptions.Item label="Tiện ích học tập" span={2}>
            <Space wrap size={[4, 4]}>
              <Tag>Wi-Fi: {labelOf(WIFI_LABEL, am.wifiQuality)}</Tag>
              <Tag>Ổ cắm: {labelOf(SOCKET_LABEL, am.socketDensity)}</Tag>
              <Tag>Độ ồn: {labelOf(NOISE_LABEL, am.noiseLevel)}</Tag>
              <Tag>Học bài: {labelOf(STUDY_LABEL, am.studySuitability)}</Tag>
              <Tag>Gửi xe: {labelOf(PARKING_LABEL, am.motorcycleParking)}</Tag>
              <Tag>Học nhóm: {tri(am.groupStudyAllowed)}</Tag>
              <Tag>Máy lạnh: {tri(am.airConditioned)}</Tag>
              {am.privateRoomsCount > 0 && <Tag>{am.privateRoomsCount} phòng riêng</Tag>}
            </Space>
          </Descriptions.Item>
        )}
        {(snap.shortDescription || snap.publicPhone || snap.website) && (
          <Descriptions.Item label="Mô tả / liên hệ" span={2}>
            {snap.shortDescription && <div>{snap.shortDescription}</div>}
            {snap.publicPhone && <div>ĐT: {snap.publicPhone}</div>}
            {snap.website && (
              <a href={snap.website} target="_blank" rel="noopener noreferrer nofollow">
                {snap.website}
              </a>
            )}
          </Descriptions.Item>
        )}
        {snap.fullDescription && (
          <Descriptions.Item label="Ghi chú của SV" span={2}>
            <Text style={{ whiteSpace: 'pre-line' }}>{snap.fullDescription}</Text>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Trạng thái">
          <Tag color={suggestion.status === 'APPROVED' ? 'green' : suggestion.status === 'PENDING' ? 'gold' : 'red'}>{suggestion.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Gửi lúc">{new Date(suggestion.createdAt).toLocaleString('vi-VN')}</Descriptions.Item>
      </Descriptions>

      <DynamicFieldsDisplay values={snap.dynamicFieldValues} compact />

      {gallery.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text strong>Ảnh sinh viên gửi ({gallery.length}):</Text>
          <Image.PreviewGroup items={gallery.map((g) => `/api/v1/media/${g.assetId}?variant=optimized&preview=true`)}>
            <Space wrap size={8} style={{ marginTop: 6 }}>
              {gallery.map((g) => (
                <Image key={g.assetId} src={`/api/v1/media/${g.assetId}?variant=thumb&preview=true`} preview={{ src: `/api/v1/media/${g.assetId}?variant=optimized&preview=true` }} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8 }} alt="" />
              ))}
            </Space>
          </Image.PreviewGroup>
        </div>
      )}
    </div>
  );
};

export default SuggestionPreview;
