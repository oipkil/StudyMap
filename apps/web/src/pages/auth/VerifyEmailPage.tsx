import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Typography, Result, Button, Spin } from 'antd';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Coffee } from 'lucide-react';

const { Title, Text } = Typography;

/**
 * Trang đích của link trong email xác minh: /verify-email?token=...
 * Gọi GET /api/v1/auth/verify-email?token=... rồi báo kết quả.
 */
export const VerifyEmailPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refetchUser } = useAuth();
  const token = params.get('token') || '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg, setMsg] = useState<string>('');
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    if (!token) {
      setState('error');
      setMsg('Thiếu mã xác minh trong đường dẫn.');
      return;
    }
    axios
      .get('/api/v1/auth/verify-email', { params: { token } })
      .then(async (res) => {
        setState('ok');
        setMsg(res.data?.message || 'Email đã được xác minh.');
        await refetchUser().catch(() => {});
      })
      .catch((err) => {
        setState('error');
        setMsg(err.response?.data?.message || 'Mã xác minh không hợp lệ hoặc đã hết hạn.');
      });
  }, [token]);

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', padding: '0 16px' }}>
      <Card style={{ borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <Coffee size="1em" style={{ fontSize: 40, color: '#2F6B4F' }} />
          <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>
            Xác minh email
          </Title>
          <Text type="secondary">Kích hoạt tài khoản sinh viên của bạn</Text>
        </div>

        {state === 'loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Spin />
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">Đang xác minh…</Text>
            </div>
          </div>
        )}

        {state === 'ok' && (
          <Result
            status="success"
            title="Email đã được xác minh"
            subTitle={msg}
            extra={
              <Button type="primary" onClick={() => navigate('/')}>
                Vào trang Khám phá
              </Button>
            }
          />
        )}

        {state === 'error' && (
          <Result
            status="error"
            title="Không xác minh được"
            subTitle={msg}
            extra={
              <Button onClick={() => navigate('/login')}>Về trang đăng nhập</Button>
            }
          />
        )}
      </Card>
    </div>
  );
};

export default VerifyEmailPage;
