import React, { useRef, useState } from 'react';
import { Button, Dropdown, message } from 'antd';
import axios from 'axios';
import { CropDialog } from '../media/CropDialog';
import { uploadImage, validateImageFile } from '../media/uploadMedia';
import { Camera } from 'lucide-react';

interface CoverPhotoButtonProps {
  hasCover: boolean;
  /** Gọi sau khi lưu xong (đổi hoặc gỡ) để tải lại hồ sơ. */
  onSaved: () => void;
  compact?: boolean;
}

/** Tỷ lệ ảnh bìa (rộng : cao) — khớp khung bìa 1000×200 trên desktop, vẫn cắt gọn trên điện thoại. */
export const COVER_ASPECT = 4;

/**
 * Nút "Đổi ảnh bìa" đặt góc ảnh bìa hồ sơ (kiểu mạng xã hội): chọn ảnh -> cắt ngang -> tải lên -> lưu vào hồ sơ.
 * Gỡ ảnh bìa qua menu thả xuống. Ảnh bìa công khai ngay như ảnh đại diện.
 */
export const CoverPhotoButton: React.FC<CoverPhotoButtonProps> = ({ hasCover, onSaved, compact }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = (f?: File) => {
    if (!f) return;
    const err = validateImageFile(f);
    if (err) return message.error(err);
    setFile(f);
    setSrc(URL.createObjectURL(f));
  };

  const save = async (coverAssetId: string | null) => {
    setSaving(true);
    try {
      await axios.put('/api/v1/me/profile', { coverAssetId });
      message.success(coverAssetId ? 'Đã cập nhật ảnh bìa — chờ ban quản trị duyệt để người khác nhìn thấy' : 'Đã gỡ ảnh bìa');
      onSaved();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Không lưu được ảnh bìa');
    } finally {
      setSaving(false);
    }
  };

  const done = async (blob: Blob) => {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
    setSaving(true);
    try {
      const asset = await uploadImage(blob, (file?.name || 'cover').replace(/\.[^.]+$/, '') + '.jpg');
      await save(asset.id);
    } catch (e: any) {
      message.error(e?.message || 'Không tải được ảnh');
      setSaving(false);
    }
  };

  const items = [
    { key: 'change', label: hasCover ? 'Đổi ảnh bìa' : 'Tải ảnh bìa', onClick: () => inputRef.current?.click() },
    ...(hasCover ? [{ key: 'remove', label: 'Gỡ ảnh bìa', danger: true, onClick: () => void save(null) }] : []),
  ];

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        data-testid="cover-input"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {hasCover ? (
        <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
          <Button size={compact ? 'small' : 'middle'} icon={<Camera size="1em" />} loading={saving} style={{ background: 'rgba(255,255,255,0.92)' }} data-testid="btn-cover">
            {compact ? '' : 'Ảnh bìa'}
          </Button>
        </Dropdown>
      ) : (
        <Button size={compact ? 'small' : 'middle'} icon={<Camera size="1em" />} loading={saving} onClick={() => inputRef.current?.click()} style={{ background: 'rgba(255,255,255,0.92)' }} data-testid="btn-cover">
          {compact ? '' : 'Tải ảnh bìa'}
        </Button>
      )}
      <CropDialog
        open={Boolean(src)}
        src={src}
        file={file}
        fileName={file?.name}
        fixedAspect={COVER_ASPECT}
        allowSkip={false}
        title="Cắt ảnh bìa"
        onCancel={() => {
          if (src) URL.revokeObjectURL(src);
          setSrc(null);
        }}
        onDone={done}
      />
    </>
  );
};

export default CoverPhotoButton;
