import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  DatePicker,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR' | 'CRITICAL';
  audience: 'ALL' | 'USERS' | 'ADMINS';
  pageScope: 'ALL' | 'DISCOVER' | 'MAP' | 'DETAIL';
  isActive: boolean;
  version: number;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
}

export const AdminAnnouncementsPage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<AnnouncementItem | null>(null);
  const [form] = Form.useForm();

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/admin/announcements');
      if (res.data.success && res.data.data) {
        const raw = Array.isArray(res.data.data) ? res.data.data : res.data.data.items || [];
        // Ánh xạ tên trường API -> tên trường trang (level/targetAudience/targetPageScope/isPublished/startAt/endAt)
        setAnnouncements(raw.map((a: any) => ({ ...a, type: a.level ?? a.type, audience: a.targetAudience ?? a.audience, pageScope: a.targetPageScope ?? a.pageScope, isActive: a.isPublished ?? a.isActive, startsAt: a.startAt ?? a.startsAt, endsAt: a.endAt ?? a.endsAt })));
      }
    } catch {
      message.error('Không thể nạp danh sách thông báo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleOpenCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'INFO',
      audience: 'ALL',
      pageScope: 'ALL',
      isActive: true,
    });
    setModalVisible(true);
  };

  const handleOpenEdit = (item: AnnouncementItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      title: item.title,
      content: item.content,
      type: item.type,
      audience: item.audience,
      pageScope: item.pageScope,
      isActive: item.isActive,
      dateRange: item.startsAt && item.endsAt ? [dayjs(item.startsAt), dayjs(item.endsAt)] : undefined,
    });
    setModalVisible(true);
  };

  const handleSave = async (values: {
    title: string;
    content: string;
    type: string;
    audience: string;
    pageScope: string;
    isActive: boolean;
    dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
  }) => {
    try {
      // Server yêu cầu startAt/endAt: không chọn lịch -> hiển thị từ bây giờ trong 30 ngày
      const payload = {
        title: values.title,
        content: values.content,
        level: values.type === 'CRITICAL' ? 'ERROR' : values.type,
        targetAudience: values.audience,
        targetPageScope: values.pageScope,
        isPublished: values.isActive ?? true,
        startAt: (values.dateRange?.[0] ?? dayjs()).toISOString(),
        endAt: (values.dateRange?.[1] ?? dayjs().add(30, 'day')).toISOString(),
      };

      if (editingItem) {
        await axios.patch(`/api/v1/admin/announcements/${editingItem.id}`, payload);
        message.success('Cập nhật thông báo thành công (đã nâng version để reset người dùng đã đóng)');
      } else {
        await axios.post('/api/v1/admin/announcements', payload);
        message.success('Tạo thông báo mới thành công');
      }
      setModalVisible(false);
      fetchAnnouncements();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr.response?.data?.message || 'Có lỗi xảy ra khi lưu thông báo');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/v1/admin/announcements/${id}`);
      message.success('Đã xóa thông báo');
      fetchAnnouncements();
    } catch {
      message.error('Không thể xóa thông báo');
    }
  };

  const columns = [
    {
      title: 'Tiêu Đề',
      dataIndex: 'title',
      key: 'title',
      render: (t: string, r: AnnouncementItem) => (
        <div>
          <Text strong>{t}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Phiên bản v{r.version} | Tạo: {new Date(r.createdAt).toLocaleDateString('vi-VN')}
          </Text>
        </div>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const colors: Record<string, string> = {
          INFO: 'green',
          WARNING: 'gold',
          SUCCESS: 'green',
          CRITICAL: 'red',
        };
        const labels: Record<string, string> = { INFO: 'Thông tin', WARNING: 'Cảnh báo', SUCCESS: 'Thành công', CRITICAL: 'Khẩn', ERROR: 'Khẩn' };
        return <Tag color={colors[type] || 'default'}>{labels[type] || type}</Tag>;
      },
    },
    {
      title: 'Đối Tượng & Phạm Vi',
      key: 'scope',
      render: (_: unknown, r: AnnouncementItem) => (
        <Space orientation="vertical" size={2}>
          <Tag>Đối tượng: {({ ALL: 'Mọi người', GUEST: 'Khách', USER: 'Sinh viên', ADMIN: 'Quản trị' } as Record<string, string>)[r.audience] || r.audience}</Tag>
          <Tag>Phạm vi: {({ ALL: 'Mọi trang', DISCOVER: 'Khám phá', MAP: 'Bản đồ', DETAIL: 'Chi tiết quán' } as Record<string, string>)[r.pageScope] || r.pageScope}</Tag>
        </Space>
      ),
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'default'}>{active ? 'Đang bật' : 'Tắt'}</Tag>
      ),
    },
    {
      title: 'Hành Động',
      key: 'actions',
      render: (_: unknown, record: AnnouncementItem) => (
        <Space>
          <Button icon={<Pencil size="1em" />} size="small" onClick={() => handleOpenEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xóa thông báo này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button icon={<Trash2 size="1em" />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Thông báo hệ thống
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0 0' }}>
            Phát thông báo theo lịch trình, đối tượng mục tiêu, và tự động reset khi cập nhật nội dung.
          </Paragraph>
        </div>
        <Button type="primary" icon={<Plus size="1em" />} onClick={handleOpenCreate}>
          Tạo Thông Báo Mới
        </Button>
      </div>

      <Table
        rowKey="id"
        dataSource={announcements}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />

      <Modal
        title={
          <Space>
            <Megaphone size="1em" />
            <span>{editingItem ? 'Chỉnh Sửa Thông Báo' : 'Tạo Thông Báo Mới'}</span>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText={editingItem ? 'Lưu Thay Đổi' : 'Tạo Thông Báo'}
        cancelText="Hủy"
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="title" label="Tiêu Đề Thông Báo" rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}>
            <Input placeholder="Ví dụ: Bảo trì hệ thống đêm nay" />
          </Form.Item>

          <Form.Item
            name="content"
            label="Nội Dung (Hỗ trợ HTML/Markdown)"
            rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}
          >
            <TextArea rows={4} placeholder="Nội dung chi tiết thông báo..." />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="type" label="Mức Độ / Loại" rules={[{ required: true }]}>
              <Select style={{ width: 140 }}>
                <Option value="INFO">Thông tin (INFO)</Option>
                <Option value="WARNING">Cảnh báo (WARNING)</Option>
                <Option value="SUCCESS">Thành công (SUCCESS)</Option>
                <Option value="ERROR">Khẩn cấp (ERROR)</Option>
              </Select>
            </Form.Item>

            <Form.Item name="audience" label="Đối Tượng Nhận" rules={[{ required: true }]}>
              <Select style={{ width: 140 }}>
                <Option value="ALL">Tất cả mọi người</Option>
                <Option value="USERS">Chỉ sinh viên</Option>
                <Option value="ADMINS">Chỉ quản trị viên</Option>
              </Select>
            </Form.Item>

            <Form.Item name="pageScope" label="Trang Hiển Thị" rules={[{ required: true }]}>
              <Select style={{ width: 140 }}>
                <Option value="ALL">Mọi trang</Option>
                <Option value="DISCOVER">Trang Khám phá</Option>
                <Option value="MAP">Trang Bản đồ</Option>
                <Option value="DETAIL">Trang Chi tiết quán</Option>
              </Select>
            </Form.Item>
          </Space>

          <Form.Item name="dateRange" label="Thời Gian Hiển Thị (Tùy chọn)">
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="isActive" label="Kích Hoạt Ngay" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
export default AdminAnnouncementsPage;
