import React, { useMemo, useState } from 'react';
import { SafeAvatar } from '../common/SafeAvatar';
import { Modal, Input, Rate, DatePicker, InputNumber, Button, Space, Typography, message, Collapse, Grid } from 'antd';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '../../context/AuthContext';
import { PhotoStrip, readyAssetIds, hasPhotoInFlight, type StripPhoto } from '../media/PhotoStrip';
import { Wifi, Zap, Volume2, DollarSign } from 'lucide-react';

const { Text } = Typography;

interface WriteReviewModalProps {
  placeId: string;
  placeName: string;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const STAR_LABEL = ['Chọn số sao', 'Tệ', 'Không ổn', 'Bình thường', 'Tốt', 'Tuyệt vời'];
const MIN_LEN = 20;

const CRITERIA: Array<{ key: string; label: string; icon: React.ReactNode }> = [
  { key: 'wifi', label: 'Wi-Fi', icon: <Wifi size="1em" /> },
  { key: 'socket', label: 'Ổ cắm', icon: <Zap size="1em" /> },
  { key: 'noise', label: 'Yên tĩnh', icon: <Volume2 size="1em" /> },
  { key: 'price', label: 'Giá cả', icon: <DollarSign size="1em" /> },
];

const STUDENT_QUICK_TAGS = [
  '🪑 Bàn cao ngồi êm lưng',
  '🔌 Nhiều ổ cắm từng bàn',
  '📶 Wi-Fi mạnh > 50Mbps',
  '🤫 Rất yên tĩnh học bài',
  '🛵 Giữ xe miễn phí an toàn',
  '🎵 Nhạc Lofi nhẹ nhàng',
  '🌙 Mở 24/7 cày đêm',
  '💧 Nước lọc tự phục vụ',
  '❄️ Máy lạnh mát rượi',
  '👥 Thích hợp học nhóm',
];

/**
 * Viết đánh giá kiểu mạng xã hội: chọn sao -> kể cảm nhận -> thêm ảnh (cắt được) -> Đăng.
 * Chi tiết (điểm từng tiêu chí, ngày ghé, chi tiêu, điểm cộng/trừ) gập lại để không làm rối người mới.
 */
export const WriteReviewModal: React.FC<WriteReviewModalProps> = ({ placeId, placeName, visible, onClose, onSuccess }) => {
  const { user } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<StripPhoto[]>([]);
  const [criteria, setCriteria] = useState<Record<string, number>>({});
  const [visitDate, setVisitDate] = useState<Dayjs | null>(dayjs());
  const [spend, setSpend] = useState<number | null>(null);
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRating(0);
    setContent('');
    setSelectedTags([]);
    setPhotos([]);
    setCriteria({});
    setVisitDate(dayjs());
    setSpend(null);
    setPros('');
    setCons('');
  };

  const handleToggleTag = (tagText: string) => {
    const isSelected = selectedTags.includes(tagText);
    const cleanTag = tagText.replace(/^[^\s]+\s/, '');
    if (isSelected) {
      setSelectedTags((prev) => prev.filter((t) => t !== tagText));
      setContent((prev) => {
        return prev
          .replace(new RegExp(`(\\s*•?\\s*${cleanTag})`, 'gi'), '')
          .trim();
      });
    } else {
      setSelectedTags((prev) => [...prev, tagText]);
      setContent((prev) => {
        const p = prev.trim();
        if (!p) return cleanTag;
        return `${p} • ${cleanTag}`;
      });
    }
  };

