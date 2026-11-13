import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Space, Avatar, Dropdown, Typography, Drawer, Grid } from 'antd';
import {
  Coffee,
  Compass,
  Scale,
  Bookmark,
  PlusCircle,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  Menu as MenuIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { NotificationPopover } from '../notifications/NotificationPopover';

const { Header } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

export const AppNavbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const isMobile = screens.xs || (screens.sm && !screens.md);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const userMenuItems = [
    {
      key: 'user-info',
      disabled: true,
      label: (
        <div style={{ padding: '4px 0' }}>
          <Text strong>{user?.displayName || user?.username}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {user?.role === 'ADMIN' ? 'Quản trị viên' : 'Sinh viên'}
          </Text>
        </div>
      ),
    },
    { type: 'divider' as const },
    ...(user?.role === 'ADMIN'
      ? [
          {
            key: 'admin',
            icon: <LayoutDashboard size={15} style={{ verticalAlign: 'middle' }} />,
            label: 'Trang Quản Trị Hệ Thống',
            onClick: () => navigate('/admin'),
          },
        ]
      : []),
    {
      key: 'profile',
      icon: <UserIcon size={15} style={{ verticalAlign: 'middle' }} />,
      label: 'Hồ Sơ Của Tôi',
      onClick: () => navigate(`/users/${user?.id}`),
    },
    {
      key: 'collections',
      icon: <Bookmark size={15} style={{ verticalAlign: 'middle' }} />,
      label: 'Đã lưu',
      onClick: () => navigate(`/users/${user?.id}?tab=saved`),
    },
    {
      key: 'contributions',
      icon: <PlusCircle size={15} style={{ verticalAlign: 'middle' }} />,
      label: 'Đóng Góp Của Tôi',
      onClick: () => navigate(`/users/${user?.id}?tab=contributions`),
    },
    {
      key: 'logout',
      icon: <LogOut size={15} style={{ verticalAlign: 'middle' }} />,
      danger: true,
      label: 'Đăng xuất',
      onClick: handleLogout,
    },
  ];

  return (
    <Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid #EAE3D9',
        boxShadow: '0 2px 10px rgba(74, 46, 24, 0.04)',
        padding: isMobile ? '0 12px' : '0 24px',
        height: 64,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 20, flexShrink: 0 }}>
        {isMobile && (
          <Button
            type="text"
            icon={<MenuIcon size={20} color="#4A2E18" style={{ verticalAlign: 'middle' }} />}
            onClick={() => setMobileDrawerOpen(true)}
            style={{ padding: '4px 6px' }}
          />
        )}

        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <img src="/logo-96.png" alt="" width={isMobile ? 28 : 32} height={isMobile ? 28 : 32} style={{ borderRadius: 8, display: 'block', border: '1px solid #EAE3D9' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: '#4A2E18', whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
              StudyMap
            </span>
            {!isMobile && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#C67D34', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Coffee size={11} /> Bản Đồ Cà Phê & Góc Học Sinh Viên
              </span>
            )}
          </div>
        </Link>

        {!isMobile && (
          <Menu
            mode="horizontal"
            selectedKeys={[location.pathname]}
            style={{ borderBottom: 'none', minWidth: 320, background: 'transparent' }}
            items={[
              {
                key: '/',
                icon: <Coffee size={16} color="#6F4E37" style={{ verticalAlign: 'middle' }} />,
                label: <Link to="/" style={{ fontWeight: 500 }}>Khám Phá Quán</Link>,
              },
              {
                key: '/map',
                icon: <Compass size={16} color="#6F4E37" style={{ verticalAlign: 'middle' }} />,
                label: <Link to="/map" style={{ fontWeight: 500 }}>Bản Đồ Học Tập</Link>,
              },
              {
                key: '/compare',
                icon: <Scale size={16} color="#6F4E37" style={{ verticalAlign: 'middle' }} />,
                label: <Link to="/compare" style={{ fontWeight: 500 }}>So Sánh Tiện Ích</Link>,
              },
            ]}
          />
        )}
      </div>

      <Space size={isMobile ? 'small' : 'middle'} style={{ flexShrink: 0 }}>
        {user ? (
          <>
            <NotificationPopover />

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" arrow>
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                <Avatar
                  icon={<UserIcon size={14} />}
                  src={user.avatarUrl}
                  size="small"
                  style={{ backgroundColor: user.role === 'ADMIN' ? '#C67D34' : '#6F4E37' }}
                />
                {!isMobile && (
                  <Text style={{ maxWidth: 140, display: 'inline-block', verticalAlign: 'middle', color: '#261C14', fontWeight: 500 }} ellipsis>
                    {user.displayName || user.username}
                  </Text>
                )}
              </div>
            </Dropdown>
          </>
        ) : (
          <Space size={isMobile ? 6 : 'small'}>
            <Button size="small" onClick={() => navigate('/login')} style={{ borderColor: '#EAE3D9', color: '#4A2E18', padding: isMobile ? '0 10px' : undefined, fontWeight: 500, borderRadius: 6 }}>
              Đăng nhập
            </Button>
            <Button size="small" type="primary" onClick={() => navigate('/register')} style={{ background: '#6F4E37', padding: isMobile ? '0 10px' : undefined, fontWeight: 500, borderRadius: 6 }}>
              Đăng ký
            </Button>
          </Space>
        )}
      </Space>

      {/* Mobile Nav Drawer */}
      <Drawer
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Coffee size={16} color="#6F4E37" /> StudyMap • Menu
          </span>
        }
        placement="left"
        onClose={() => setMobileDrawerOpen(false)}
        open={mobileDrawerOpen}
        size={270}
      >
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={() => setMobileDrawerOpen(false)}
          items={[
            {
              key: '/',
              icon: <Coffee size={16} color="#6F4E37" style={{ verticalAlign: 'middle' }} />,
              label: <Link to="/">Khám Phá Quán</Link>,
            },
            {
              key: '/map',
              icon: <Compass size={16} color="#6F4E37" style={{ verticalAlign: 'middle' }} />,
              label: <Link to="/map">Bản Đồ Học Tập</Link>,
            },
            {
              key: '/compare',
              icon: <Scale size={16} color="#6F4E37" style={{ verticalAlign: 'middle' }} />,
              label: <Link to="/compare">So Sánh Quán</Link>,
            },
            {
              key: '/me/collections',
              icon: <Bookmark size={16} color="#B5484D" style={{ verticalAlign: 'middle' }} />,
              label: <Link to="/me/collections">Đã Lưu</Link>,
            },
            {
              key: '/me/contributions',
              icon: <PlusCircle size={16} color="#C67D34" style={{ verticalAlign: 'middle' }} />,
              label: <Link to="/me/contributions">Đóng Góp Của Tôi</Link>,
            },
            ...(user?.role === 'ADMIN'
              ? [
                  {
                    key: '/admin',
                    icon: <LayoutDashboard size={16} style={{ verticalAlign: 'middle' }} />,
                    label: <Link to="/admin">Trang Quản Trị</Link>,
                  },
                ]
              : []),
          ]}
        />
      </Drawer>
    </Header>
  );
};
export default AppNavbar;
