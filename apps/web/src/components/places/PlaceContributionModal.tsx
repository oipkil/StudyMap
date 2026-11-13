import { PlaceSuggestionForm } from './PlaceSuggestionForm';
import { Grid } from 'antd';
import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Form,
  Input,
  Select,
  Button,
  Space,
  Checkbox,
  message,
  Typography,
} from 'antd';
import axios from 'axios';
import { CirclePlus } from 'lucide-react';

const { Paragraph } = Typography;

interface PlaceContributionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultPlaceId?: string;
  /** Đề xuất quán cần sửa & gửi lại (mở thẳng tab đề xuất với dữ liệu cũ). */
  editingSuggestion?: any | null;
}

export const PlaceContributionModal: React.FC<PlaceContributionModalProps> = ({
  visible,
  onClose,
  onSuccess,
  defaultPlaceId,
  editingSuggestion,
}) => {
  const [activeTab, setActiveTab] = useState<'suggestion' | 'survey' | 'change'>('suggestion');
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [, setCategories] = useState<any[]>([]);
  const [places, setPlaces] = useState<any[]>([]);


  const [formSurvey] = Form.useForm();
  const [formChange] = Form.useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (visible) {
      fetchInitialData();
    }
  }, [visible]);

  const fetchInitialData = async () => {
    try {
      const placesRes = await axios.get('/api/v1/places?limit=100');
      if (placesRes.data.success) {
        setPlaces(placesRes.data.data);
      }
      const metaRes = await axios.get('/api/v1/places/meta');
      if (metaRes.data.success) {
        setCategories(metaRes.data.data.categories || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const onSubmitSurvey = async () => {
    try {
      const values = await formSurvey.validateFields();
      setSubmitting(true);

      const res = await axios.post(`/api/v1/places/${values.placeId}/survey-requests`, {
        reason: values.reason,
        targetAspects: values.targetAspects,
      });

      if (res.data.success) {
        message.success('Đã gửi yêu cầu khảo sát thông tin quán thành công');
        formSurvey.resetFields();
        onClose();
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      if (err?.errorFields) return; // lỗi validate form: antd đã hiển thị dưới từng ô, không toast chung
      message.error(err.response?.data?.message || 'Có lỗi xảy ra khi gửi yêu cầu khảo sát');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Đề xuất cập nhật quán
  const onSubmitChange = async () => {
    try {
      const values = await formChange.validateFields();
      setSubmitting(true);

      const selectedPlace = places.find((p) => p.placeId === values.placeId);
      const res = await axios.post(`/api/v1/places/${values.placeId}/change-requests`, {
        baseRevisionId: selectedPlace?.publishedRevisionId || '00000000-0000-0000-0000-000000000000',
        requestedChanges: {
          note: values.note,
          updatedFields: values.updatedFields,
        },
      });

      if (res.data.success) {
        message.success('Đã gửi đề xuất cập nhật quán vào hàng đợi kiểm duyệt');
        formChange.resetFields();
        onClose();
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      if (err?.errorFields) return; // lỗi validate form: antd đã hiển thị dưới từng ô, không toast chung
      message.error(err.response?.data?.message || 'Có lỗi xảy ra khi gửi đề xuất cập nhật');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <Space>
          <CirclePlus size="1em" style={{ color: '#2F6B4F' }} />
          <span style={{ fontSize: isMobile ? 16 : undefined }}>Đóng góp cho bản đồ quán</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={isMobile ? '100vw' : activeTab === 'suggestion' ? 1040 : 720}
      style={isMobile ? { top: 0, margin: 0, maxWidth: '100vw', paddingBottom: 0 } : { top: 16, maxWidth: 'calc(100vw - 16px)' }}
      styles={{
        container: isMobile ? { borderRadius: 0, minHeight: '100vh', padding: '12px 8px 0' } : undefined,
        body: { padding: activeTab === 'suggestion' ? (isMobile ? '0 0 8px' : '8px 8px 16px') : undefined },
      }}
      destroyOnHidden
    >
      <Tabs
        size={isMobile ? 'middle' : 'large'}
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        tabBarStyle={{ padding: isMobile ? 0 : '0 8px', marginBottom: isMobile ? 8 : 16 }}
        items={[
          {
            key: 'suggestion',
            label: isMobile ? 'Đề xuất quán' : 'Đề xuất quán mới',
            children: (
              <PlaceSuggestionForm
                editing={editingSuggestion}
                onCancel={onClose}
                onSubmitted={() => {
                  onClose();
                  if (onSuccess) onSuccess();
                }}
              />
            ),
          },
          {
            key: 'survey',
            label: isMobile ? 'Khảo sát' : 'Yêu cầu khảo sát quán',
            children: (
              <Form form={formSurvey} layout="vertical">
                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                  Gửi yêu cầu tới cộng đồng sinh viên và ban quản trị để đến quán kiểm tra thực tế các thông tin chưa rõ ràng.
                </Paragraph>
                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                  Quán bạn muốn nói tới chưa có trên bản đồ?{' '}
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setActiveTab('suggestion')}>
                    Đề xuất quán mới
                  </Button>
                </Paragraph>

                <Form.Item
                  name="placeId"
                  label="Chọn Quán Cần Khảo Sát"
                  initialValue={defaultPlaceId}
                  rules={[{ required: true, message: 'Vui lòng chọn quán' }]}
                >
                  <Select
                    showSearch
                    placeholder="Tìm theo tên quán..."
                    optionFilterProp="label"
                    options={places.map((p) => ({ value: p.placeId, label: p.name }))}
                  />
                </Form.Item>

                <Form.Item
                  name="targetAspects"
                  label="Các Tiêu Chí Cần Khảo Sát Thêm"
                  rules={[{ required: true, message: 'Vui lòng chọn ít nhất một tiêu chí' }]}
                >
                  <Checkbox.Group style={{ width: '100%' }}>
                    <Space orientation="vertical">
                      <Checkbox value="wifi_quality">Kiểm tra tốc độ & độ ổn định Wi-Fi</Checkbox>
                      <Checkbox value="power_sockets">Số lượng ổ cắm điện tại các bàn học</Checkbox>
                      <Checkbox value="noise_level">Mức độ yên tĩnh để học bài / họp nhóm</Checkbox>
                      <Checkbox value="air_conditioner">Hệ thống máy lạnh & nhiệt độ phòng</Checkbox>
                      <Checkbox value="menu_prices">Giá thực tế & menu mới nhất</Checkbox>
                    </Space>
                  </Checkbox.Group>
                </Form.Item>

                <Form.Item
                  name="reason"
                  label="Lý Do Hoặc Ghi Chú Khảo Sát"
                  rules={[{ required: true, message: 'Vui lòng nhập lý do khảo sát' }]}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder="Ví dụ: Quán mới đổi chủ, bàn tầng 2 có thêm ổ cắm nhưng chưa cập nhật..."
                  />
                </Form.Item>

                <div style={{ textAlign: 'right', marginTop: 16 }}>
                  <Button type="primary" onClick={onSubmitSurvey} loading={submitting}>
                    Gửi Yêu Cầu Khảo Sát
                  </Button>
                </div>
              </Form>
            ),
          },
          {
            key: 'change',
            label: isMobile ? 'Báo sửa' : 'Đề xuất cập nhật quán',
            children: (
              <Form form={formChange} layout="vertical">
                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                  Phát hiện quán đổi giờ mở cửa, tăng giá nước hoặc có thêm tiện ích mới? Hãy đề xuất chỉnh sửa để ban quản trị đối chiếu và duyệt!
                </Paragraph>
                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                  Quán bạn muốn nói tới chưa có trên bản đồ?{' '}
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setActiveTab('suggestion')}>
                    Đề xuất quán mới
                  </Button>
                </Paragraph>

                <Form.Item
                  name="placeId"
                  label="Chọn Quán Cần Cập Nhật"
                  initialValue={defaultPlaceId}
                  rules={[{ required: true, message: 'Vui lòng chọn quán' }]}
                >
                  <Select
                    showSearch
                    placeholder="Tìm theo tên quán..."
                    optionFilterProp="label"
                    options={places.map((p) => ({ value: p.placeId, label: p.name }))}
                  />
                </Form.Item>

                <Form.Item
                  name="note"
                  label="Mô Tả Những Điểm Cần Thay Đổi"
                  rules={[{ required: true, message: 'Vui lòng mô tả thông tin thay đổi' }]}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder="Ví dụ: Quán giờ đã mở cửa 24/24 thay vì đóng lúc 22h, giá nước tăng thêm 5.000đ từ tháng này..."
                  />
                </Form.Item>

                <div style={{ textAlign: 'right', marginTop: 16 }}>
                  <Button type="primary" onClick={onSubmitChange} loading={submitting}>
                    Gửi Đề Xuất Cập Nhật
                  </Button>
                </div>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default PlaceContributionModal;
