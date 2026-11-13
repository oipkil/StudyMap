import React, { useEffect, useRef, useState } from 'react';
import { Button, Space, Spin, Tooltip, Typography, message } from 'antd';
import { CropDialog } from './CropDialog';
import { uploadImage, validateImageFile, type UploadedAsset } from './uploadMedia';
import { isAnimatedGif } from './cropImage';
import { Camera, X, Scissors, RefreshCw } from 'lucide-react';

const { Text } = Typography;

export interface StripPhoto {
  key: string;
  name: string;
  file: File;
  /** Object URL của file gốc (để cắt lại). */
  originalUrl: string;
  /** Object URL của bản đã cắt (hoặc = originalUrl). */
  previewUrl: string;
  status: 'pending' | 'uploading' | 'ready' | 'error';
  assetId?: string;
  asset?: UploadedAsset;
  error?: string;
}

interface PhotoStripProps {
  photos: StripPhoto[];
  onChange: (next: StripPhoto[]) => void;
  max?: number;
  /** Khoá tỷ lệ cắt (không truyền = người dùng chọn). */
  aspect?: number;
  buttonLabel?: string;
  /** Kích thước ô ảnh (px). */
  size?: number;
  disabled?: boolean;
  /** Không hỏi cắt: tải thẳng ảnh gốc (vẫn cắt lại được sau). */
  skipCropOnAdd?: boolean;
}

export const readyAssetIds = (photos: StripPhoto[]) => photos.filter((p) => p.status === 'ready' && p.assetId).map((p) => p.assetId as string);
export const hasPhotoInFlight = (photos: StripPhoto[]) => photos.some((p) => p.status === 'pending' || p.status === 'uploading');

let keySeq = 0;

/**
 * Dải ảnh đính kèm kiểu mạng xã hội: bấm "Thêm ảnh" -> chọn nhiều ảnh -> mỗi ảnh hiện hộp cắt (kéo, phóng, xoay)
 * -> tải lên ngay -> hiện ô ảnh nhỏ. GIF động tải thẳng (cắt trên trình duyệt sẽ mất chuyển động).
 */
