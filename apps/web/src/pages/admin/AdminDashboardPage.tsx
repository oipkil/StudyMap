import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Typography, Space, Button, Spin, Progress, List, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Store, Users, SquarePen, Star, FileCheck, FileImage, Smile, Headphones, Bot, ArrowRight, Plus, Megaphone, History } from 'lucide-react';

const { Title, Text } = Typography;

interface DashboardData {
  stats: {
    pendingContributions: number;
    pendingPlaceRevisions?: number;
    pendingReviews: number;
    pendingReports: number;
    pendingStickers: number;
    pendingMedia: number;
    pendingSupport: number;
    totalPlaces: number;
    totalUsers: number;
  };
  pendingReviews?: number;
  pendingComments?: number;
  pendingPosts?: number;
  pendingCollections?: number;
  aiQuota?: { today: string; totalTokensUsed: number; usagePercent: number; isNearLimit: boolean };
  errorStats?: Record<string, number>;
}

/** Tổng quan quản trị: số liệu chính, danh sách việc đang chờ, hạn mức AI, thao tác nhanh. */
export const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const res = await axios.get('/api/v1/admin/dashboard/stats');
        if (res.data.success && res.data.data) setData(res.data.data);
      } catch (err) {
        console.error('Lỗi nạp dashboard stats', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  const s = data?.stats || {
    pendingContributions: 0,
    pendingPlaceRevisions: 0,
    pendingReviews: 0,
    pendingReports: 0,
    pendingStickers: 0,
    pendingMedia: 0,
    pendingSupport: 0,
    totalPlaces: 0,
    totalUsers: 0,
  };

  const pendingItems = [
    { label: 'Đề xuất quán mới', count: s.pendingContributions, to: '/admin/contributions', icon: <SquarePen size="1em" /> },
    { label: 'Phiên bản quán chờ duyệt', count: s.pendingPlaceRevisions || 0, to: '/admin/places', icon: <Store size="1em" /> },
    { label: 'Đánh giá / bình luận / bài viết / bộ sưu tập', count: s.pendingReviews, to: '/admin/reviews', icon: <Star size="1em" /> },
    { label: 'Báo cáo vi phạm', count: s.pendingReports, to: '/admin/reports', icon: <FileCheck size="1em" /> },
    { label: 'Ảnh chờ kiểm duyệt', count: s.pendingMedia, to: '/admin/media', icon: <FileImage size="1em" /> },
    { label: 'Bộ nhãn dán', count: s.pendingStickers, to: '/admin/stickers', icon: <Smile size="1em" /> },
    { label: 'Yêu cầu hỗ trợ', count: s.pendingSupport, to: '/admin/support', icon: <Headphones size="1em" /> },
  ];
  const totalPending = pendingItems.reduce((a, b) => a + (b.count || 0), 0);

  const tile = (label: string, value: React.ReactNode, icon: React.ReactNode, to: string, hint?: string) => (
    <Card
      hoverable
      onClick={() => navigate(to)}
      style={{ height: '100%', borderRadius: 12 }}
      styles={{ body: { padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 } }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: '#EEF4F0',
          color: '#2F6B4F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#6F6B66', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 600, color: '#1F2421', lineHeight: 1.2 }}>{value}</div>
        {hint && (
          <div style={{ fontSize: 11, color: '#9A958E' }}>{hint}</div>
        )}
      </div>
    </Card>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Tổng quan hệ thống
          </Title>
          <Text type="secondary">
            {totalPending > 0 ? `${totalPending} việc đang chờ xử lý` : 'Không có việc nào đang chờ — mọi hàng đợi đều trống'}
          </Text>
        </div>
        <Space wrap>
          <Button type="primary" icon={<Plus size="1em" />} onClick={() => navigate('/admin/places')}>
            Thêm quán
          </Button>
          <Button icon={<Megaphone size="1em" />} onClick={() => navigate('/admin/announcements')}>
            Thông báo hệ thống
          </Button>
          <Button icon={<History size="1em" />} onClick={() => navigate('/admin/audit-logs')}>
            Nhật ký
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          {tile('Quán đã công khai', s.totalPlaces, <Store size="1em" />, '/admin/places')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {tile('Người dùng', s.totalUsers, <Users size="1em" />, '/admin/users')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {tile('Việc đang chờ', totalPending, <SquarePen size="1em" />, '/admin/contributions')}
        </Col>
        <Col xs={24} sm={12} lg={6}>
          {tile(
            'Trợ lý AI hôm nay',
            data?.aiQuota ? `${data.aiQuota.usagePercent}%` : '—',
            <Bot size="1em" />,
            '/admin/ai',
            data?.aiQuota ? `${data.aiQuota.totalTokensUsed.toLocaleString('vi-VN')} token đã dùng` : undefined,
          )}
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="Hàng đợi kiểm duyệt" style={{ borderRadius: 12, height: '100%' }} styles={{ body: { padding: '4px 0' } }}>
            <List
              dataSource={pendingItems}
              renderItem={(it) => (
                <List.Item
                  onClick={() => navigate(it.to)}
                  style={{ cursor: 'pointer', padding: '10px 20px' }}
                  actions={[
                    <Space key="c" size={8}>
                      {it.count > 0 ? <Tag color="green">{it.count} chờ</Tag> : <Text type="secondary">0</Text>}
                      <ArrowRight size="1em" style={{ color: '#9A958E' }} />
                    </Space>,
                  ]}
                >
                  <Space>
                    <span style={{ color: '#2F6B4F', fontSize: 16 }}>{it.icon}</span>
                    <Text>{it.label}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Trợ lý AI" style={{ borderRadius: 12, height: '100%' }}>
            {data?.aiQuota ? (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Hạn mức token toàn hệ thống trong ngày {data.aiQuota.today}
                </Text>
                <Progress
                  percent={data.aiQuota.usagePercent}
                  status={data.aiQuota.isNearLimit ? 'exception' : 'normal'}
                  strokeColor="#2F6B4F"
                  style={{ margin: '8px 0 12px' }}
                />
                <Space orientation="vertical" size={4}>
                  <Text>{data.aiQuota.totalTokensUsed.toLocaleString('vi-VN')} token đã dùng</Text>
                  {data.aiQuota.isNearLimit && <Tag color="warning">Sắp chạm ngưỡng — cân nhắc nâng hạn mức</Tag>}
                </Space>
              </>
            ) : (
              <Text type="secondary">Chưa có dữ liệu sử dụng hôm nay.</Text>
            )}
            <div style={{ marginTop: 16 }}>
              <Button block onClick={() => navigate('/admin/ai')}>
                Cấu hình nhà cung cấp & model
              </Button>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
export default AdminDashboardPage;
