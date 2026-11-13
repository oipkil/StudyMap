import React, { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Typography, Result, Button, Space, Avatar, Badge, ConfigProvider, Tooltip, Dropdown, Grid, Drawer } from 'antd';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { LayoutDashboard, Store, LayoutGrid, Users, Bot, MessageSquare, FileCheck, FileImage, Megaphone, Headphones, History, ArrowLeft, User, Smile, SquarePen, PanelLeftClose, PanelLeftOpen, LogOut, Star, MapPin } from 'lucide-react';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const SIDER_W = 248;
const SIDER_W_COLLAPSED = 72;

interface Stats {
  pendingContributions?: number;
  pendingPlaceRevisions?: number;
  pendingReviews?: number;
  pendingReports?: number;
  pendingStickers?: number;
  pendingMedia?: number;
  pendingSupport?: number;
}

/**
 * Khung quản trị: sidebar sáng theo bảng màu chung (nền giấy, một màu nhấn xanh lá),
 * chia nhóm chức năng, badge số việc chờ, thu gọn được; header hiện tên trang hiện tại.
 */
export const AdminLayout: React.FC = () => {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ssg_admin_sider') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [stats, setStats] = useState<Stats>({});
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.lg; // < 992px: sidebar thành Drawer
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Trong Drawer mobile luôn hiện đầy đủ (không thu gọn)
  const effectiveCollapsed = isMobile ? false : collapsed;
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      const fetchStats = async () => {
        try {
          const res = await axios.get('/api/v1/admin/dashboard/stats');
          if (res.data.success && res.data.data) setStats(res.data.data.stats || {});
        } catch {
          // bỏ qua lỗi polling
        }
      };
      fetchStats();
      const interval = setInterval(fetchStats, 20000);
      return () => clearInterval(interval);
    }
    // Nạp lại badge khi đổi trang admin (sau khi duyệt xong, số chờ giảm ngay)
  }, [user, location.pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem('ssg_admin_sider', next ? 'collapsed' : 'open');
    } catch {
      /* bỏ qua */
    }
  };

  // Danh sách chức năng theo nhóm — nguồn duy nhất cho menu, tiêu đề header và badge
  const groups = useMemo(
    () => [
      {
        title: 'Tổng quan',
        items: [{ key: '/admin', icon: <LayoutDashboard size="1em" />, label: 'Tổng quan hệ thống' }],
      },
      {
        title: 'Địa điểm',
        items: [
          { key: '/admin/places', icon: <Store size="1em" />, label: 'Quản lý địa điểm', count: stats.pendingPlaceRevisions },
          { key: '/admin/contributions', icon: <SquarePen size="1em" />, label: 'Duyệt đề xuất quán', count: stats.pendingContributions },
          { key: '/admin/reference', icon: <MapPin size="1em" />, label: 'Cơ sở trường & danh mục' },
          { key: '/admin/dynamic-fields', icon: <LayoutGrid size="1em" />, label: 'Trường thông tin động' },
        ],
      },
      {
        title: 'Kiểm duyệt',
        items: [
          { key: '/admin/reviews', icon: <Star size="1em" />, label: 'Đánh giá & nội dung', count: stats.pendingReviews },
          { key: '/admin/reports', icon: <FileCheck size="1em" />, label: 'Báo cáo vi phạm', count: stats.pendingReports },
          { key: '/admin/media', icon: <FileImage size="1em" />, label: 'Thư viện ảnh', count: stats.pendingMedia },
          { key: '/admin/stickers', icon: <Smile size="1em" />, label: 'Bộ nhãn dán', count: stats.pendingStickers },
        ],
      },
      {
        title: 'Vận hành',
        items: [
          { key: '/admin/support', icon: <Headphones size="1em" />, label: 'Hỗ trợ sinh viên', count: stats.pendingSupport },
          { key: '/admin/announcements', icon: <Megaphone size="1em" />, label: 'Thông báo hệ thống' },
          { key: '/admin/users', icon: <Users size="1em" />, label: 'Người dùng & phân quyền' },
          { key: '/admin/ai', icon: <Bot size="1em" />, label: 'Trợ lý AI' },
          { key: '/admin/integrations', icon: <MessageSquare size="1em" />, label: 'Thông báo Zalo' },
          { key: '/admin/audit-logs', icon: <History size="1em" />, label: 'Nhật ký hệ thống' },
        ],
      },
    ],
    [stats],
  );

  const totalPending = useMemo(
    () => groups.flatMap((g) => g.items).reduce((s, it) => s + (it.count || 0), 0),
    [groups],
  );

  const currentLabel = useMemo(() => {
    const all = groups.flatMap((g) => g.items);
    const hit = all.find((it) => it.key !== '/admin' && pathname.startsWith(it.key)) || all.find((it) => it.key === pathname);
    return hit?.label || 'Quản trị';
  }, [groups, pathname]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Text>Đang kiểm tra quyền hạn...</Text>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    return (
      <div
        style={{
          padding: 48,
          background: '#F7F6F3',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Result
          status="403"
          title="403 - Truy Cập Bị Từ Chối"
          subTitle="Bạn không có quyền quản trị viên để xem khu vực quản trị này. Vui lòng đăng nhập với tài khoản có thẩm quyền."
          extra={
            <Button type="primary" onClick={() => navigate('/')}>
              Về Trang Khám Phá
            </Button>
          }
        />
      </div>
    );
  }

  const countPill = (count?: number) =>
    count && count > 0 ? (
      <span
        style={{
          minWidth: 20,
          height: 20,
          padding: '0 6px',
          borderRadius: 999,
          background: '#2F6B4F',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {count > 99 ? '99+' : count}
      </span>
    ) : null;

  const menuItems = groups.map((g) => ({
    type: 'group' as const,
    key: g.title,
    label: effectiveCollapsed ? null : g.title,
    children: g.items.map((it) => ({
      key: it.key,
      icon: effectiveCollapsed && it.count ? (
        <Badge dot color="#2F6B4F" offset={[2, 0]}>
          {it.icon}
        </Badge>
      ) : (
        it.icon
      ),
      label: (
        <Link to={it.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
          {!effectiveCollapsed && countPill(it.count)}
        </Link>
      ),
    })),
  }));

  // Khóa menu đang chọn: khớp tiền tố đường dẫn (vd. /admin/places/xyz)
  const selectedKey =
    groups.flatMap((g) => g.items).map((it) => it.key).filter((k) => k !== '/admin' && pathname.startsWith(k))[0] ||
    (pathname === '/admin' ? '/admin' : '');

  const siderWidth = effectiveCollapsed ? SIDER_W_COLLAPSED : SIDER_W;

  // Thân sidebar dùng chung cho Sider (desktop) và Drawer (mobile)
  const sidebarBody = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Thương hiệu */}
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: effectiveCollapsed ? '0 0 0 18px' : '0 16px',
          borderBottom: '1px solid #E8E6E1',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <img src="/logo-96.png" alt="" width={36} height={36} style={{ display: 'block' }} />
        </div>
        {!effectiveCollapsed && (
          <div style={{ lineHeight: 1.15, overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1F2421' }}>SSG Quản trị</div>
            <div style={{ fontSize: 11, color: '#6F6B66', marginTop: 2 }}>
              {totalPending > 0 ? `${totalPending} việc đang chờ` : 'Không có việc chờ'}
            </div>
          </div>
        )}
      </div>

      {/* Menu cuộn trong khung khi màn hình thấp */}
      <div className="ssg-admin-menu" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
        <Menu
          mode="inline"
          inlineCollapsed={effectiveCollapsed}
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ border: 'none', background: 'transparent' }}
        />
      </div>

      {/* Chân: người dùng + hành động */}
      <div style={{ borderTop: '1px solid #E8E6E1', padding: effectiveCollapsed ? '10px 0' : '10px 12px' }}>
        {effectiveCollapsed ? (
          <Space orientation="vertical" size={6} style={{ width: '100%', alignItems: 'center' }}>
            <Tooltip title={`${user.displayName || user.username} · Quản trị viên`} placement="right">
              <Avatar icon={<User size="1em" />} style={{ backgroundColor: '#B8860B' }} />
            </Tooltip>
            <Tooltip title="Về trang công khai" placement="right">
              <Button type="text" icon={<ArrowLeft size="1em" />} onClick={() => navigate('/')} />
            </Tooltip>
            <Tooltip title="Mở rộng menu" placement="right">
              <Button type="text" icon={<PanelLeftOpen size="1em" />} onClick={toggleCollapsed} />
            </Tooltip>
          </Space>
        ) : (
          <>
            <Dropdown
              placement="topLeft"
              menu={{
                items: [
                  { key: 'public', icon: <ArrowLeft size="1em" />, label: 'Về trang công khai', onClick: () => navigate('/') },
                  { key: 'profile', icon: <User size="1em" />, label: 'Hồ sơ của tôi', onClick: () => navigate(`/users/${user.id}`) },
                  { type: 'divider' },
                  {
                    key: 'logout',
                    icon: <LogOut size="1em" />,
                    label: 'Đăng xuất',
                    danger: true,
                    onClick: async () => {
                      await logout();
                      navigate('/login');
                    },
                  },
                ],
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 8px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  border: '1px solid transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F0EC')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar icon={<User size="1em" />} style={{ backgroundColor: '#B8860B', flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1, lineHeight: 1.2 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1F2421', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.displayName || user.username}
                  </div>
                  <div style={{ fontSize: 11, color: '#6F6B66' }}>Quản trị viên</div>
                </div>
              </div>
            </Dropdown>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <Button block size="small" icon={<ArrowLeft size="1em" />} onClick={() => navigate('/')}>
                Trang công khai
              </Button>
              {!isMobile && (<Tooltip title="Thu gọn menu">
                <Button size="small" icon={<PanelLeftClose size="1em" />} onClick={toggleCollapsed} />
              </Tooltip>)}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        components: {
          Menu: {
            itemBg: 'transparent',
            itemColor: '#3F3B36',
            itemHoverBg: '#F1F0EC',
            itemHoverColor: '#1F2421',
            itemSelectedBg: '#EEF4F0',
            itemSelectedColor: '#2F6B4F',
            itemBorderRadius: 8,
            itemMarginInline: 10,
            itemMarginBlock: 2,
            itemHeight: 36,
            iconSize: 16,
            collapsedIconSize: 18,
            groupTitleColor: '#9A958E',
            groupTitleFontSize: 11,
            activeBarBorderWidth: 0,
          },
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#F7F6F3' }}>
        {isMobile && (
          <Drawer
            open={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            placement="left"
            size={280}
            closable={false}
            styles={{ body: { padding: 0 } }}
          >
            {sidebarBody}
          </Drawer>
        )}
        {!isMobile && (
        <Sider
          collapsed={collapsed}
          collapsedWidth={SIDER_W_COLLAPSED}
          width={SIDER_W}
          trigger={null}
          theme="light"
          style={{
            // #root có overflow-x:hidden nên position:sticky không hoạt động -> dùng fixed
            overflow: 'hidden',
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 100,
            background: '#FFFFFF',
            borderRight: '1px solid #E8E6E1',
          }}
        >
          {sidebarBody}
        </Sider>
        )}

        {/* Chừa chỗ cho sidebar fixed */}
        <Layout style={{ marginLeft: isMobile ? 0 : siderWidth, transition: 'margin-left 0.2s', background: '#F7F6F3', minWidth: 0 }}>
          <Header
            style={{
              background: '#FFFFFF',
              padding: isMobile ? '0 12px' : '0 24px',
              height: 56,
              lineHeight: '56px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #E8E6E1',
            }}
          >
            <Space size={10}>
              <Button
                type="text"
                size="small"
                icon={isMobile ? <PanelLeftOpen size="1em" /> : effectiveCollapsed ? <PanelLeftOpen size="1em" /> : <PanelLeftClose size="1em" />}
                onClick={() => (isMobile ? setMobileMenuOpen(true) : toggleCollapsed())}
              />
              <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isMobile ? '48vw' : undefined, display: 'inline-block', verticalAlign: 'middle' }}>
                {currentLabel}
              </Text>
            </Space>
            <Space size={8}>
              {!isMobile && totalPending > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {totalPending} việc đang chờ xử lý
                </Text>
              )}
              <Avatar size="small" icon={<User size="1em" />} style={{ backgroundColor: '#B8860B' }} />
              {!isMobile && <Text style={{ fontSize: 13 }}>{user.displayName || user.username}</Text>}
            </Space>
          </Header>

          <Content
            className="ssg-admin-content"
            style={{
              margin: isMobile ? 8 : 24,
              padding: isMobile ? 12 : 24,
              background: '#FFFFFF',
              borderRadius: 12,
              minHeight: 280,
              border: '1px solid #E8E6E1',
              minWidth: 0,
              overflowX: 'hidden',
            }}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
export default AdminLayout;
