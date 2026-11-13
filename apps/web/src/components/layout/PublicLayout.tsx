import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Layout, Typography } from 'antd';
import { Coffee } from 'lucide-react';
import { AppNavbar } from './AppNavbar';
import { AnnouncementBanner } from '../announcements/AnnouncementBanner';
import { FloatingChatWidget } from '../ai/FloatingChatWidget';

const { Content, Footer } = Layout;
const { Text } = Typography;

export const PublicLayout: React.FC = () => {
  const location = useLocation();
  const isDiscover = location.pathname === '/';

  return (
    <Layout style={{ minHeight: '100vh', background: '#FAF7F2', overflowX: 'hidden', width: '100%' }}>
      <AppNavbar />

      {/* Thông báo banner động toàn hệ thống */}
      <div style={{ margin: isDiscover ? '0' : '8px 16px 0 16px' }}>
        <AnnouncementBanner scope={isDiscover ? 'DISCOVER' : 'ALL'} />
      </div>

      <Content
        style={
          isDiscover
            ? { padding: 0, margin: 0, width: '100%', height: 'calc(100vh - 64px)', overflow: 'hidden' }
            : { padding: '16px', maxWidth: 1280, margin: '0 auto', width: '100%', boxSizing: 'border-box' }
        }
      >
        <Outlet />
      </Content>

      <FloatingChatWidget />

      {!isDiscover && (
        <Footer style={{ textAlign: 'center', background: '#FAF7F2', borderTop: '1px solid #EAE3D9', marginTop: 40, padding: '24px 16px' }}>
          <Text style={{ color: '#7A6C60', fontSize: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Coffee size={13} color="#6F4E37" /> <strong>StudyMap</strong> — Nền Tảng Khám Phá Không Gian Học Tập & Cà Phê Sinh Viên © 2026.
            </span>
            <br />
            Không gian học bài, mật độ ổ cắm, tốc độ Wi-Fi và đồ uống được chia sẻ & kiểm chứng bởi sinh viên.
          </Text>
        </Footer>
      )}
    </Layout>
  );
};

export default PublicLayout;
