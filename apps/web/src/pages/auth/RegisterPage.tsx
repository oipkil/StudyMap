import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, message } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { Lock, User, Mail, Coffee, IdCard } from 'lucide-react';

const { Title, Text } = Typography;

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onFinish = async (values: any) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await register(values);
      message.success('Đăng ký thành công! Email xác thực đã được gửi tới hòm thư của bạn.');
      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 460, margin: '40px auto', padding: '0 16px' }}>
      <Card style={{ boxShadow: '0 8px 24px rgba(74, 46, 24, 0.08)', borderRadius: 14, border: '1px solid #EAE3D9' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Coffee size="1em" style={{ fontSize: 44, color: '#6F4E37' }} />
          <Title level={3} style={{ marginTop: 12, marginBottom: 4, color: '#4A2E18', fontWeight: 800 }}>
            Tạo Tài Khoản Sinh Viên
          </Title>
          <Text type="secondary" style={{ color: '#7A6C60' }}>Cùng đóng góp và khám phá quán cà phê học bài tốt nhất</Text>
        </div>

        {errorMessage && (
          <Alert title={errorMessage} type="error" showIcon style={{ marginBottom: 16 }} />
        )}

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="displayName"
            label="Họ và Tên Hiển Thị"
            rules={[{ required: true, message: 'Vui lòng nhập tên hiển thị' }]}
          >
            <Input prefix={<IdCard size="1em" />} placeholder="Ví dụ: Nguyễn Văn An" size="large" />
          </Form.Item>

          <Form.Item
            name="username"
            label="Tên Người Dùng (Username)"
            rules={[
              { required: true, message: 'Vui lòng nhập username' },
              { min: 3, message: 'Tối thiểu 3 ký tự' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: 'Chỉ chứa chữ cái, số và dấu gạch dưới' },
            ]}
          >
            <Input prefix={<User size="1em" />} placeholder="Ví dụ: an_nguyen" size="large" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Địa Chỉ Email"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không hợp lệ' },
            ]}
          >
            <Input prefix={<Mail size="1em" />} placeholder="sinhvien@hcmus.edu.vn" size="large" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật Khẩu"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
            ]}
          >
            <Input.Password prefix={<Lock size="1em" />} placeholder="••••••••" size="large" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Đăng Ký Tài Khoản
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">Đã có tài khoản? </Text>
            <Link to="/login">Đăng nhập ngay</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};
