import React, { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Modal, Button, Typography, Space, Slider, Segmented, Tag, message } from 'antd';
import type { PixelCrop } from './cropImage';
import { Scissors } from 'lucide-react';

const { Text } = Typography;

interface ImageCropModalProps {
  visible: boolean;
  /** Asset đã có trong kho (id, width, height, isAnimated, currentRevisionId...). */
  asset: any | null;
  onClose: () => void;
  onSuccess?: (result: { revision: any; verification?: any }) => void;
}

const PRESETS: Array<{ label: string; value: string; aspect: number | null }> = [
  { label: 'Gốc', value: 'orig', aspect: null },
  { label: '1:1', value: '1', aspect: 1 },
  { label: '4:3', value: '4/3', aspect: 4 / 3 },
  { label: '3:4', value: '3/4', aspect: 3 / 4 },
  { label: '16:9', value: '16/9', aspect: 16 / 9 },
];

/**
 * Cắt lại một ảnh ĐÃ CÓ trong kho bằng kéo–thả. Vùng cắt (pixel) gửi lên server -> server sinh phiên bản mới
 * bằng Sharp, giữ nguyên toàn bộ khung hình của GIF động (không cắt trên trình duyệt để không mất chuyển động).
 */
export const ImageCropModal: React.FC<ImageCropModalProps> = ({ visible, asset, onClose, onSuccess }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [preset, setPreset] = useState('orig');
  const [mediaAspect, setMediaAspect] = useState(4 / 3);
  const [pixels, setPixels] = useState<PixelCrop | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setPreset('orig');
      setPixels(null);
    }
  }, [visible, asset?.id]);

  const aspect = useMemo(() => PRESETS.find((p) => p.value === preset)?.aspect ?? mediaAspect, [preset, mediaAspect]);

  if (!asset) return null;
  const assetId = asset.id || asset.assetId;
  // Luôn cắt từ bản gốc (revision hiện tại), xem qua preview để thấy cả ảnh chưa duyệt
  const src = `/api/v1/media/${assetId}?variant=source&preview=true`;

  const submit = async () => {
    if (!pixels) return;
    setSubmitting(true);
    try {
      const csrf = document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] ?? '';
      const res = await fetch(`/api/v1/media/${assetId}/crop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        credentials: 'include',
        body: JSON.stringify({
          left: Math.max(0, Math.round(pixels.x)),
          top: Math.max(0, Math.round(pixels.y)),
          width: Math.max(1, Math.round(pixels.width)),
          height: Math.max(1, Math.round(pixels.height)),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Không cắt được ảnh');
      message.success('Đã tạo phiên bản ảnh cắt mới');
      onSuccess?.(data.data);
      onClose();
    } catch (e: any) {
      message.error(e?.message || 'Không cắt được ảnh');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      width={720}
      destroyOnHidden
      maskClosable={false}
      title={
        <Space>
          <Scissors size="1em" style={{ color: '#2F6B4F' }} />
          <span>Cắt ảnh</span>
          {asset.isAnimated && <Tag color="magenta">GIF động — giữ nguyên {asset.frameCount || ''} khung hình</Tag>}
        </Space>
      }
      footer={[
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button key="ok" type="primary" loading={submitting} disabled={!pixels} onClick={submit}>
          Lưu ảnh đã cắt
        </Button>,
      ]}
    >
      <div style={{ position: 'relative', width: '100%', height: 400, background: '#1F2421', borderRadius: 8, overflow: 'hidden' }}>
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          objectFit="contain"
          restrictPosition
          zoomWithScroll
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onMediaLoaded={(m) => setMediaAspect(m.naturalWidth / m.naturalHeight)}
          onCropComplete={(_, px) => setPixels(px)}
        />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <Segmented size="small" options={PRESETS.map((p) => ({ label: p.label, value: p.value }))} value={preset} onChange={(v) => setPreset(String(v))} />
        <div style={{ flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Phóng to
          </Text>
          <Slider min={1} max={4} step={0.05} value={zoom} onChange={setZoom} style={{ flex: 1, margin: '0 4px' }} tooltip={{ open: false }} />
        </div>
        {pixels && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {Math.round(pixels.width)} × {Math.round(pixels.height)} px
          </Text>
        )}
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        Ảnh gốc được giữ lại; bản cắt là một phiên bản mới của ảnh này.
      </Text>
    </Modal>
  );
};

export default ImageCropModal;
