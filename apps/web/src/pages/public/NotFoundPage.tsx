import React from 'react';
import { Link } from 'react-router-dom';
import { Typography, Button, Space, Input } from 'antd';
import { Compass, Home, Search, Store } from 'lucide-react';

const { Title, Text } = Typography;

interface NotFoundPageProps {
  /** Tiêu đề riêng cho từng loại (quán / bài viết / bộ sưu tập). Bỏ trống = trang chung. */
  title?: string;
  description?: string;
  /** Gợi ý hành động thêm, ví dụ nút "Đề xuất quán mới". */
  extra?: React.ReactNode;
}

/**
 * Trang 404 dùng chung: quán/bài viết đã bị gỡ, link sai, hoặc nội dung đang chờ duyệt.
 * Luôn kèm đường thoát (tìm quán, về trang chủ, mở bản đồ) thay vì đá thẳng về trang chủ như trước.
 */
export const NotFoundPage: React.FC<NotFoundPageProps> = ({ title = 'Không tìm thấy trang này', description = 'Đường dẫn có thể đã thay đổi, nội dung bị gỡ hoặc bạn gõ nhầm địa chỉ.', extra }) => {
  const [q, setQ] = React.useState('');
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '56px 16px', textAlign: 'center' }} data-testid="not-found-page">
      <div style={{ fontSize: 72, fontWeight: 700, color: '#2F6B4F', lineHeight: 1 }}>404</div>
      <Title level={3} style={{ marginTop: 12, marginBottom: 8 }}>
        {title}
      </Title>
      <Text type="secondary" style={{ fontSize: 15 }}>
        {description}
      </Text>

      <div style={{ marginTop: 24 }}>
        <Input.Search
          value={q}
          onChange={(e) => setQ(e.target.value)}
          size="large"
          placeholder="Tìm quán theo tên, địa chỉ hoặc trường…"
          enterButton={<Search size="1em" />}
          onSearch={(value) => {
            window.location.href = value.trim() ? `/?q=${encodeURIComponent(value.trim())}` : '/';
          }}
          data-testid="not-found-search"
        />
      </div>

      <Space wrap style={{ marginTop: 20, justifyContent: 'center' }}>
        <Link to="/">
          <Button type="primary" icon={<Home size="1em" />} style={{ background: '#2F6B4F' }}>
            Về trang khám phá
          </Button>
        </Link>
        <Link to="/map">
          <Button icon={<Compass size="1em" />}>Mở bản đồ quán</Button>
        </Link>
        {extra ?? (
          <Link to="/?suggest=1">
            <Button icon={<Store size="1em" />}>Đề xuất quán mới</Button>
          </Link>
        )}
      </Space>
    </div>
  );
};

export default NotFoundPage;
