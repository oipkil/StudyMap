import { PhotoGrid } from '../../components/media/PhotoGrid';
import { SafeAvatar } from '../../components/common/SafeAvatar';
import { NotFoundPage } from './NotFoundPage';
import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import { Calendar, Store, ArrowLeft, Tag as TagIcon, Share2, Trash2 } from 'lucide-react';
import {
  Typography,
  Card,
  Tag,
  Space,
  Spin,
  Button,
  Divider,
  Breadcrumb,
  Popconfirm,
  message,
} from 'antd';

const { Title, Text, Paragraph } = Typography;

export const PostDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPost();
  }, [slug]);

  const fetchPost = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/community/posts/${slug}`);
      if (res.data.success) {
        setPost(res.data.data);
      } else {
        setError('Không tìm thấy bài viết');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi tải bài viết');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin size="large" description="Đang tải bài viết..." />
      </div>
    );
  }

  /** Tác giả xoá bài viết của mình -> quay về trang chủ. */
  const handleDeletePost = async () => {
    try {
      await axios.delete(`/api/v1/community/posts/${post.id}`);
      message.success('Đã xoá bài viết');
      navigate('/');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được bài viết');
    }
  };

  if (error || !post) {
    return (
      <NotFoundPage
        title="Không tìm thấy bài viết"
        description="Bài viết có thể đã bị gỡ hoặc đang chờ kiểm duyệt."
      />
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <Link to="/">Trang chủ</Link> },
          { title: 'Bài trải nghiệm' },
          { title: post.title },
        ]}
      />

      <Card style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <Title level={2} style={{ marginBottom: 8, flex: 1 }}>{post.title}</Title>
              {post.author?.id && user?.id === post.author.id && (
                <Popconfirm title="Xoá bài viết này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={handleDeletePost}>
                  <Button danger icon={<Trash2 size="1em" />} data-testid="btn-delete-post">
                    Xoá bài
                  </Button>
                </Popconfirm>
              )}
            </div>
            <Space separator={<Divider orientation="vertical" />} wrap>
              <Space>
                <SafeAvatar src={post.author?.avatarUrl} name={post.author?.displayName || post.author?.username} size="small" style={{ backgroundColor: '#2F6B4F' }} />
                <Text strong>{post.author?.username || 'Sinh viên HCMUS'}</Text>
              </Space>
              <Space>
                <Calendar size="1em" style={{ color: '#8c8c8c' }} />
                <Text type="secondary">
                  {post.createdAt ? new Date(post.createdAt).toLocaleDateString('vi-VN') : 'Mới đăng'}
                </Text>
              </Space>
              {post.place && (
                <Link to={`/places/${post.place.slug}`}>
                  <Space style={{ color: '#2F6B4F' }}>
                    <Store size="1em" />
                    <Text strong style={{ color: '#2F6B4F' }}>{post.place.defaultName || post.place.name}</Text>
                  </Space>
                </Link>
              )}
            </Space>
          </div>

          {post.tags && post.tags.length > 0 && (
            <Space wrap>
              <TagIcon size="1em" style={{ color: '#8c8c8c' }} />
              {post.tags.map((tag: string, idx: number) => (
                <Tag color="green" key={idx}>#{tag}</Tag>
              ))}
            </Space>
          )}

          <Divider style={{ margin: '8px 0' }} />

          <div style={{ fontSize: 16, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
            <Paragraph>{post.content}</Paragraph>
          </div>

          {/* Ảnh trong bài (ảnh bìa + block ảnh) — lưới kiểu mạng xã hội, bấm mở xem toàn bộ */}
          {Array.isArray(post.photos) && post.photos.length > 0 && <PhotoGrid photos={post.photos} singleMaxHeight={520} />}

          {post.place && (
            <Card
              size="small"
              style={{
                background: '#FAF9F6',
                borderRadius: 8,
                border: '1px solid #f0f0f0',
                marginTop: 16,
              }}
            >
              <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                <Space>
                  <Store size="1em" style={{ fontSize: 24, color: '#2F6B4F' }} />
                  <div>
                    <Text strong>{post.place.defaultName || post.place.name}</Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{post.place.address || 'Gần cơ sở HCMUS'}</Text>
                    </div>
                  </div>
                </Space>
                <Link to={`/places/${post.place.slug}`}>
                  <Button type="primary" ghost size="small">Xem quán</Button>
                </Link>
              </Space>
            </Card>
          )}

          <Divider style={{ margin: '8px 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Link to="/">
              <Button icon={<ArrowLeft size="1em" />}>Quay lại</Button>
            </Link>
            <Button
              icon={<Share2 size="1em" />}
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
            >
              Chia sẻ bài viết
            </Button>
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default PostDetailPage;
