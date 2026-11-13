import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, List, Button, Tag, Space, Spin, Empty, Divider, message, Breadcrumb } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Bell, Check, Info, CircleCheck, CircleX, Headphones, Store } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  linkUrl?: string;
  createdAt: string;
}

export const UserNotificationsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchInitial = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/me/notifications?limit=20');
      if (res.data.success && res.data.data) {
        setNotifications(res.data.data.items || []);
        setNextCursor(res.data.data.nextCursor || null);
        setUnreadCount(res.data.data.unreadCount || 0);
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách thông báo');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const fetchMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await axios.get(`/api/v1/me/notifications?limit=20&cursor=${nextCursor}`);
      if (res.data.success && res.data.data) {
        setNotifications((prev) => [...prev, ...(res.data.data.items || [])]);
        setNextCursor(res.data.data.nextCursor || null);
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải thêm thông báo');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await axios.patch(`/api/v1/me/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await axios.patch('/api/v1/me/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      message.success('Đã đánh dấu đọc tất cả thông báo');
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi cập nhật thông báo');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'PLACE_APPROVED':
        return <CircleCheck size="1em" style={{ color: '#3B7D5C', fontSize: 20 }} />;
      case 'PLACE_REJECTED':
        return <CircleX size="1em" style={{ color: '#B5484D', fontSize: 20 }} />;
      case 'SUPPORT_UPDATE':
        return <Headphones size="1em" style={{ color: '#2F6B4F', fontSize: 20 }} />;
      case 'SYSTEM':
        return <Store size="1em" style={{ color: '#3B7D5C', fontSize: 20 }} />;
      default:
        return <Info size="1em" style={{ color: '#B8860B', fontSize: 20 }} />;
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/">Trang chủ</Link> },
          { title: 'Tài khoản' },
          { title: 'Thông báo' },
        ]}
      />

      <Card style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Space align="center">
            <Bell size="1em" style={{ fontSize: 24, color: '#2F6B4F' }} />
            <Title level={3} style={{ margin: 0 }}>Trung Tâm Thông Báo</Title>
            {unreadCount > 0 && (
              <Tag color="red" style={{ borderRadius: 12 }}>
                {unreadCount} chưa đọc
              </Tag>
            )}
          </Space>
          {unreadCount > 0 && (
            <Button type="primary" ghost size="small" onClick={handleMarkAllAsRead}>
              Đánh dấu tất cả đã đọc
            </Button>
          )}
        </div>

        <Divider style={{ margin: '12px 0 20px 0' }} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" description="Đang nạp thông báo..." />
          </div>
        ) : notifications.length === 0 ? (
          <Empty description="Bạn chưa có thông báo nào từ hệ thống" />
        ) : (
          <div>
            <List
              dataSource={notifications}
              renderItem={(item) => (
                <List.Item
                  style={{
                    padding: '16px 14px',
                    backgroundColor: item.isRead ? 'transparent' : 'rgba(22, 119, 255, 0.04)',
                    borderRadius: 8,
                    marginBottom: 8,
                    border: '1px solid #f0f0f0',
                    cursor: item.linkUrl ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (!item.isRead) handleMarkAsRead(item.id);
                    if (item.linkUrl) navigate(item.linkUrl);
                  }}
                  actions={[
                    !item.isRead ? (
                      <Button
                        key="read"
                        size="small"
                        icon={<Check size="1em" />}
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                      >
                        Đã đọc
                      </Button>
                    ) : null,
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={getNotificationIcon(item.type)}
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong={!item.isRead} style={{ fontSize: 14 }}>
                          {item.title}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(item.createdAt).toLocaleString('vi-VN')}
                        </Text>
                      </div>
                    }
                    description={
                      <Paragraph type="secondary" style={{ margin: '4px 0 0 0', fontSize: 13 }}>
                        {item.message}
                      </Paragraph>
                    }
                  />
                </List.Item>
              )}
            />

            {nextCursor && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Button onClick={fetchMore} loading={loadingMore}>
                  Tải thêm thông báo cũ hơn
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default UserNotificationsPage;
