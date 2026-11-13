import React, { useState } from 'react';
import { Modal, Form, Input, Upload, Button, Typography, Space, Alert, message } from 'antd';
import axios from 'axios';
import { Inbox, Trash2 } from 'lucide-react';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface UploadedItem {
  assetId: string;
  fileName: string;
  altText: string;
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/**
 * Sinh viên gửi bộ nhãn dán (1–20 ảnh) để admin duyệt.
 * Ảnh tải qua Media Gateway; sau khi admin duyệt bộ nhãn dán, ảnh mới hiển thị công khai trong bộ chọn.
 */
export const StickerPackSubmitModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const csrf = () => document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] || '';

  const uploadOne = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/v1/media/upload', {
      method: 'POST',
      headers: { 'x-csrf-token': csrf() },
      credentials: 'include',
      body: fd,
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Tải ảnh thất bại');
    return data.data as { id: string };
  };

  const handleBeforeUpload = async (file: File) => {
    if (items.length >= 20) {
      message.warning('Tối đa 20 nhãn dán mỗi bộ');
      return Upload.LIST_IGNORE;
    }
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadOne(file);
      const base = file.name.replace(/\.[^.]+$/, '');
      setItems((prev) => [...prev, { assetId: asset.id, fileName: file.name, altText: base.slice(0, 100) }]);
    } catch (e: any) {
      setError(e.message || 'Không tải được ảnh');
    } finally {
      setUploading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const handleSubmit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (items.length === 0) {
      setError('Cần ít nhất 1 ảnh nhãn dán');
      return;
    }
    setSubmitting(true);
    setError(null);
    const slug = slugify(values.name) || `pack-${Date.now()}`;
    try {
      await axios.post('/api/v1/community/stickers/packs', {
        name: values.name.trim(),
        slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
        items: items.map((it, idx) => ({
          shortcode: `:${slug}_${idx + 1}:`.slice(0, 50),
          assetId: it.assetId,
          altText: it.altText || `Nhãn dán ${idx + 1}`,
        })),
      });
      message.success('Đã gửi bộ nhãn dán, chờ quản trị viên duyệt');
      form.resetFields();
      setItems([]);
      onSuccess?.();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Không gửi được bộ nhãn dán');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Gửi bộ nhãn dán mới"
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Gửi duyệt"
      cancelText="Hủy"
      okButtonProps={{ loading: submitting, disabled: uploading }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
        <Form.Item
          name="name"
          label="Tên bộ nhãn dán"
          rules={[
            { required: true, message: 'Nhập tên bộ nhãn dán' },
            { min: 2, max: 50, message: '2–50 ký tự' },
          ]}
        >
          <Input placeholder="Ví dụ: Mèo học bài" maxLength={50} />
        </Form.Item>
      </Form>

      <Upload.Dragger
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        beforeUpload={handleBeforeUpload as any}
        showUploadList={false}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon">
          <Inbox size="1em" />
        </p>
        <p className="ant-upload-text">Kéo thả hoặc bấm để chọn ảnh nhãn dán</p>
        <p className="ant-upload-hint">PNG/JPEG/WebP/GIF · nền trong suốt cho kết quả đẹp nhất · tối đa 20 ảnh</p>
      </Upload.Dragger>

      {items.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">Đã tải {items.length}/20 ảnh — đặt tên mô tả cho từng nhãn dán:</Text>
          <Space orientation="vertical" style={{ width: '100%', marginTop: 8 }} size={8}>
            {items.map((it, idx) => (
              <Space key={it.assetId} style={{ width: '100%' }} align="center">
                <img
                  src={`/api/v1/media/${it.assetId}?variant=thumb&preview=true`}
                  alt={it.altText}
                  style={{
                    width: 44,
                    height: 44,
                    objectFit: 'contain',
                    borderRadius: 6,
                    background: '#F7F6F3',
                    border: '1px solid #E8E6E1',
                  }}
                />
                <Input
                  size="small"
                  value={it.altText}
                  maxLength={100}
                  style={{ width: 300 }}
                  onChange={(e) =>
                    setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, altText: e.target.value } : p)))
                  }
                />
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<Trash2 size="1em" />}
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                />
              </Space>
            ))}
          </Space>
        </div>
      )}

      {error && <Alert type="error" showIcon title={error} style={{ marginTop: 12 }} />}
    </Modal>
  );
};

export default StickerPackSubmitModal;