export const PhotoStrip: React.FC<PhotoStripProps> = ({ photos, onChange, max = 10, aspect, buttonLabel = 'Thêm ảnh', size = 96, disabled, skipCropOnAdd }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  // Hàng đợi ảnh cần cắt: xử lý từng ảnh một
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const cropping = cropQueue[0] ? photos.find((p) => p.key === cropQueue[0]) : undefined;

  useEffect(() => {
    return () => {
      // Giải phóng object URL khi component bị huỷ
      photosRef.current.forEach((p) => {
        URL.revokeObjectURL(p.originalUrl);
        if (p.previewUrl !== p.originalUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, []);

  const patch = (key: string, data: Partial<StripPhoto>) => {
    const next = photosRef.current.map((p) => (p.key === key ? { ...p, ...data } : p));
    photosRef.current = next;
    onChange(next);
  };

  const upload = async (key: string, blob: Blob, name: string) => {
    patch(key, { status: 'uploading', error: undefined });
    try {
      const asset = await uploadImage(blob, name);
      patch(key, { status: 'ready', assetId: asset.id, asset });
    } catch (e: any) {
      patch(key, { status: 'error', error: e?.message || 'Tải lên thất bại' });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = max - photosRef.current.length;
    if (room <= 0) {
      message.warning(`Tối đa ${max} ảnh`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    if (picked.length < files.length) message.warning(`Chỉ thêm ${picked.length} ảnh đầu (tối đa ${max})`);
    const added: StripPhoto[] = [];
    for (const file of picked) {
      const err = validateImageFile(file);
      if (err) {
        message.error(err);
        continue;
      }
      const url = URL.createObjectURL(file);
      added.push({ key: `p${++keySeq}`, name: file.name, file, originalUrl: url, previewUrl: url, status: 'pending' });
    }
    if (added.length === 0) return;
    const next = [...photosRef.current, ...added];
    photosRef.current = next;
    onChange(next);
    const toCrop: string[] = [];
    for (const p of added) {
      if (isAnimatedGif(p.file) || skipCropOnAdd) void upload(p.key, p.file, p.name);
      else toCrop.push(p.key);
    }
    if (toCrop.length) setCropQueue((q) => [...q, ...toCrop]);
  };

  const remove = (key: string) => {
    const target = photosRef.current.find((p) => p.key === key);
    if (target) {
      URL.revokeObjectURL(target.originalUrl);
      if (target.previewUrl !== target.originalUrl) URL.revokeObjectURL(target.previewUrl);
    }
    const next = photosRef.current.filter((p) => p.key !== key);
    photosRef.current = next;
    onChange(next);
    setCropQueue((q) => q.filter((k) => k !== key));
  };

  const cropDone = (blob: Blob) => {
    if (!cropping) return;
    const preview = URL.createObjectURL(blob);
    if (cropping.previewUrl !== cropping.originalUrl) URL.revokeObjectURL(cropping.previewUrl);
    patch(cropping.key, { previewUrl: preview });
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    void upload(cropping.key, blob, cropping.name.replace(/\.[^.]+$/, '') + '.' + ext);
    setCropQueue((q) => q.slice(1));
  };

  const cropSkip = () => {
    if (!cropping) return;
    // Ảnh mới: tải bản gốc; ảnh đang cắt lại: giữ bản đã có
    if (cropping.status === 'pending') void upload(cropping.key, cropping.file, cropping.name);
    setCropQueue((q) => q.slice(1));
  };

  const cropCancel = () => {
    if (!cropping) return;
    // Huỷ cắt ảnh mới = bỏ ảnh đó khỏi dải; huỷ khi cắt lại = giữ nguyên ảnh cũ
    if (cropping.status === 'pending') remove(cropping.key);
    else setCropQueue((q) => q.slice(1));
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple={max > 1}
        style={{ display: 'none' }}
        data-testid="photo-strip-input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((p) => (
          <div
            key={p.key}
            style={{
              position: 'relative',
              width: size,
              height: size,
              borderRadius: 8,
              overflow: 'hidden',
              background: '#EEECE7',
              border: p.status === 'error' ? '1px solid #cf1322' : '1px solid #E8E6E1',
            }}
          >
            <img src={p.previewUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: p.status === 'ready' ? 1 : 0.55 }} />
            {(p.status === 'uploading' || p.status === 'pending') && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size="small" />
              </div>
            )}
            {p.status === 'error' && (
              <Tooltip title={p.error}>
                <Button
                  size="small"
                  type="primary"
                  danger
                  icon={<RefreshCw size="1em" />}
                  style={{ position: 'absolute', left: 4, bottom: 4 }}
                  onClick={() => void upload(p.key, p.file, p.name)}
                >
                  Thử lại
                </Button>
              </Tooltip>
            )}
            {!disabled && (
              <>
                <Button
                  size="small"
                  shape="circle"
                  icon={<X size="1em" />}
                  aria-label="Bỏ ảnh"
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(255,255,255,0.9)' }}
                  onClick={() => remove(p.key)}
                />
                {!isAnimatedGif(p.file) && p.status !== 'uploading' && (
                  <Button
                    size="small"
                    shape="circle"
                    icon={<Scissors size="1em" />}
                    aria-label="Cắt lại"
                    style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(255,255,255,0.9)' }}
                    onClick={() => setCropQueue((q) => [...q, p.key])}
                  />
                )}
              </>
            )}
          </div>
        ))}
        {!disabled && photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            data-testid="photo-strip-add"
            style={{
              width: size,
              height: size,
              borderRadius: 8,
              border: '1px dashed #B9B5AE',
              background: '#FAF9F6',
              color: '#2F6B4F',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              fontSize: 12,
            }}
          >
            <Camera size="1em" style={{ fontSize: 22 }} />
            <span>{buttonLabel}</span>
          </button>
        )}
      </div>
      {photos.length > 0 && (
        <Space size={4} style={{ marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {photos.filter((p) => p.status === 'ready').length}/{photos.length} ảnh đã tải lên · tối đa {max}
          </Text>
        </Space>
      )}

      <CropDialog
        open={Boolean(cropping)}
        src={cropping?.originalUrl ?? null}
        fileName={cropping?.name}
        file={cropping?.file}
        fixedAspect={aspect}
        onCancel={cropCancel}
        onDone={cropDone}
        onSkip={cropSkip}
        title={cropQueue.length > 1 ? `Cắt ảnh (còn ${cropQueue.length})` : 'Cắt ảnh'}
      />
    </div>
  );
};

export default PhotoStrip;
