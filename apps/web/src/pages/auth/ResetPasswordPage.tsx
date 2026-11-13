import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, message, Result } from 'antd';
import axios from 'axios';
import { Lock, Coffee } from 'lucide-react';

const { Title, Text } = Typography;

export const ResetPasswordPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onFinish = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await axios.post('/api/v1/auth/reset-password', {
        token,
        newPassword: values.newPassword,
      });
      if (res.data.success) {
        setSuccess(true);
        message.success('Đặt lại mật khẩu thành công! Toàn bộ phiên cũ đã bị thu hồi.');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Mã xác thực không hợp lệ hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '60px auto', padding: '0 16px' }}>
      <Card style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)', borderRadius: 8 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Coffee size="1em" style={{ fontSize: 40, color: '#2F6B4F' }} />
          <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>
            Đặt Lại Mật Khẩu Mới
          </Title>
          <Text type="secondary">Tạo mật khẩu mới an toàn cho tài khoản của bạn</Text>
        </div>

        {success ? (
          <Result
            status="success"
            title="Đổi Mật Khẩu Thành Công!"
            subTitle="Bạn có thể đăng nhập ngay bây giờ bằng mật khẩu mới."
            extra={
              <Button type="primary" onClick={() => navigate('/login')}>
                Đến Trang Đăng Nhập
              </Button>
            }
          />
        ) : (
          <>
            {errorMessage && (
              <Alert title={errorMessage} type="error" showIcon style={{ marginBottom: 16 }} />
            )}

            <Form layout="vertical" onFinish={onFinish}>
              <Form.Item
                name="newPassword"
                label="Mật Khẩu Mới"
                rules={[
                  { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                  { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
                ]}
              >
                <Input.Password prefix={<Lock size="1em" />} placeholder="••••••••" size="large" />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label="Xác Nhận Mật Khẩu Mới"
                rules={[{ required: true, message: 'Vui lòng xác nhận lại mật khẩu' }]}
              >
                <Input.Password prefix={<Lock size="1em" />} placeholder="••••••••" size="large" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                  Xác Nhận Đổi Mật Khẩu
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
};
export default ResetPasswordPage;
