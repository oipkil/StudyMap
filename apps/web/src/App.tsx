import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { NotFoundPage } from './pages/public/NotFoundPage';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicLayout } from './components/layout/PublicLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { DiscoverPage } from './pages/public/DiscoverPage';
import { MapPage } from './pages/public/MapPage';
import { PlaceDetailPage } from './pages/public/PlaceDetailPage';
import { PlaceComparisonPage } from './pages/public/PlaceComparisonPage';
import { PostDetailPage } from './pages/public/PostDetailPage';
import { PublicCollectionPage } from './pages/public/PublicCollectionPage';
import { UserNotificationsPage } from './pages/me/UserNotificationsPage';
import { UserProfilePage } from './pages/public/UserProfilePage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminPlacesPage } from './pages/admin/AdminPlacesPage';
import { AdminDynamicFieldsPage } from './pages/admin/AdminDynamicFieldsPage';
import { AdminReferencePage } from './pages/admin/AdminReferencePage';
import { AdminMediaModerationPage } from './pages/admin/AdminMediaModerationPage';
import { AdminContributionsPage } from './pages/admin/AdminContributionsPage';
import { AdminReviewsPage } from './pages/admin/AdminReviewsPage';
import { AdminReportsPage } from './pages/admin/AdminReportsPage';
import { AdminStickersPage } from './pages/admin/AdminStickersPage';
import { AdminAnnouncementsPage } from './pages/admin/AdminAnnouncementsPage';
import { AdminSupportPage } from './pages/admin/AdminSupportPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';
import { AdminAiPage } from './pages/admin/AdminAiPage';
import { AdminIntegrationsPage } from './pages/admin/AdminIntegrationsPage';

/** Đưa các trang /me/* cũ về hồ sơ cá nhân (Account Center) đúng tab. */
function RedirectToMyProfile({ tab }: { tab: string }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={`/users/${user.id}?tab=${tab}`} replace />;
}

export const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          // Bảng màu Study & Coffee: Nâu cà phê ấm, hổ phách caramel, xanh thư viện focus, nền giấy tập ấm
          colorPrimary: '#6F4E37',
          colorInfo: '#6F4E37',
          colorLink: '#8C5326',
          colorSuccess: '#2D5A43',
          colorWarning: '#C67D34',
          colorError: '#B5484D',
          colorBgLayout: '#FAF7F2',
          colorBgContainer: '#FFFFFF',
          colorBorder: '#EAE3D9',
          colorBorderSecondary: '#F3EEE7',
          colorText: '#261C14',
          colorTextSecondary: '#7A6C60',
          colorInfoBg: '#F6EFE9',
          colorInfoBorder: '#E7D6C7',
          colorSuccessBg: '#EDF4F0',
          colorSuccessBorder: '#CADDCF',
          colorWarningBg: '#FDF5EC',
          colorWarningBorder: '#F0D5BE',
          colorErrorBg: '#FDEBEC',
          colorErrorBorder: '#F1C2C4',
          borderRadius: 10,
          borderRadiusLG: 14,
          controlHeight: 38,
          fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, -apple-system, sans-serif",
          fontSize: 14,
          boxShadow: '0 2px 8px rgba(74, 46, 24, 0.05), 0 8px 24px rgba(74, 46, 24, 0.05)',
          boxShadowSecondary: '0 2px 8px rgba(74, 46, 24, 0.06), 0 12px 32px rgba(74, 46, 24, 0.08)',
        },
        components: {
          Card: { boxShadowTertiary: 'none', colorBorderSecondary: '#EAE3D9', borderRadiusLG: 14 },
          Button: { fontWeight: 600, primaryShadow: '0 2px 8px rgba(111, 78, 55, 0.25)', defaultShadow: 'none', borderRadius: 8 },
          Table: { headerBg: '#F5EFEB', headerColor: '#7A6C60', headerSplitColor: '#EAE3D9', rowHoverBg: '#FAF7F2' },
          Tag: { borderRadiusSM: 999 },
          Input: { activeShadow: '0 0 0 3px rgba(198, 125, 52, 0.2)', colorBorder: '#EAE3D9' },
          Tabs: { itemColor: '#7A6C60', itemSelectedColor: '#6F4E37', inkBarColor: '#6F4E37', titleFontSize: 14 },
          Layout: { bodyBg: '#FAF7F2', headerBg: '#FFFFFF' },
        },
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Layout */}
            <Route path="/" element={<PublicLayout />}>
              <Route index element={<DiscoverPage />} />
              <Route path="discover" element={<Navigate to="/" replace />} />
              <Route path="map" element={<MapPage />} />
              <Route path="places/:slug" element={<PlaceDetailPage />} />
              <Route path="posts/:slug" element={<PostDetailPage />} />
              <Route path="collections/:id" element={<PublicCollectionPage />} />
              <Route path="compare" element={<PlaceComparisonPage />} />
              <Route path="me/contributions" element={<RedirectToMyProfile tab="contributions" />} />
              <Route path="me/collections" element={<RedirectToMyProfile tab="saved" />} />
              <Route path="me/notifications" element={<UserNotificationsPage />} />
              <Route path="users/:id" element={<UserProfilePage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="forgot-password" element={<ForgotPasswordPage />} />
              <Route path="reset-password/:token" element={<ResetPasswordPage />} />
              <Route path="verify-email" element={<VerifyEmailPage />} />
            </Route>

            {/* Admin Shell Layout (Bảo vệ RBAC) */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="places" element={<AdminPlacesPage />} />
              <Route path="dynamic-fields" element={<AdminDynamicFieldsPage />} />
              <Route path="reference" element={<AdminReferencePage />} />
              <Route path="media" element={<AdminMediaModerationPage />} />
              <Route path="contributions" element={<AdminContributionsPage />} />
              <Route path="reviews" element={<AdminReviewsPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="stickers" element={<AdminStickersPage />} />
              <Route path="announcements" element={<AdminAnnouncementsPage />} />
              <Route path="support" element={<AdminSupportPage />} />
              <Route path="audit-logs" element={<AdminAuditLogsPage />} />
              <Route path="ai" element={<AdminAiPage />} />
              <Route path="integrations" element={<AdminIntegrationsPage />} />
            </Route>

            {/* Đường dẫn không tồn tại -> trang 404 có lối thoát (tìm quán / bản đồ / đề xuất quán) */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
};

export default App;
