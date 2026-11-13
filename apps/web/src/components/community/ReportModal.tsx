import React, { useState } from 'react';
import { Modal, Form, Select, Input, Button, Space, message, Typography } from 'antd';
import axios from 'axios';
import { Flag } from 'lucide-react';

const { Paragraph } = Typography;

interface ReportModalProps {
  targetType: 'PLACE' | 'REVIEW' | 'COMMENT' | 'USER';
  targetId: string;
  targetTitle?: string;
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  targetType,
  targetId,
  targetTitle,
  visible,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const res = await axios.post('/api/v1/community/reports', {
        targetType,
        targetId,
        // Đúng hợp đồng API (ReportCreateSchema): reasonCode + description
        reasonCode: values.reason,
        description: values.details || undefined,
      });

      if (res.data.success) {
        message.success('Cảm ơn bạn đã báo cáo. Đội ngũ quản trị viên sẽ xem xét xử lý nội dung vi phạm sớm nhất.');
        form.resetFields();
        onClose();
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      if (err?.errorFields) return; // lỗi validate form: antd đã hiển thị dưới ô nhập
      message.error(err.response?.data?.message || 'Có lỗi xảy ra khi gửi báo cáo');
    } finally {
      setSubmitting(false);
    }
  };

  const getTargetTypeLabel = () => {
    switch (targetType) {
      case 'PLACE':
        return 'địa điểm quán';
      case 'REVIEW':
        return 'bài đánh giá';
      case 'COMMENT':
        return 'bình luận';
      default:
        return 'nội dung';
    }
  };

  return (
    <Modal
      title={
        <Space>
          <Flag size="1em" style={{ color: '#ff4d4f' }} />
          <span>Báo Cáo Vi Phạm {getTargetTypeLabel().toUpperCase()}</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        {targetTitle ? `Nội dung: "${targetTitle}"` : `Báo cáo ${getTargetTypeLabel()}`}
      </Paragraph>

      <Form form={form} layout="vertical" initialValues={{ reason: 'SPAM' }}>
        <Form.Item
          name="reason"
          label="Lý Do Báo Cáo"
          rules={[{ required: true, message: 'Vui lòng chọn lý do' }]}
        >
          <Select
            options={[
              { value: 'SPAM', label: 'Quảng cáo rác / Tin nhắn lặp lại (Spam)' },
              { value: 'MISINFORMATION', label: 'Thông tin sai sự thật / Quán đã đổi địa chỉ / Lừa đảo' },
              { value: 'INAPPROPRIATE', label: 'Ngôn từ phản cảm, thô tục hoặc đả kích' },
              { value: 'HARASSMENT', label: 'Quấy rối / Công kích cá nhân' },
              { value: 'OTHER', label: 'Lý do khác' },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="details"
          label="Chi Tiết Bổ Sung (Không bắt buộc)"
        >
          <Input.TextArea
            rows={3}
            placeholder="Mô tả cụ thể hơn để ban quản trị dễ dàng đối chiếu và xử lý..."
          />
        </Form.Item>

        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <Space>
            <Button onClick={onClose}>Hủy</Button>
            <Button type="primary" danger onClick={handleSubmit} loading={submitting}>
              Gửi Báo Cáo Vi Phạm
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default ReportModal;
