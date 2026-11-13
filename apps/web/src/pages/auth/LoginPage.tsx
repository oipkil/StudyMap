import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, message } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { Lock, User, Coffee } from 'lucide-react';

const { Title, Text } = Typography;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onFinish = async (values: any) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await login(values);
      message.success('Đăng nhập thành công!');
      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: '0 16px' }}>
      <Card style={{ boxShadow: '0 8px 24px rgba(74, 46, 24, 0.08)', borderRadius: 14, border: '1px solid #EAE3D9' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Coffee size="1em" style={{ fontSize: 44, color: '#6F4E37' }} />
          <Title level={3} style={{ marginTop: 12, marginBottom: 4, color: '#4A2E18', fontWeight: 800 }}>
            Đăng Nhập StudyMap
          </Title>
          <Text type="secondary" style={{ color: '#7A6C60' }}>Cộng đồng không gian học & cà phê sinh viên</Text>
        </div>

        {errorMessage && (
          <Alert title={errorMessage} type="error" showIcon style={{ marginBottom: 16 }} />
        )}

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="identifier"
            label="Email hoặc Tên người dùng"
            rules={[{ required: true, message: 'Vui lòng nhập email hoặc username' }]}
          >
            <Input prefix={<User size="1em" />} placeholder="admin@ssg.edu.vn hoặc sinhvien1" size="large" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật khẩu"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
          >
            <Input.Password prefix={<Lock size="1em" />} placeholder="••••••••" size="large" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <Link to="/forgot-password" style={{ fontSize: 13 }}>
              Quên mật khẩu?
            </Link>
          </div>

          <Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              Đăng Nhập
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Text type="secondary">Chưa có tài khoản? </Text>
            <Link to="/register">Đăng ký ngay</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};
