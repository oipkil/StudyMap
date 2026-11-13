import React, { useMemo } from 'react';
import { Typography, Button, Tag, Space, Pagination, Popconfirm } from 'antd';
import { SafeAvatar } from '../common/SafeAvatar';
import { Link } from 'react-router-dom';
import { timeAgo } from './ReviewCard';
import { MessageSquare, Flag, Trash2 } from 'lucide-react';

const { Text, Paragraph } = Typography;

export interface ThreadComment {
  id: string;
  parentCommentId?: string | null;
  content?: string | null;
  isDeleted?: boolean;
  isPendingMine?: boolean;
  sticker?: { imageUrl: string; name?: string | null } | null;
  attachedImageUrl?: string | null;
  createdAt?: string;
  author?: { id?: string; username?: string; displayName?: string; avatarAssetId?: string | null; avatarUrl?: string | null };
}

interface CommentThreadProps {
  comments: ThreadComment[];
  currentUserId?: string;
  isAdmin?: boolean;
  page?: number;
  pageSize?: number;
  onPageChange?: (p: number) => void;
  onReply?: (c: ThreadComment) => void;
  onDelete?: (id: string) => void;
  onReport?: (c: ThreadComment) => void;
}

/**
 * Bình luận dạng cây như mạng xã hội: bình luận gốc phân trang, câu trả lời lồng ngay bên dưới (thụt vào).
 * Trước đây trả lời hiện lẫn thành bình luận rời, không thấy đang trả lời ai.
 */
export const CommentThread: React.FC<CommentThreadProps> = ({ comments, currentUserId, isAdmin, page = 1, pageSize = 5, onPageChange, onReply, onDelete, onReport }) => {
  const { roots, repliesOf } = useMemo(() => {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const replies = new Map<string, ThreadComment[]>();
    const rootList: ThreadComment[] = [];
    for (const c of comments) {
      const parentId = c.parentCommentId && byId.has(c.parentCommentId) ? c.parentCommentId : null;
      if (parentId) {
        const arr = replies.get(parentId) || [];
        arr.push(c);
        replies.set(parentId, arr);
      } else {
        rootList.push(c);
      }
    }
    return { roots: rootList, repliesOf: replies };
  }, [comments]);

  if (comments.length === 0) {
    return <Text type="secondary">Chưa có bình luận nào. Hãy bắt đầu cuộc trò chuyện!</Text>;
  }

  const shown = roots.slice((page - 1) * pageSize, page * pageSize);

  const renderOne = (c: ThreadComment, depth: number) => {
    const mine = c.author?.id && c.author.id === currentUserId;
    const children = repliesOf.get(c.id) || [];
    return (
      <div key={c.id} style={{ marginLeft: depth > 0 ? (depth > 1 ? 56 : 40) : 0, marginTop: depth > 0 ? 8 : 12 }} data-testid={depth > 0 ? 'comment-reply' : 'comment-item'}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <SafeAvatar
            size={depth > 0 ? 28 : 34}
            src={c.author?.avatarUrl || (c.author?.avatarAssetId ? `/api/v1/media/${c.author.avatarAssetId}?variant=thumb` : null)}
            name={c.author?.displayName || c.author?.username}
            style={{ backgroundColor: '#2F6B4F', flex: 'none' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: c.isDeleted ? 'transparent' : '#F2F1ED', borderRadius: 14, padding: c.isDeleted ? 0 : '8px 12px' }}>
              <Space size={6} wrap style={{ marginBottom: 2 }}>
                {c.author?.id ? (
                  <Link to={`/users/${c.author.id}`} style={{ color: '#1F2421', fontWeight: 600, fontSize: 13 }}>
                    {c.author?.displayName || c.author?.username}
                  </Link>
                ) : (
                  <Text strong style={{ fontSize: 13 }}>
                    {c.author?.displayName || c.author?.username || 'Người dùng'}
                  </Text>
                )}
                {mine && !c.isDeleted && (
                  <Tag color="green" style={{ fontSize: 11, margin: 0 }}>
                    Của bạn
                  </Tag>
                )}
                {c.isPendingMine && (
                  <Tag color="gold" style={{ fontSize: 11, margin: 0 }}>
                    Đang chờ duyệt — chỉ bạn thấy
                  </Tag>
                )}
              </Space>
              {c.isDeleted ? (
                <Text type="secondary" style={{ fontSize: 13, fontStyle: 'italic' }}>
                  Bình luận đã bị xoá
                </Text>
              ) : (
                <>
                  <Paragraph style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-line' }}>{c.content}</Paragraph>
                  {c.sticker && <img src={c.sticker.imageUrl} alt={c.sticker.name || 'sticker'} style={{ width: 64, height: 64, objectFit: 'contain', marginTop: 4 }} />}
                  {c.attachedImageUrl && <img src={c.attachedImageUrl} alt="" style={{ maxWidth: 220, borderRadius: 8, marginTop: 6, display: 'block' }} />}
                </>
              )}
            </div>
            {!c.isDeleted && (
              <Space size={2} style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 11, marginRight: 4 }}>
                  {timeAgo(c.createdAt)}
                </Text>
                {onReply && (
                  <Button type="text" size="small" icon={<MessageSquare size="1em" />} onClick={() => onReply(c)} data-testid="btn-reply-comment">
                    Trả lời
                  </Button>
                )}
                {onDelete && (mine || isAdmin) && (
                  <Popconfirm title="Xoá bình luận này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => onDelete(c.id)}>
                    <Button type="text" size="small" danger icon={<Trash2 size="1em" />} data-testid="btn-delete-comment">
                      Xoá
                    </Button>
                  </Popconfirm>
                )}
                {onReport && !mine && (
                  <Button type="text" size="small" icon={<Flag size="1em" />} style={{ color: '#6F6B66' }} onClick={() => onReport(c)}>
                    Báo cáo
                  </Button>
                )}
              </Space>
            )}
          </div>
        </div>
        {children.map((child) => renderOne(child, depth + 1))}
      </div>
    );
  };

  return (
    <div data-testid="comment-thread">
      {shown.map((c) => renderOne(c, 0))}
      {roots.length > pageSize && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Pagination size="small" current={page} pageSize={pageSize} total={roots.length} onChange={onPageChange} showSizeChanger={false} />
        </div>
      )}
    </div>
  );
};

export default CommentThread;
