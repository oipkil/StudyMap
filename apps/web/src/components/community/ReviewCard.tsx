import React from 'react';
import { SafeAvatar } from '../common/SafeAvatar';
import { Rate, Typography, Space, Button, Tag, Dropdown, Popconfirm } from 'antd';
import { PhotoGrid as SharedPhotoGrid } from '../media/PhotoGrid';
import { ThumbsUp, Flag, MapPin, FileText, MoreVertical, Trash2, Undo2 } from 'lucide-react';
import { Link } from 'react-router-dom';

const { Text, Paragraph } = Typography;

export interface FeedPhoto {
  assetId: string;
  url: string;
  fullUrl?: string;
}

export interface FeedAuthor {
  id?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface FeedPlace {
  placeId?: string;
  slug?: string;
  name?: string;
  address?: string | null;
  coverPhoto?: { thumbUrl: string } | null;
}

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: 'Đang chờ duyệt' },
  CHANGES_REQUESTED: { color: 'orange', label: 'Cần chỉnh sửa' },
  REJECTED: { color: 'red', label: 'Bị từ chối' },
  APPROVED: { color: 'green', label: 'Đã duyệt' },
  REVOKED: { color: 'default', label: 'Đã thu hồi' },
};

export const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
};

/** Lưới ảnh dùng chung (components/media/PhotoGrid) — giữ tên export cũ cho các chỗ đã import. */
export const PhotoGrid: React.FC<{ photos: FeedPhoto[]; maxShown?: number }> = ({ photos, maxShown }) => <SharedPhotoGrid photos={photos} maxShown={maxShown} singleMaxHeight={360} style={{ marginTop: 8 }} />;

/**
 * Menu "..." ở góc phải thẻ của chính mình: Thu hồi (bản đang chờ duyệt) / Xoá.
 * Chỉ hiện khi trang truyền vào hàm xử lý tương ứng.
 */
export const OwnerMenu: React.FC<{ onDelete?: () => void; onWithdraw?: () => void; deleteLabel?: string; testId?: string }> = ({ onDelete, onWithdraw, deleteLabel = 'Xoá', testId = 'owner-menu' }) => {
  if (!onDelete && !onWithdraw) return null;
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          onWithdraw ? { key: 'withdraw', icon: <Undo2 size="1em" />, label: 'Thu hồi bản chờ duyệt', onClick: onWithdraw } : null,
          onDelete ? { key: 'delete', icon: <Trash2 size="1em" />, danger: true, label: deleteLabel, onClick: onDelete } : null,
        ].filter(Boolean) as any,
      }}
    >
      <Button type="text" size="small" icon={<MoreVertical size="1em" />} data-testid={testId} aria-label="Tuỳ chọn" />
    </Dropdown>
  );
};

/** Nút xoá gọn có hỏi lại (dùng cho bình luận, ảnh, bộ sưu tập…). */
export const DeleteButton: React.FC<{ onConfirm: () => void; title?: string; label?: string; testId?: string; size?: 'small' | 'middle' }> = ({ onConfirm, title = 'Xoá mục này?', label = 'Xoá', testId = 'btn-delete', size = 'small' }) => (
  <Popconfirm title={title} okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={onConfirm}>
    <Button type="text" size={size} danger icon={<Trash2 size="1em" />} data-testid={testId}>
      {label}
    </Button>
  </Popconfirm>
);

interface ReviewCardProps {
  author?: FeedAuthor | null;
  rating: number;
  content: string;
  photos?: FeedPhoto[];
  visitDate?: string | null;
  createdAt?: string;
  helpfulCount?: number;
  /** Quán (hiện ở hồ sơ người dùng); ở trang quán không cần. */
  place?: FeedPlace | null;
  status?: string;
  reviewerNote?: string | null;
  onHelpful?: () => void;
  onReport?: () => void;
  /** Của chính mình: xoá hẳn đánh giá */
  onDelete?: () => void;
  /** Của chính mình: thu hồi bản đang chờ duyệt */
  onWithdraw?: () => void;
  compact?: boolean;
}

