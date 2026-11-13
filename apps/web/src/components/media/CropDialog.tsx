import React, { useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { Modal, Slider, Segmented, Button, Space, Typography, Grid, message } from 'antd';
import { getCroppedBlob, outputMimeFor, type PixelCrop } from './cropImage';
import { RotateCcw, RotateCw, Scissors } from 'lucide-react';

const { Text } = Typography;

export interface CropDialogProps {
  open: boolean;
  /** Object URL của file gốc (URL.createObjectURL). */
  src: string | null;
  fileName?: string;
  file?: File | Blob | null;
  /** Khoá tỷ lệ (ví dụ 1 cho ảnh đại diện). Không truyền: người dùng chọn preset. */
  fixedAspect?: number;
  cropShape?: 'rect' | 'round';
  /** Cho phép "Giữ nguyên" (tải ảnh gốc, không cắt). */
  allowSkip?: boolean;
  title?: string;
  onCancel: () => void;
  onDone: (blob: Blob, meta: { width: number; height: number }) => void;
  onSkip?: () => void;
}

const PRESETS: Array<{ label: string; value: string; aspect: number | null }> = [
  { label: 'Gốc', value: 'orig', aspect: null },
  { label: '1:1', value: '1', aspect: 1 },
  { label: '4:3', value: '4/3', aspect: 4 / 3 },
  { label: '3:4', value: '3/4', aspect: 3 / 4 },
  { label: '16:9', value: '16/9', aspect: 16 / 9 },
];

/**
 * Hộp cắt ảnh kéo–thả (react-easy-crop): kéo để chọn vùng, lăn chuột/kéo thanh để phóng to, xoay 90°.
 * Kết quả cắt ngay trên trình duyệt -> Blob gọn nhẹ để tải lên (ảnh 4000px thu về tối đa 2000px).
 */
export const CropDialog: React.FC<CropDialogProps> = ({
  open,
  src,
  fileName,
  file,
  fixedAspect,
  cropShape = 'rect',
  allowSkip = true,
  title,
  onCancel,
  onDone,
  onSkip,
}) => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [preset, setPreset] = useState<string>(fixedAspect ? String(fixedAspect) : 'orig');
  const [mediaAspect, setMediaAspect] = useState<number>(4 / 3);
  const [pixels, setPixels] = useState<PixelCrop | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setPreset(fixedAspect ? String(fixedAspect) : 'orig');
      setPixels(null);
    }
  }, [open, src, fixedAspect]);

  const aspect = useMemo(() => {
    if (fixedAspect) return fixedAspect;
    const p = PRESETS.find((x) => x.value === preset);
    return p?.aspect ?? mediaAspect;
  }, [fixedAspect, preset, mediaAspect]);

  const finish = async () => {
    if (!src || !pixels) return;
    setWorking(true);
    try {
      const mime = file ? outputMimeFor(file) : 'image/jpeg';
      const blob = await getCroppedBlob(src, pixels, rotation, mime);
      onDone(blob, { width: Math.round(pixels.width), height: Math.round(pixels.height) });
    } catch (e: any) {
      message.error(e?.message || 'Không cắt được ảnh');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <Scissors size="1em" style={{ color: '#2F6B4F' }} />
          <span>{title || 'Cắt ảnh'}</span>
          {fileName && (
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }} ellipsis>
              {fileName}
            </Text>
          )}
        </Space>
      }
      onCancel={onCancel}
      width={isMobile ? '100%' : 720}
      style={isMobile ? { top: 8, padding: 0, maxWidth: '100vw' } : undefined}
      destroyOnHidden
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Space>
            <Button onClick={onCancel}>Hủy</Button>
            {allowSkip && onSkip && <Button onClick={onSkip}>Giữ nguyên ảnh gốc</Button>}
          </Space>
          <Button type="primary" onClick={finish} loading={working} disabled={!pixels} data-testid="crop-done">
            Xong
          </Button>
        </div>
      }
    >
      <div style={{ position: 'relative', width: '100%', height: isMobile ? 'min(60vh, 420px)' : 400, background: '#1F2421', borderRadius: 8, overflow: 'hidden' }}>
        {src && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            objectFit="contain"
            restrictPosition
            zoomWithScroll
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onMediaLoaded={(m) => setMediaAspect(m.naturalWidth / m.naturalHeight)}
            onCropComplete={(_, px) => setPixels(px)}
          />
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 }}>
        {!fixedAspect && (
          <Segmented size="small" options={PRESETS.map((p) => ({ label: p.label, value: p.value }))} value={preset} onChange={(v) => setPreset(String(v))} />
        )}
        <div style={{ flex: '1 1 160px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Phóng to
          </Text>
          <Slider min={1} max={4} step={0.05} value={zoom} onChange={setZoom} style={{ flex: 1, margin: '0 4px' }} tooltip={{ open: false }} />
        </div>
        <Space size={4}>
          <Button size="small" icon={<RotateCcw size="1em" />} onClick={() => setRotation((r) => r - 90)} aria-label="Xoay trái" />
          <Button size="small" icon={<RotateCw size="1em" />} onClick={() => setRotation((r) => r + 90)} aria-label="Xoay phải" />
        </Space>
      </div>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
        Kéo ảnh để chọn vùng, lăn chuột hoặc kéo thanh để phóng to. Ảnh sẽ được thu gọn để tải lên nhanh.
      </Text>
    </Modal>
  );
};

export default CropDialog;
