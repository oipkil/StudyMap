import React, { useState } from 'react';
import { Modal, Button, Typography, Alert } from 'antd';
import { PhotoStrip, hasPhotoInFlight, type StripPhoto } from './PhotoStrip';
import type { UploadedAsset } from './uploadMedia';
import { FileImage } from 'lucide-react';

const { Text } = Typography;

interface PhotoUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Nhận danh sách asset đã tải xong khi bấm "Thêm". */
  onDone: (assets: UploadedAsset[]) => void;
  max?: number;
  title?: string;
}

/** Tải nhiều ảnh lên có cắt kéo–thả trước khi tải (dùng cho thư viện ảnh quán ở trang admin). */
export const PhotoUploadModal: React.FC<PhotoUploadModalProps> = ({ open, onClose, onDone, max = 10, title = 'Tải ảnh lên' }) => {
  const [photos, setPhotos] = useState<StripPhoto[]>([]);
  const ready = photos.filter((p) => p.status === 'ready' && p.asset);

  const close = () => {
    setPhotos([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={
        <span>
          <FileImage size="1em" style={{ color: '#2F6B4F', marginRight: 8 }} />
          {title}
        </span>
      }
      onCancel={close}
      destroyOnHidden
      width={640}
      footer={[
        <Button key="cancel" onClick={close}>
          Đóng
        </Button>,
        <Button
          key="ok"
          type="primary"
          disabled={ready.length === 0 || hasPhotoInFlight(photos)}
          onClick={() => {
            onDone(ready.map((p) => p.asset as UploadedAsset));
            close();
          }}
        >
          Thêm {ready.length > 0 ? `${ready.length} ảnh` : 'ảnh'}
        </Button>,
      ]}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Chọn một hoặc nhiều ảnh. Mỗi ảnh sẽ hiện hộp cắt (kéo, phóng to, xoay) trước khi tải lên; GIF động được giữ nguyên.
      </Text>
      <PhotoStrip photos={photos} onChange={setPhotos} max={max} size={110} buttonLabel="Chọn ảnh" />
      {photos.some((p) => p.status === 'error') && <Alert type="error" showIcon style={{ marginTop: 12 }} title="Có ảnh tải lên thất bại — bấm Thử lại trên ảnh đó hoặc bỏ ảnh." />}
    </Modal>
  );
};

export default PhotoUploadModal;
