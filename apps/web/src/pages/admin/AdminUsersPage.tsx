import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Lock, Unlock, UserCog } from 'lucide-react';
import {
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  message,
  Card,
  Alert,
} from 'antd';

const { Title, Text } = Typography;

export const AdminUsersPage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState<boolean>(false);
  const [isLockModalOpen, setIsLockModalOpen] = useState<boolean>(false);
  const [roleForm] = Form.useForm();
  const [lockForm] = Form.useForm();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/users');
      if (res.data.success) {
        setUsers(res.data.data);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (values: any) => {
    try {
      const res = await axios.patch(`/api/v1/admin/users/${selectedUser.id}/role`, values);
      if (res.data.success) {
        message.success(res.data.data.message);
        setIsRoleModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể thay đổi vai trò');
    }
  };

  const handleLockUser = async (values: any) => {
    try {
      const res = await axios.patch(`/api/v1/admin/users/${selectedUser.id}/lock`, {
        isLocked: !selectedUser.isLocked,
        reason: values.reason,
      });
      if (res.data.success) {
        message.success(res.data.data.message);
        setIsLockModalOpen(false);
        fetchUsers();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể cập nhật trạng thái khóa');
    }
  };

  const columns = [
    {
      title: 'Tài khoản',
      dataIndex: 'username',
      key: 'username',
      render: (text: string, record: any) => (
        <div>
          <Text strong>{text}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 13 }}>{record.email}</Text>
        </div>
      ),
    },
    {
      title: 'Tên hiển thị',
      dataIndex: ['profile', 'displayName'],
      key: 'displayName',
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'ADMIN' ? 'gold' : 'blue'}>
          {role === 'ADMIN' ? 'Quản Trị Viên' : 'Sinh Viên'}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_: any, record: any) => (
        <Space>
          {record.isLocked ? (
            <Tag color="red">Đã Khóa</Tag>
          ) : (
            <Tag color="green">Đang Hoạt Động</Tag>
          )}
          {record.isEmailVerified ? (
            <Tag color="default">Email Đã Xác Thực</Tag>
          ) : (
            <Tag color="default">Chưa Xác Thực</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Hành động',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button
            size="small"
            icon={<UserCog size="1em" />}
            onClick={() => {
              setSelectedUser(record);
              roleForm.setFieldsValue({ role: record.role });
              setIsRoleModalOpen(true);
            }}
          >
            Đổi Quyền
          </Button>

          <Button
            size="small"
            danger={!record.isLocked}
            icon={record.isLocked ? <Unlock size="1em" /> : <Lock size="1em" />}
            onClick={() => {
              setSelectedUser(record);
              lockForm.resetFields();
              setIsLockModalOpen(true);
            }}
          >
            {record.isLocked ? 'Mở Khóa' : 'Khóa'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Người dùng & phân quyền
          </Title>
          <Text type="secondary">
            Kiểm soát danh sách tài khoản, khóa phiên và cấp/thu hồi quyền hạn (Có bảo vệ admin cuối cùng).
          </Text>
        </div>
      </div>

      <Alert
        title="Bảo Vệ Quản Trị Viên Cuối Cùng"
        description="Hệ thống tự động ngăn chặn hành động hạ quyền hoặc khóa tài khoản của quản trị viên hoạt động duy nhất nhằm bảo đảm an toàn vận hành hệ thống."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card>
        <Table dataSource={users} columns={columns} rowKey="id" loading={loading} scroll={{ x: 'max-content' }} />
      </Card>

      {/* Modal Đổi Quyền */}
      <Modal
        title={`Thay đổi vai trò: ${selectedUser?.username}`}
        open={isRoleModalOpen}
        onCancel={() => setIsRoleModalOpen(false)}
        footer={null}
      >
        <Form form={roleForm} layout="vertical" onFinish={handleRoleChange}>
          <Form.Item name="role" label="Vai trò mới" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="USER">Sinh Viên (USER)</Select.Option>
              <Select.Option value="ADMIN">Quản Trị Viên (ADMIN)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="reason"
            label="Lý do thay đổi (Lưu Audit Log)"
            rules={[{ required: true, min: 5, message: 'Vui lòng cung cấp lý do tối thiểu 5 ký tự' }]}
          >
            <Input.TextArea rows={3} placeholder="Ví dụ: Bổ sung nhân sự kiểm duyệt nội dung quán..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Button onClick={() => setIsRoleModalOpen(false)} style={{ marginRight: 8 }}>
              Hủy
            </Button>
            <Button type="primary" htmlType="submit">
              Xác Nhận Đổi Quyền
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Khóa / Mở Khóa */}
      <Modal
        title={`${selectedUser?.isLocked ? 'Mở khóa' : 'Khóa'} tài khoản: ${selectedUser?.username}`}
        open={isLockModalOpen}
        onCancel={() => setIsLockModalOpen(false)}
        footer={null}
      >
        <Form form={lockForm} layout="vertical" onFinish={handleLockUser}>
          <Form.Item
            name="reason"
            label="Lý do xử lý (Lưu Audit Log & thông báo cho người dùng)"
            rules={[{ required: true, min: 5, message: 'Vui lòng cung cấp lý do tối thiểu 5 ký tự' }]}
          >
            <Input.TextArea rows={3} placeholder="Ví dụ: Đăng tải nội dung spam, bình luận không phù hợp..." />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Button onClick={() => setIsLockModalOpen(false)} style={{ marginRight: 8 }}>
              Hủy
            </Button>
            <Button type="primary" danger={!selectedUser?.isLocked} htmlType="submit">
              Xác Nhận {selectedUser?.isLocked ? 'Mở Khóa' : 'Khóa Tài Khoản'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
