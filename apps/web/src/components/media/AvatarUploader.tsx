import React, { useRef, useState } from 'react';
import { Avatar, Button, Spin, Typography, message } from 'antd';
import { CropDialog } from './CropDialog';
import { uploadImage, validateImageFile } from './uploadMedia';
import { Camera, User } from 'lucide-react';

const { Text } = Typography;

interface AvatarUploaderProps {
  /** URL ảnh hiện tại (server) hoặc null. */
  value: string | null;
  onChange: (assetId: string | null, previewUrl: string | null) => void;
  size?: number;
  disabled?: boolean;
}

/** Ảnh đại diện: bấm vào ảnh -> chọn file -> cắt tròn 1:1 -> tải lên -> báo assetId cho form. */
export const AvatarUploader: React.FC<AvatarUploaderProps> = ({ value, onChange, size = 120, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    const err = validateImageFile(f);
    if (err) {
      message.error(err);
      return;
    }
    setFile(f);
    setSrc(URL.createObjectURL(f));
  };

  const done = async (blob: Blob) => {
    if (src) URL.revokeObjectURL(src);
    setSrc(null);
    const local = URL.createObjectURL(blob);
    setPreview(local);
    setUploading(true);
    try {
      const asset = await uploadImage(blob, (file?.name || 'avatar').replace(/\.[^.]+$/, '') + '.jpg');
      onChange(asset.id, local);
      message.success('Đã tải ảnh đại diện');
    } catch (e: any) {
      setPreview(null);
      message.error(e?.message || 'Không tải được ảnh');
    } finally {
      setUploading(false);
    }
  };

  const shown = preview || value;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} data-testid="avatar-input" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      <button
        type="button"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        aria-label="Đổi ảnh đại diện"
        style={{ position: 'relative', width: size, height: size, borderRadius: '50%', border: 0, padding: 0, background: 'transparent', cursor: disabled ? 'default' : 'pointer' }}
      >
        <Avatar size={size} src={shown || undefined} icon={<User size="1em" />} style={{ backgroundColor: '#2F6B4F' }} />
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin />
          </div>
        )}
        {!disabled && (
          <span
            style={{
              position: 'absolute',
              right: 2,
              bottom: 2,
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#fff',
              border: '1px solid #E8E6E1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1F2421',
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            }}
          >
            <Camera size="1em" />
          </span>
        )}
      </button>
      {!disabled && (
        <div style={{ textAlign: 'center' }}>
          <Button size="small" type="link" onClick={() => inputRef.current?.click()} style={{ padding: 0 }}>
            {shown ? 'Đổi ảnh' : 'Tải ảnh đại diện'}
          </Button>
          {shown && (
            <>
              <Text type="secondary"> · </Text>
              <Button size="small" type="link" danger style={{ padding: 0 }} onClick={() => { setPreview(null); onChange(null, null); }}>
                Gỡ ảnh
              </Button>
            </>
          )}
        </div>
      )}
      <CropDialog open={Boolean(src)} src={src} file={file} fileName={file?.name} fixedAspect={1} cropShape="round" allowSkip={false} title="Cắt ảnh đại diện" onCancel={() => { if (src) URL.revokeObjectURL(src); setSrc(null); }} onDone={done} />
    </div>
  );
};

export default AvatarUploader;
