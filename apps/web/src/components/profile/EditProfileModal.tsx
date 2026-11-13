import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Switch, Typography, message } from 'antd';
import { SelectWithOther, OTHER_VALUE as OTHER } from '../common/SelectWithOther';
import axios from 'axios';
import { AvatarUploader } from '../media/AvatarUploader';

const { Text } = Typography;

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Sửa hồ sơ: ảnh đại diện (cắt tròn), tên hiển thị, giới thiệu, trường đang học. Lưu một nút, không qua nhiều bước. */
export const EditProfileModal: React.FC<EditProfileModalProps> = ({ open, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [campuses, setCampuses] = useState<Array<{ id: string; name: string; universityName?: string }>>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Ảnh mới tải lên phải được ban quản trị duyệt thì người khác mới thấy (chính chủ thấy ngay)
  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarAssetId, setAvatarAssetId] = useState<string | null | undefined>(undefined); // undefined = không đổi
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAvatarAssetId(undefined);
    setLoading(true);
    Promise.all([axios.get('/api/v1/me/profile'), axios.get('/api/v1/places/meta')])
      .then(([p, m]) => {
        const d = p.data?.data || {};
        form.setFieldsValue({
          displayName: d.displayName,
          bio: d.bio || '',
          universityCampusId: d.universityCampusId || (d.customUniversityName ? OTHER : undefined),
          customUniversityName: d.customUniversityName || '',
          isUniversityPublic: d.isUniversityPublic ?? true,
        });
        setAvatarUrl(d.avatarUrl || null);
        setAvatarPending(d.avatarModerationStatus === 'PENDING');
        setCampuses(m.data?.data?.campuses || []);
      })
      .catch(() => message.error('Không tải được hồ sơ'))
      .finally(() => setLoading(false));
  }, [open, form]);

  const save = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        displayName: values.displayName,
        bio: values.bio?.trim() || null,
        universityCampusId: values.universityCampusId && values.universityCampusId !== OTHER ? values.universityCampusId : null,
        customUniversityName: values.universityCampusId === OTHER ? values.customUniversityName?.trim() || null : null,
        isUniversityPublic: Boolean(values.isUniversityPublic),
      };
      if (avatarAssetId !== undefined) body.avatarAssetId = avatarAssetId;
      await axios.put('/api/v1/me/profile', body);
      message.success('Đã lưu hồ sơ');
      onSaved();
      onClose();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Không lưu được hồ sơ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Chỉnh sửa hồ sơ" onCancel={onClose} onOk={save} okText="Lưu" cancelText="Hủy" confirmLoading={saving} destroyOnHidden loading={loading}>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
        <AvatarUploader
          value={avatarUrl}
          onChange={(assetId, preview) => {
            setAvatarAssetId(assetId);
            setAvatarUrl(preview);
            setAvatarPending(Boolean(assetId));
          }}
        />
      </div>
      <Form form={form} layout="vertical">
        <Form.Item name="displayName" label="Tên hiển thị" rules={[{ required: true, min: 2, max: 60, message: 'Tên từ 2 đến 60 ký tự' }]}>
          <Input placeholder="Ví dụ: Nguyễn Văn An" maxLength={60} />
        </Form.Item>
        <Form.Item name="bio" label="Giới thiệu ngắn" extra="Hiện dưới tên bạn trên hồ sơ">
          <Input.TextArea rows={3} maxLength={300} showCount placeholder="Sinh viên năm 3 CNTT, mê cà phê học bài đêm…" />
        </Form.Item>
        <Form.Item name="universityCampusId" label="Trường / cơ sở đang học">
          <SelectWithOther
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Chọn trường"
            data-testid="profile-campus"
            otherLabel="Trường khác (tự ghi tên)"
            otherButtonText="Trường của tôi không có trong danh sách"
            otherTestId="profile-campus-pick-other"
            options={campuses.map((c) => ({ value: c.id, label: c.universityName ? `${c.name} — ${c.universityName}` : c.name }))}
          />
        </Form.Item>
        <Form.Item noStyle shouldUpdate={(a, b) => a.universityCampusId !== b.universityCampusId}>
          {({ getFieldValue }) =>
            getFieldValue('universityCampusId') === OTHER ? (
              <Form.Item name="customUniversityName" label="Tên trường / cơ sở của bạn" rules={[{ required: true, whitespace: true, message: 'Ghi tên trường' }, { max: 120, message: 'Tối đa 120 ký tự' }]} extra="Trường chưa có trong danh sách — ghi tên để hiện trên hồ sơ, ban quản trị sẽ bổ sung sau.">
                <Input placeholder="Ví dụ: Trường ĐH Công nghệ Sài Gòn — cơ sở Bình Thạnh" maxLength={120} data-testid="profile-campus-other" />
              </Form.Item>
            ) : null
          }
        </Form.Item>
        <Form.Item name="isUniversityPublic" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Switch checkedChildren="Hiện trường trên hồ sơ" unCheckedChildren="Ẩn trường" />
        </Form.Item>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {avatarPending
            ? 'Ảnh đại diện đang chờ ban quản trị duyệt — bạn thấy ngay, người khác thấy sau khi được duyệt.'
            : 'Ảnh đại diện mới sẽ hiển thị với người khác sau khi ban quản trị duyệt (thường trong ít phút).'}
        </Text>
      </Form>
    </Modal>
  );
};

export default EditProfileModal;
