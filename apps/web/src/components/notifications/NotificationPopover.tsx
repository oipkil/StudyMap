import React, { useState, useEffect, useCallback } from 'react';
import { Popover, Badge, Button, List, Typography, Space, Empty, Spin, Tag, Tooltip } from 'antd';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Bell, Check, Info, CircleCheck, CircleX, Headphones, Store } from 'lucide-react';

const { Text, Paragraph } = Typography;

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  linkUrl?: string;
  createdAt: string;
}

export const NotificationPopover: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await axios.get('/api/v1/me/notifications?limit=15');
      if (res.data.success && res.data.data) {
        setNotifications(res.data.data.items || []);
        setUnreadCount(res.data.data.unreadCount || 0);
      }
    } catch {
      // Ignore network errors in background poll
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // Polling 15s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await axios.patch(`/api/v1/me/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Lỗi đánh dấu đã đọc', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await axios.patch('/api/v1/me/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Lỗi đánh dấu tất cả đã đọc', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'PLACE_APPROVED':
        return <CircleCheck size="1em" style={{ color: '#3B7D5C', fontSize: 18 }} />;
      case 'PLACE_REJECTED':
        return <CircleX size="1em" style={{ color: '#B5484D', fontSize: 18 }} />;
      case 'SUPPORT_UPDATE':
        return <Headphones size="1em" style={{ color: '#2F6B4F', fontSize: 18 }} />;
      case 'SYSTEM':
        return <Store size="1em" style={{ color: '#3B7D5C', fontSize: 18 }} />;
      default:
        return <Info size="1em" style={{ color: '#B8860B', fontSize: 18 }} />;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return 'Vừa xong';
      if (diffMinutes < 60) return `${diffMinutes} phút trước`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
  };

  const popoverContent = (
    <div style={{ width: 360, maxHeight: 460, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 8,
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Space>
          <Text strong style={{ fontSize: 15 }}>
            Thông Báo
          </Text>
          {unreadCount > 0 && (
            <Tag color="red" style={{ borderRadius: 10 }}>
              {unreadCount} mới
            </Tag>
          )}
        </Space>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllAsRead} style={{ padding: 0 }}>
            Đọc tất cả
          </Button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 380, marginTop: 8 }}>
        {loading && notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Spin size="small" />
          </div>
        ) : notifications.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa có thông báo nào" />
        ) : (
          <List
            dataSource={notifications}
            renderItem={(item) => (
              <List.Item
                style={{
                  padding: '10px 8px',
                  backgroundColor: item.isRead ? 'transparent' : 'rgba(22, 119, 255, 0.04)',
                  borderRadius: 6,
                  cursor: 'pointer',
                  marginBottom: 4,
                  transition: 'background 0.2s',
                }}
                onClick={() => !item.isRead && handleMarkAsRead(item.id)}
              >
                <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'flex-start' }}>
                  <div style={{ marginTop: 2 }}>{getNotificationIcon(item.type)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong={!item.isRead} style={{ fontSize: 13 }}>
                        {item.title}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {formatTime(item.createdAt)}
                      </Text>
                    </div>
                    <Paragraph
                      type="secondary"
                      ellipsis={{ rows: 2 }}
                      style={{ fontSize: 12, margin: '2px 0 0 0', lineHeight: 1.4 }}
                    >
                      {item.message}
                    </Paragraph>
                  </div>
                  {!item.isRead && (
                    <Tooltip title="Đánh dấu đã đọc">
                      <Button
                        type="text"
                        size="small"
                        icon={<Check size="1em" style={{ fontSize: 12, color: '#2F6B4F' }} />}
                        onClick={(e) => handleMarkAsRead(item.id, e)}
                        style={{ padding: '0 4px', height: 20 }}
                      />
                    </Tooltip>
                  )}
                </div>
              </List.Item>
            )}
          />
        )}
      </div>

      <div style={{ paddingTop: 8, marginTop: 4, borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
        <a href="/me/notifications" style={{ fontSize: 12, color: '#2F6B4F' }}>
          Xem tất cả thông báo →
        </a>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      styles={{ container: { padding: 12 } }}
    >
      <Badge count={unreadCount} overflowCount={99} size="small" offset={[-2, 4]}>
        <Button
          type="text"
          shape="circle"
          icon={<Bell size="1em" style={{ fontSize: 18 }} />}
          aria-label="Thông báo"
        />
      </Badge>
    </Popover>
  );
};
