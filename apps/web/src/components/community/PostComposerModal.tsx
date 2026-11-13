import React, { useEffect, useMemo, useState } from 'react';
import { SafeAvatar } from '../common/SafeAvatar';
import { Modal, Input, Button, Space, Typography, message, Select, Tag, Grid, Alert } from 'antd';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { PhotoStrip, readyAssetIds, hasPhotoInFlight, type StripPhoto } from '../media/PhotoStrip';
import { MapPin, X } from 'lucide-react';

const { Text } = Typography;

export interface PostPlaceRef {
  placeId: string;
  name: string;
  slug?: string;
  address?: string | null;
}

interface PostComposerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Quán được gắn sẵn (mở từ trang chi tiết quán). */
  defaultPlace?: PostPlaceRef | null;
}

/**
 * Viết bài trải nghiệm kiểu mạng xã hội: chọn quán -> tiêu đề -> kể chuyện -> thêm ảnh -> Đăng.
 * Nội dung gửi theo hợp đồng API: contentBlocks (paragraph + image), ảnh đầu làm ảnh bìa; admin duyệt trước khi công khai.
 */
export const PostComposerModal: React.FC<PostComposerModalProps> = ({ open, onClose, onSuccess, defaultPlace }) => {
  const { user } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [place, setPlace] = useState<PostPlaceRef | null>(defaultPlace ?? null);
  const [options, setOptions] = useState<PostPlaceRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<StripPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setPlace(defaultPlace ?? null);
  }, [open, defaultPlace]);

  const search = async (q: string) => {
    if (!q.trim()) return setOptions([]);
    setSearching(true);
    try {
      const res = await axios.get('/api/v1/places', { params: { q: q.trim(), limit: 8 } });
      const items: any[] = res.data?.data || [];
      setOptions(items.map((p) => ({ placeId: p.placeId || p.id, name: p.name, slug: p.slug, address: p.address ?? null })));
    } catch {
      setOptions([]);
    } finally {
      setSearching(false);
    }
  };

  const reset = () => {
    setTitle('');
    setContent('');
    setPhotos([]);
    setOptions([]);
    setPlace(defaultPlace ?? null);
  };

  const t = title.trim();
  const c = content.trim();
  const canSubmit = Boolean(place) && t.length >= 5 && c.length >= 20 && !hasPhotoInFlight(photos) && !submitting;
  const helper = useMemo(() => {
    if (!place) return 'Chọn quán bạn muốn viết về';
    if (t.length < 5) return 'Đặt tiêu đề (ít nhất 5 ký tự)';
    if (c.length < 20) return `Viết thêm ${20 - c.length} ký tự nữa`;
    if (hasPhotoInFlight(photos)) return 'Đang tải ảnh lên…';
    return null;
  }, [place, t, c, photos]);

  const submit = async () => {
    if (!canSubmit || !place) return;
    setSubmitting(true);
    try {
      const assetIds = readyAssetIds(photos);
      const paragraphs = c
        .split(/\n\s*\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((text) => ({ type: 'paragraph', text }));
      const images = assetIds.map((assetId) => ({ type: 'image', assetId }));
      const res = await axios.post('/api/v1/community/posts', {
        title: t,
        summary: c.slice(0, 200),
        coverAssetId: assetIds[0] ?? null,
        placeIds: [place.placeId],
        contentBlocks: [...paragraphs, ...images],
      });
      if (res.data.success) {
        message.success('Đã đăng bài viết thành công!');
        reset();
        onClose();
        onSuccess?.();
      }
    } catch (err: any) {
      if (err.response?.status === 401) message.info('Đăng nhập để viết bài');
      else message.error(err.response?.data?.message || 'Không gửi được bài viết');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Viết bài về quán"
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={null}
      width={isMobile ? '100%' : 620}
      style={isMobile ? { top: 8, maxWidth: '100vw', padding: 0 } : undefined}
      destroyOnHidden
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <SafeAvatar src={user?.avatarUrl} name={user?.displayName || user?.username} style={{ backgroundColor: '#2F6B4F' }} />
        <div style={{ lineHeight: 1.2 }}>
          <Text strong>{user?.displayName || user?.username || 'Bạn'}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Bài viết công khai ngay lập tức
            </Text>
          </div>
        </div>
      </div>

      {place ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Tag icon={<MapPin size="1em" />} color="green" style={{ margin: 0, maxWidth: '100%', whiteSpace: 'normal' }} data-testid="post-place-tag">
            {place.name}
          </Tag>
          {!defaultPlace && <Button size="small" type="text" icon={<X size="1em" />} onClick={() => setPlace(null)} aria-label="Bỏ chọn quán" />}
        </div>
      ) : (
        <Select
          showSearch
          placeholder="Bạn viết về quán nào? Gõ tên quán để tìm"
          style={{ width: '100%', marginBottom: 12 }}
          filterOption={false}
          onSearch={search}
          loading={searching}
          notFoundContent={searching ? 'Đang tìm…' : 'Gõ tên quán'}
          onSelect={(v) => setPlace(options.find((o) => o.placeId === v) || null)}
          options={options.map((o) => ({ value: o.placeId, label: o.address ? `${o.name} — ${o.address}` : o.name }))}
          data-testid="post-place-select"
        />
      )}

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="Tiêu đề, ví dụ: Một chiều chạy deadline cực êm ở đây"
        style={{ fontSize: 17, fontWeight: 600, border: 0, background: 'transparent', padding: '6px 4px' }}
        data-testid="post-title"
      />
      <Input.TextArea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        autoSize={{ minRows: 5, maxRows: 14 }}
        placeholder="Kể trải nghiệm của bạn: không gian, chỗ ngồi, ổ cắm, nước uống, giá… (cách một dòng trống để xuống đoạn)"
        style={{ fontSize: 15, border: 0, background: 'transparent', padding: '4px', resize: 'none' }}
        data-testid="post-content"
      />

      <div style={{ marginTop: 8 }}>
        <PhotoStrip photos={photos} onChange={setPhotos} max={10} size={84} buttonLabel="Thêm ảnh" />
        {photos.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Ảnh đầu tiên sẽ là ảnh bìa bài viết.
          </Text>
        )}
      </div>

      {!user && <Alert type="warning" showIcon style={{ marginTop: 12 }} title="Bạn cần đăng nhập để đăng bài." />}

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
          <Button type="primary" onClick={submit} loading={submitting} disabled={!canSubmit} data-testid="post-submit">
            Đăng bài
          </Button>
        </Space>
      </div>
    </Modal>
  );
};

export default PostComposerModal;
