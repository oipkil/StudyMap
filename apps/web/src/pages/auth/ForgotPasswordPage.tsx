import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Alert, message, Result } from 'antd';
import axios from 'axios';
import { Mail, Coffee, ArrowLeft } from 'lucide-react';

const { Title, Text } = Typography;

export const ForgotPasswordPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await axios.post('/api/v1/auth/forgot-password', values);
      if (res.data.success) {
        setSubmitted(true);
        message.success('Đã gửi liên kết đặt lại mật khẩu');
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Có lỗi xảy ra khi gửi yêu cầu.');
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
            Quên Mật Khẩu
          </Title>
          <Text type="secondary">Nhập email sinh viên để nhận liên kết khôi phục</Text>
        </div>

        {submitted ? (
          <Result
            status="success"
            title="Đã Gửi Email Khôi Phục!"
            subTitle="Vui lòng kiểm tra hộp thư đến để tiến hành đặt lại mật khẩu mới."
            extra={
              <Link to="/login">
                <Button type="primary">Quay lại Đăng nhập</Button>
              </Link>
            }
          />
        ) : (
          <>
            {errorMessage && (
              <Alert title={errorMessage} type="error" showIcon style={{ marginBottom: 16 }} />
            )}

            <Form layout="vertical" onFinish={onFinish}>
              <Form.Item
                name="email"
                label="Địa chỉ Email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email' },
                  { type: 'email', message: 'Email không đúng định dạng' },
                ]}
              >
                <Input prefix={<Mail size="1em" />} placeholder="sinhvien1@hcmus.edu.vn" size="large" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                  Gửi Liên Kết Đặt Lại
                </Button>
              </Form.Item>

              <div style={{ textAlign: 'center' }}>
                <Link to="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <ArrowLeft size="1em" /> Quay lại Đăng nhập
                </Link>
              </div>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
};
export default ForgotPasswordPage;