/** Thẻ đánh giá kiểu bài đăng: avatar + tên + sao + thời gian, nội dung, lưới ảnh, nút Hữu ích / Báo cáo. */
export const ReviewCard: React.FC<ReviewCardProps> = ({ author, rating, content, photos = [], visitDate, createdAt, helpfulCount, place, status, reviewerNote, onHelpful, onReport, onDelete, onWithdraw, compact }) => {
  const st = status ? STATUS_TAG[status] : null;
  const name = author?.displayName || author?.username || 'Sinh viên';
  return (
    <article style={{ background: '#fff', border: '1px solid #EAE3D9', borderRadius: 12, padding: compact ? 12 : 16, boxShadow: '0 2px 8px rgba(74, 46, 24, 0.03)' }} data-testid="review-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {author?.id ? (
          <Link to={`/users/${author.id}`}>
            <SafeAvatar src={author?.avatarUrl} name={name} style={{ backgroundColor: '#2F6B4F' }} />
          </Link>
        ) : (
          <SafeAvatar src={author?.avatarUrl} name={name} style={{ backgroundColor: '#2F6B4F' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
            {author?.id ? (
              <Link to={`/users/${author.id}`} style={{ color: '#1F2421', fontWeight: 600 }}>
                {name}
              </Link>
            ) : (
              <Text strong>{name}</Text>
            )}
            {place?.name && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                đánh giá{' '}
                <Link to={place.slug ? `/places/${place.slug}` : '#'} style={{ fontWeight: 600 }}>
                  {place.name}
                </Link>
              </Text>
            )}
            {st && <Tag color={st.color} style={{ margin: 0 }}>{st.label}</Tag>}
          </div>
          <Space size={6} wrap style={{ fontSize: 12 }}>
            <Rate disabled value={rating} style={{ fontSize: 13, color: '#B8860B' }} />
            <Text strong style={{ color: '#B8860B', fontSize: 12 }}>
              {rating}/5
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              · {timeAgo(createdAt)}
              {visitDate ? ` · ghé ${new Date(visitDate).toLocaleDateString('vi-VN')}` : ''}
            </Text>
          </Space>
        </div>
        <OwnerMenu onDelete={onDelete} onWithdraw={onWithdraw} deleteLabel="Xoá đánh giá" testId="review-menu" />
      </div>

      <Paragraph style={{ margin: '10px 0 0', fontSize: 15, whiteSpace: 'pre-line' }} ellipsis={compact ? { rows: 4, expandable: true, symbol: 'Xem thêm' } : undefined}>
        {content}
      </Paragraph>
      {reviewerNote && status !== 'APPROVED' && (
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
          Ghi chú của ban duyệt: {reviewerNote}
        </Text>
      )}
      <PhotoGrid photos={photos} />

      {(onHelpful || onReport) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, borderTop: '1px solid #F1EFEA', paddingTop: 8 }}>
          {onHelpful && (
            <Button
              type="text"
              size="small"
              icon={<ThumbsUp size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              onClick={onHelpful}
              style={{ color: '#4A2E18', fontWeight: 500, borderRadius: 6 }}
            >
              Hữu ích{typeof helpfulCount === 'number' && helpfulCount > 0 ? ` (${helpfulCount})` : ''}
            </Button>
          )}
          {onReport && (
            <Button
              type="text"
              size="small"
              icon={<Flag size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              onClick={onReport}
              style={{ color: '#7A6C60', borderRadius: 6 }}
            >
              Báo cáo
            </Button>
          )}
        </div>
      )}
    </article>
  );
};

interface PostCardProps {
  author?: FeedAuthor | null;
  title: string;
  content?: string;
  summary?: string | null;
  photos?: FeedPhoto[];
  createdAt?: string;
  slug?: string;
  place?: FeedPlace | null;
  status?: string;
  reviewerNote?: string | null;
  onOpen?: () => void;
  onDelete?: () => void;
  onWithdraw?: () => void;
}

/** Thẻ bài viết: tác giả + quán + tiêu đề + đoạn đầu + ảnh; bấm để đọc trọn bài. */
export const PostCard: React.FC<PostCardProps> = ({ author, title, content, summary, photos = [], createdAt, slug, place, status, reviewerNote, onOpen, onDelete, onWithdraw }) => {
  const st = status ? STATUS_TAG[status] : null;
  const name = author?.displayName || author?.username || 'Sinh viên';
  const body = content || summary || '';
  return (
    <article style={{ background: '#fff', border: '1px solid #EAE3D9', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(74, 46, 24, 0.03)' }} data-testid="post-card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <SafeAvatar src={author?.avatarUrl} name={name} style={{ backgroundColor: '#2F6B4F' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '2px 8px' }}>
            {author?.id ? (
              <Link to={`/users/${author.id}`} style={{ color: '#1F2421', fontWeight: 600 }}>
                {name}
              </Link>
            ) : (
              <Text strong>{name}</Text>
            )}
            <Tag icon={<FileText size="1em" />} style={{ margin: 0 }}>
              Bài viết
            </Tag>
            {st && <Tag color={st.color} style={{ margin: 0 }}>{st.label}</Tag>}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {timeAgo(createdAt)}
            {place?.name && (
              <>
                {' · '}
                <MapPin size="1em" />{' '}
                <Link to={place.slug ? `/places/${place.slug}` : '#'}>{place.name}</Link>
              </>
            )}
          </Text>
        </div>
        <OwnerMenu onDelete={onDelete} onWithdraw={onWithdraw} deleteLabel="Xoá bài viết" testId="post-menu" />
      </div>
      <div style={{ marginTop: 10, cursor: onOpen || slug ? 'pointer' : 'default' }} onClick={onOpen}>
        {slug && !onOpen ? (
          <Link to={`/posts/${slug}`} style={{ color: '#1F2421' }}>
            <Text strong style={{ fontSize: 17 }}>
              {title}
            </Text>
          </Link>
        ) : (
          <Text strong style={{ fontSize: 17 }}>
            {title}
          </Text>
        )}
        {body && (
          <Paragraph style={{ margin: '6px 0 0', fontSize: 15, whiteSpace: 'pre-line' }} ellipsis={{ rows: 3 }}>
            {body}
          </Paragraph>
        )}
        {reviewerNote && status !== 'APPROVED' && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            Ghi chú của ban duyệt: {reviewerNote}
          </Text>
        )}
      </div>
      <PhotoGrid photos={photos} />
      {slug && (
        <div style={{ marginTop: 8, borderTop: '1px solid #F1EFEA', paddingTop: 6 }}>
          <Link to={`/posts/${slug}`}>Đọc trọn bài</Link>
        </div>
      )}
    </article>
  );
};

export default ReviewCard;
