import React, { useState, useEffect } from 'react';
import { Alert, Grid } from 'antd';
import axios from 'axios';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'CRITICAL';
  version: number;
  linkUrl?: string;
}

const STORAGE_KEY = 'ssg_dismissed_announcements';

export const AnnouncementBanner: React.FC<{ scope?: 'ALL' | 'DISCOVER' | 'MAP' | 'DETAIL' }> = ({
  scope = 'ALL',
}) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  useEffect(() => {
    const fetchActiveAnnouncements = async () => {
      try {
        const res = await axios.get(`/api/v1/announcements?pageScope=${scope}`);
        if (res.data.success && res.data.data) {
          const rawItems: Announcement[] = res.data.data;
          
          // Kiểm tra xem user đã đóng version nào
          let dismissedMap: Record<string, number> = {};
          try {
            dismissedMap = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
          } catch {
            dismissedMap = {};
          }

          // Lọc ra các thông báo chưa bị đóng hoặc có version mới hơn bản đã đóng
          const visibleItems = rawItems.filter((item) => {
            const dismissedVer = dismissedMap[item.id];
            return dismissedVer === undefined || item.version > dismissedVer;
          });

          setAnnouncements(visibleItems);
        }
      } catch {
        // Silent fail for announcement banner
      }
    };

    fetchActiveAnnouncements();
  }, [scope]);

  const handleClose = (id: string, version: number) => {
    try {
      const dismissedMap: Record<string, number> = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || '{}'
      );
      dismissedMap[id] = version;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissedMap));
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const mapAlertType = (type: string) => {
    switch (type) {
      case 'WARNING':
        return 'warning';
      case 'SUCCESS':
        return 'success';
      case 'CRITICAL':
      case 'ERROR':
        return 'error';
      default:
        return 'info';
    }
  };

  if (announcements.length === 0) return null;

  // Tối đa 2 banner hiển thị cùng lúc để không che nội dung (theo đặc tả §22); ưu tiên theo thứ tự server trả về
  // Mobile: 1 banner gọn để không chiếm hết màn hình đầu.
  const MAX_VISIBLE = isMobile ? 1 : 2;
  const visible = announcements.slice(0, MAX_VISIBLE);

  return (
    <div style={{ width: '100%', marginBottom: 12 }}>
      {visible.map((a) => (
        <Alert
          key={a.id}
          title={a.title}
          description={
            <div>
              <span dangerouslySetInnerHTML={{ __html: a.content }} />
              {a.linkUrl && (
                <a
                  href={a.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginLeft: 8, fontWeight: 500 }}
                >
                  Xem chi tiết &rarr;
                </a>
              )}
            </div>
          }
          type={mapAlertType(a.type)}
          showIcon
          closable
          onClose={() => handleClose(a.id, a.version)}
          style={{ marginBottom: 8, borderRadius: 10, padding: isMobile ? '8px 12px' : undefined, fontSize: isMobile ? 13 : undefined }}
        />
      ))}
      {announcements.length > MAX_VISIBLE && (
        <div style={{ fontSize: 12, color: '#6F6B66', padding: '0 4px' }}>
          +{announcements.length - MAX_VISIBLE} thông báo khác — đóng banner trên để xem tiếp
        </div>
      )}
    </div>
  );
};