  const trimmed = content.trim();
  const canSubmit = rating > 0 && trimmed.length >= MIN_LEN && !hasPhotoInFlight(photos) && !submitting;
  const helper = useMemo(() => {
    if (rating === 0) return 'Chọn số sao trước';
    if (trimmed.length < MIN_LEN) return `Viết thêm ${MIN_LEN - trimmed.length} ký tự nữa`;
    if (hasPhotoInFlight(photos)) return 'Đang tải ảnh lên…';
    return null;
  }, [rating, trimmed, photos]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const splitLines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
      const extra = [
        splitLines(pros).length ? 'Điểm cộng: ' + splitLines(pros).join('; ') : '',
        splitLines(cons).length ? 'Điểm cần khắc phục: ' + splitLines(cons).join('; ') : '',
        spend ? 'Chi tiêu khoảng ' + Number(spend).toLocaleString('vi-VN') + 'đ' : '',
      ].filter(Boolean);
      // Đúng hợp đồng API (ReviewRevisionPayloadSchema)
      const payload: Record<string, unknown> = {
        ratingOverall: rating,
        criteriaScores: CRITERIA.filter((c) => criteria[c.key] > 0).map((c) => ({ criteriaKey: c.key, label: c.label, score: criteria[c.key] })),
        content: [trimmed, ...extra].join('\n'),
        attachedAssetIds: readyAssetIds(photos),
      };
      if (visitDate) payload.visitDate = visitDate.format('YYYY-MM-DD');
      const res = await axios.post(`/api/v1/places/${placeId}/reviews`, payload);
      if (res.data.success) {
        message.success('Đánh giá của bạn đã được đăng thành công!');
        reset();
        onClose();
        onSuccess();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Có lỗi xảy ra khi gửi đánh giá');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={<span>Đánh giá {placeName}</span>}
      open={visible}
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={null}
      width={isMobile ? '100%' : 600}
      style={isMobile ? { top: 8, maxWidth: '100vw', padding: 0 } : undefined}
      destroyOnHidden
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <SafeAvatar src={user?.avatarUrl} name={user?.displayName || user?.username} style={{ backgroundColor: '#2F6B4F' }} />
        <div style={{ lineHeight: 1.2 }}>
          <Text strong>{user?.displayName || user?.username || 'Bạn'}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Đánh giá công khai ngay lập tức
            </Text>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '8px 0 4px', background: '#FAF9F6', borderRadius: 8 }}>
        <Rate value={rating} onChange={setRating} style={{ fontSize: 34, color: '#B8860B' }} allowClear={false} data-testid="review-rating" />
        <div style={{ marginTop: 2 }}>
          <Text type={rating ? undefined : 'secondary'} strong={rating > 0}>
            {STAR_LABEL[rating]}
          </Text>
        </div>
      </div>

      {/* Student Quick Review Chips */}
      <div style={{ marginTop: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#6F4E37', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>💡 Chạm để thêm nhanh nhận xét:</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STUDENT_QUICK_TAGS.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => handleToggleTag(tag)}
                style={{
                  background: isSelected ? '#4A2E18' : '#FAF7F2',
                  color: isSelected ? '#FFFFFF' : '#4A2E18',
                  border: '1px solid ' + (isSelected ? '#4A2E18' : '#EAE3D9'),
                  borderRadius: 14,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <Input.TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoSize={{ minRows: 4, maxRows: 10 }}
        maxLength={5000}
        placeholder="Kể về chỗ ngồi, ổ cắm, Wi-Fi, nước uống, giữ xe… (ít nhất 20 ký tự)"
        style={{ marginTop: 12, fontSize: 15, border: '1px solid #EAE3D9', borderRadius: 8, background: '#FAF7F2', padding: '10px 12px', resize: 'none' }}
        data-testid="review-content"
      />

      <div style={{ marginTop: 8 }}>
        <PhotoStrip photos={photos} onChange={setPhotos} max={10} size={84} buttonLabel="Thêm ảnh" />
      </div>

      <Collapse
        ghost
        size="small"
        style={{ marginTop: 8 }}
        items={[
          {
            key: 'more',
            label: <Text type="secondary">Thêm chi tiết (không bắt buộc)</Text>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8 }}>
                  {CRITERIA.map((c) => (
                    <div key={c.key}>
                      <Text style={{ fontSize: 12 }}>
                        {c.icon} {c.label}
                      </Text>
                      <div>
                        <Rate value={criteria[c.key] || 0} onChange={(v) => setCriteria((s) => ({ ...s, [c.key]: v }))} style={{ fontSize: 14 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <div>
                    <Text style={{ fontSize: 12 }}>Ngày ghé quán</Text>
                    <DatePicker value={visitDate} onChange={setVisitDate} style={{ width: '100%' }} format="DD/MM/YYYY" />
                  </div>
                  <div>
                    <Text style={{ fontSize: 12 }}>Đã chi khoảng (VNĐ)</Text>
                    <InputNumber<number> value={spend} onChange={(v) => setSpend(v ?? null)} min={0} step={5000} style={{ width: '100%' }} placeholder="35.000" formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')} parser={(v) => Number((v || '').replace(/\./g, ''))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <div>
                    <Text style={{ fontSize: 12 }}>Điểm cộng (mỗi dòng một ý)</Text>
                    <Input.TextArea value={pros} onChange={(e) => setPros(e.target.value)} rows={2} placeholder="Wi-Fi mạnh&#10;Ổ cắm từng bàn" />
                  </div>
                  <div>
                    <Text style={{ fontSize: 12 }}>Điểm trừ (mỗi dòng một ý)</Text>
                    <Input.TextArea value={cons} onChange={(e) => setCons(e.target.value)} rows={2} placeholder="Bãi xe hẹp&#10;Nhạc hơi ồn" />
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {helper ?? 'Sẵn sàng đăng'}
        </Text>
        <Space>
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Hủy
          </Button>
          <Button type="primary" onClick={submit} loading={submitting} disabled={!canSubmit} data-testid="review-submit">
            Đăng đánh giá
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default WriteReviewModal;
