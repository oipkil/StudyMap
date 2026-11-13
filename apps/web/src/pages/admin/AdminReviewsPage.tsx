import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Typography, Card, Table, Tag, Button, Space, Modal, Input, message, Rate, Descriptions, Tabs, Image, Popconfirm } from 'antd';
import { CircleCheck, CircleX, Eye, Ban, Star, MessageCircle, FileText, Folder, Trash2, Lock, Unlock } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

export const AdminReviewsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('reviews');
  const [loading, setLoading] = useState<boolean>(false);

  // Reviews state
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState<boolean>(false);
  const [reviewerNote, setReviewerNote] = useState<string>('');

  // Comments state
  const [comments, setComments] = useState<any[]>([]);
  const [selectedComment, setSelectedComment] = useState<any>(null);
  const [commentModalOpen, setCommentModalOpen] = useState<boolean>(false);

  // Posts state
  const [posts, setPosts] = useState<any[]>([]);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [postModalOpen, setPostModalOpen] = useState<boolean>(false);

  // Collections state
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [collectionModalOpen, setCollectionModalOpen] = useState<boolean>(false);

  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    if (activeTab === 'reviews') fetchReviews();
    else if (activeTab === 'comments') fetchComments();
    else if (activeTab === 'posts') fetchPosts();
    else if (activeTab === 'collections') fetchCollections();
  }, [activeTab]);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/community/reviews');
      if (res.data.success) setReviews(res.data.data);
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách đánh giá');
    } finally {
      setLoading(false);
    }
  };

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/community/comments');
      if (res.data.success) setComments(res.data.data);
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách bình luận');
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/community/posts');
      if (res.data.success) setPosts(res.data.data);
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách bài viết');
    } finally {
      setLoading(false);
    }
  };

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/community/collections');
      if (res.data.success) setCollections(res.data.data);
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách bộ sưu tập');
    } finally {
      setLoading(false);
    }
  };

  // Moderate Review
  const handleModerateReview = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedReview) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/v1/admin/community/reviews/${selectedReview.id}/moderate`, {
        action,
        reviewerNote: reviewerNote || (action === 'APPROVE' ? 'Đã duyệt đánh giá' : 'Đã từ chối'),
      });
      if (res.data.success) {
        message.success(res.data.message);
        setReviewModalOpen(false);
        setReviewerNote('');
        fetchReviews();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xử lý đánh giá');
    } finally {
      setActionLoading(false);
    }
  };

  // Moderate Comment
  const handleModerateComment = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedComment) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/v1/admin/community/comments/${selectedComment.id}/moderate`, {
        action,
        reviewerNote: reviewerNote || (action === 'APPROVE' ? 'Đã duyệt bình luận' : 'Đã từ chối'),
      });
      if (res.data.success) {
        message.success(res.data.message);
        setCommentModalOpen(false);
        setReviewerNote('');
        fetchComments();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xử lý bình luận');
    } finally {
      setActionLoading(false);
    }
  };

  // Moderate Post
  const handleModeratePost = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedPost) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/v1/admin/community/posts/${selectedPost.id}/moderate`, {
        action,
        reviewerNote: reviewerNote || (action === 'APPROVE' ? 'Đã duyệt bài viết' : 'Đã từ chối'),
      });
      if (res.data.success) {
        message.success(res.data.message);
        setPostModalOpen(false);
        setReviewerNote('');
        fetchPosts();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xử lý bài viết');
    } finally {
      setActionLoading(false);
    }
  };

  // Moderate Collection
  const handleModerateCollection = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedCollection) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/v1/admin/community/collections/${selectedCollection.id}/moderate`, {
        action,
        reviewerNote: reviewerNote || (action === 'APPROVE' ? 'Đã duyệt bộ sưu tập' : 'Đã từ chối'),
      });
      if (res.data.success) {
        message.success(res.data.message);
        setCollectionModalOpen(false);
        setReviewerNote('');
        fetchCollections();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xử lý bộ sưu tập');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleState = async (reviewId: string, targetState: 'PUBLISHED' | 'HIDDEN') => {
    try {
      const res = await axios.post(`/api/v1/admin/community/reviews/${reviewId}/state`, {
        state: targetState,
      });
      if (res.data.success) {
        message.success(res.data.message);
        fetchReviews();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi thay đổi trạng thái');
    }
  };

  // Delete Review
  const handleDeleteReview = async (reviewId: string) => {
    try {
      const res = await axios.delete(`/api/v1/admin/community/reviews/${reviewId}`);
      if (res.data.success) {
        message.success(res.data.message || 'Đã xoá đánh giá');
        setReviewModalOpen(false);
        fetchReviews();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xoá đánh giá');
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await axios.delete(`/api/v1/admin/community/comments/${commentId}`);
      if (res.data.success) {
        message.success(res.data.message || 'Đã xoá bình luận');
        setCommentModalOpen(false);
        fetchComments();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xoá bình luận');
    }
  };

  // Delete Post
  const handleDeletePost = async (postId: string) => {
    try {
      const res = await axios.delete(`/api/v1/admin/community/posts/${postId}`);
      if (res.data.success) {
        message.success(res.data.message || 'Đã xoá bài viết');
        setPostModalOpen(false);
        fetchPosts();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xoá bài viết');
    }
  };

  // Lock / Unlock User
  const handleToggleLockUser = async (userId: string, isCurrentlyLocked: boolean, username?: string) => {
    try {
      const res = await axios.patch(`/api/v1/admin/users/${userId}/lock`, {
        isLocked: !isCurrentlyLocked,
        reason: !isCurrentlyLocked ? 'Đăng nội dung không phù hợp vi phạm tiêu chuẩn cộng đồng' : 'Mở khóa tài khoản',
      });
      if (res.data.success) {
        message.success(!isCurrentlyLocked ? `Đã khóa tài khoản @${username || userId}` : `Đã mở khóa tài khoản @${username || userId}`);
        if (activeTab === 'reviews') fetchReviews();
        else if (activeTab === 'comments') fetchComments();
        else if (activeTab === 'posts') fetchPosts();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi cập nhật trạng thái người dùng');
    }
  };

  const reviewColumns = [
    {
      title: 'Quán Được Đánh Giá',
      key: 'place',
      render: (_: any, row: any) => <Text strong>{row.review?.place?.defaultName || 'Địa điểm'}</Text>,
    },
    {
      title: 'Người Viết',
      key: 'user',
      render: (_: any, row: any) => {
        const u = row.review?.user;
        return (
          <Space direction="vertical" size={2}>
            <Text strong>{u?.username || 'Sinh viên'}</Text>
            {u?.isLocked && <Tag color="error">Đã bị khóa</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Điểm Đánh Giá',
      key: 'rating',
      render: (_: any, row: any) => (
        <Space>
          <Rate disabled defaultValue={row.ratingOverall} style={{ fontSize: 13 }} />
          <Text strong>{row.ratingOverall}</Text>
        </Space>
      ),
    },
    {
      title: 'Nội Dung Tóm Tắt',
      dataIndex: 'content',
      key: 'content',
      render: (text: string) => (
        <Text ellipsis style={{ maxWidth: 260 }}>
          {text}
        </Text>
      ),
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'moderationStatus',
      key: 'moderationStatus',
      render: (status: string) => {
        switch (status) {
          case 'APPROVED':
            return <Tag color="success">Đã duyệt (Hiện)</Tag>;
          case 'REJECTED':
            return <Tag color="error">Đã từ chối</Tag>;
          default:
            return <Tag color="warning">Đang chờ duyệt</Tag>;
        }
      },
    },
    {
      title: 'Thao Tác',
      key: 'actions',
      render: (_: any, row: any) => (
        <Space wrap>
          <Button
            size="small"
            icon={<Eye size="1em" />}
            onClick={() => {
              setSelectedReview(row);
              setReviewerNote(row.reviewerNote || '');
              setReviewModalOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {row.review?.state === 'PUBLISHED' ? (
            <Button
              size="small"
              danger
              icon={<Ban size="1em" />}
              onClick={() => handleToggleState(row.reviewId, 'HIDDEN')}
            >
              Ẩn
            </Button>
          ) : row.moderationStatus === 'APPROVED' ? (
            <Button size="small" type="primary" ghost onClick={() => handleToggleState(row.reviewId, 'PUBLISHED')}>
              Hiện lại
            </Button>
          ) : null}
          <Popconfirm
            title="Xóa vĩnh viễn đánh giá này?"
            description="Điểm trung bình của quán sẽ được tính lại ngay."
            onConfirm={() => handleDeleteReview(row.reviewId)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<Trash2 size="1em" />}>
              Xóa
            </Button>
          </Popconfirm>
          {row.review?.user?.id && (
            <Popconfirm
              title={row.review?.user?.isLocked ? `Mở khóa @${row.review?.user?.username}?` : `Khóa / Ban @${row.review?.user?.username}?`}
              description={row.review?.user?.isLocked ? 'Người dùng sẽ có thể đăng nhập lại.' : 'Ngắt phiên và chặn người dùng này đăng bài/đánh giá.'}
              onConfirm={() => handleToggleLockUser(row.review.user.id, row.review.user.isLocked, row.review.user.username)}
              okText={row.review?.user?.isLocked ? 'Mở khóa' : 'Khóa'}
              cancelText="Hủy"
              okButtonProps={row.review?.user?.isLocked ? { type: 'primary' } : { danger: true }}
            >
              <Button size="small" type={row.review?.user?.isLocked ? 'default' : 'dashed'} danger={!row.review?.user?.isLocked} icon={row.review?.user?.isLocked ? <Unlock size="1em" /> : <Lock size="1em" />}>
                {row.review?.user?.isLocked ? 'Mở khóa' : 'Khóa User'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const commentColumns = [
    {
      title: 'Nội Dung Bình Luận',
      dataIndex: 'content',
      key: 'content',
      render: (text: string, row: any) => (
        <div>
          <Text ellipsis style={{ maxWidth: 300 }}>
            {text}
          </Text>
          {row.stickerItem && (
            <Tag color="default" style={{ marginLeft: 6 }}>
              Kèm Sticker
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Tác Giả',
      key: 'author',
      render: (_: any, row: any) => {
        const a = row.comment?.author;
        return (
          <Space direction="vertical" size={2}>
            <Text strong>{a?.username || 'Sinh viên'}</Text>
            {a?.isLocked && <Tag color="error">Đã bị khóa</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'moderationStatus',
      key: 'moderationStatus',
      render: (status: string) => {
        switch (status) {
          case 'APPROVED':
            return <Tag color="success">Đã duyệt (Hiện)</Tag>;
          case 'REJECTED':
            return <Tag color="error">Đã từ chối</Tag>;
          default:
            return <Tag color="warning">Đang chờ duyệt</Tag>;
        }
      },
    },
    {
      title: 'Thao Tác',
      key: 'actions',
      render: (_: any, row: any) => (
        <Space wrap>
          <Button
            size="small"
            icon={<Eye size="1em" />}
            onClick={() => {
              setSelectedComment(row);
              setReviewerNote(row.reviewerNote || '');
              setCommentModalOpen(true);
            }}
          >
            Chi tiết
          </Button>
          <Popconfirm
            title="Xóa bình luận này?"
            onConfirm={() => handleDeleteComment(row.commentId)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<Trash2 size="1em" />}>
              Xóa
            </Button>
          </Popconfirm>
          {row.comment?.author?.id && (
            <Popconfirm
              title={row.comment?.author?.isLocked ? `Mở khóa @${row.comment?.author?.username}?` : `Khóa / Ban @${row.comment?.author?.username}?`}
              description={row.comment?.author?.isLocked ? 'Người dùng sẽ có thể đăng nhập lại.' : 'Ngắt phiên và chặn người dùng này bình luận.'}
              onConfirm={() => handleToggleLockUser(row.comment.author.id, row.comment.author.isLocked, row.comment.author.username)}
              okText={row.comment?.author?.isLocked ? 'Mở khóa' : 'Khóa'}
              cancelText="Hủy"
              okButtonProps={row.comment?.author?.isLocked ? { type: 'primary' } : { danger: true }}
            >
              <Button size="small" type={row.comment?.author?.isLocked ? 'default' : 'dashed'} danger={!row.comment?.author?.isLocked} icon={row.comment?.author?.isLocked ? <Unlock size="1em" /> : <Lock size="1em" />}>
                {row.comment?.author?.isLocked ? 'Mở khóa' : 'Khóa User'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const postColumns = [
    {
      title: 'Tiêu Đề Bài Viết',
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Tác Giả',
      key: 'author',
      render: (_: any, row: any) => {
        const a = row.post?.author;
        return (
          <Space direction="vertical" size={2}>
            <Text strong>{a?.username || 'Sinh viên'}</Text>
            {a?.isLocked && <Tag color="error">Đã bị khóa</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'moderationStatus',
      key: 'moderationStatus',
      render: (status: string) => {
        switch (status) {
          case 'APPROVED':
            return <Tag color="success">Đã duyệt (Hiện)</Tag>;
          case 'REJECTED':
            return <Tag color="error">Đã từ chối</Tag>;
          default:
            return <Tag color="warning">Đang chờ duyệt</Tag>;
        }
      },
    },
    {
      title: 'Thao Tác',
      key: 'actions',
      render: (_: any, row: any) => (
        <Space wrap>
          <Button
            size="small"
            icon={<Eye size="1em" />}
            onClick={() => {
              setSelectedPost(row);
              setReviewerNote(row.reviewerNote || '');
              setPostModalOpen(true);
            }}
          >
            Chi tiết
          </Button>
          <Popconfirm
            title="Xóa bài viết này?"
            onConfirm={() => handleDeletePost(row.postId)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<Trash2 size="1em" />}>
              Xóa
            </Button>
          </Popconfirm>
          {row.post?.author?.id && (
            <Popconfirm
              title={row.post?.author?.isLocked ? `Mở khóa @${row.post?.author?.username}?` : `Khóa / Ban @${row.post?.author?.username}?`}
              description={row.post?.author?.isLocked ? 'Người dùng sẽ có thể đăng nhập lại.' : 'Ngắt phiên và chặn người dùng này đăng bài.'}
              onConfirm={() => handleToggleLockUser(row.post.author.id, row.post.author.isLocked, row.post.author.username)}
              okText={row.post?.author?.isLocked ? 'Mở khóa' : 'Khóa'}
              cancelText="Hủy"
              okButtonProps={row.post?.author?.isLocked ? { type: 'primary' } : { danger: true }}
            >
              <Button size="small" type={row.post?.author?.isLocked ? 'default' : 'dashed'} danger={!row.post?.author?.isLocked} icon={row.post?.author?.isLocked ? <Unlock size="1em" /> : <Lock size="1em" />}>
                {row.post?.author?.isLocked ? 'Mở khóa' : 'Khóa User'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const collectionColumns = [
    {
      title: 'Tên Bộ Sưu Tập',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'Mô Tả',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => (
        <Text ellipsis style={{ maxWidth: 300 }}>
          {text || 'Không có mô tả'}
        </Text>
      ),
    },
    {
      title: 'Người Tạo',
      key: 'author',
      render: (_: any, row: any) => row.collection?.user?.username || 'Sinh viên',
    },
    {
      title: 'Hiển thị',
      key: 'visibility',
      render: (_: any, row: any) =>
        row.collection?.isPublic ? <Tag color="green">Công khai</Tag> : <Tag>Chờ công khai</Tag>,
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'moderationStatus',
      key: 'moderationStatus',
      render: (status: string) => {
        switch (status) {
          case 'APPROVED':
            return <Tag color="success">Đã duyệt</Tag>;
          case 'REJECTED':
            return <Tag color="error">Đã từ chối</Tag>;
          default:
            return <Tag color="warning">Đang chờ duyệt</Tag>;
        }
      },
    },
    {
      title: 'Thao Tác',
      key: 'actions',
      render: (_: any, row: any) => (
        <Button
          size="small"
          icon={<Eye size="1em" />}
          onClick={() => {
            setSelectedCollection(row);
            setReviewerNote(row.reviewerNote || '');
            setCollectionModalOpen(true);
          }}
        >
          Xem & Duyệt
        </Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'reviews',
      label: (
        <span>
          <Star size="1em" fill="currentColor" /> Đánh Giá Quán ({reviews.length})
        </span>
      ),
      children: (
        <Table
          columns={reviewColumns}
          dataSource={reviews}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      ),
    },
    {
      key: 'comments',
      label: (
        <span>
          <MessageCircle size="1em" /> Bình Luận ({comments.length})
        </span>
      ),
      children: (
        <Table
          columns={commentColumns}
          dataSource={comments}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      ),
    },
    {
      key: 'posts',
      label: (
        <span>
          <FileText size="1em" /> Bài Trải Nghiệm ({posts.length})
        </span>
      ),
      children: (
        <Table columns={postColumns} dataSource={posts} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      ),
    },
    {
      key: 'collections',
      label: (
        <span>
          <Folder size="1em" /> Bộ Sưu Tập ({collections.length})
        </span>
      ),
      children: (
        <Table
          columns={collectionColumns}
          dataSource={collections}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4}>
          Đánh giá & nội dung cộng đồng
        </Title>
        <Paragraph type="secondary">
          Nội dung đánh giá quán và hỏi đáp được xuất bản ngay lập tức. Quản trị viên quản lý hậu kiểm bằng cách ẩn/hiện, xóa nội dung vi phạm hoặc khóa / ban tài khoản người dùng vi phạm quy định.
        </Paragraph>
      </div>

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      {/* Modal Review */}
      <Modal
        title={`Chi Tiết Đánh Giá: ${selectedReview?.review?.place?.defaultName}`}
        open={reviewModalOpen}
        onCancel={() => setReviewModalOpen(false)}
        footer={null}
        width={680}
      >
        {selectedReview && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Quán">{selectedReview.review?.place?.defaultName}</Descriptions.Item>
              <Descriptions.Item label="Người đánh giá">{selectedReview.review?.user?.username}</Descriptions.Item>
              <Descriptions.Item label="Điểm tổng">{selectedReview.ratingOverall} / 5 </Descriptions.Item>
              <Descriptions.Item label="Wi-Fi">
                {selectedReview.ratingWifi ? `${selectedReview.ratingWifi} ` : 'Chưa chấm'}
              </Descriptions.Item>
              <Descriptions.Item label="Ổ cắm">
                {selectedReview.ratingSocket ? `${selectedReview.ratingSocket} ` : 'Chưa chấm'}
              </Descriptions.Item>
              <Descriptions.Item label="Độ yên tĩnh">
                {selectedReview.ratingNoise ? `${selectedReview.ratingNoise} ` : 'Chưa chấm'}
              </Descriptions.Item>
              <Descriptions.Item label="Mức chi tiêu">
                {selectedReview.spendAmount ? `${selectedReview.spendAmount.toLocaleString()} đ` : 'Chưa rõ'}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày ghé quán">{selectedReview.visitDate || 'Chưa ghi'}</Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <Text strong>Nội Dung Cảm Nhận:</Text>
              <Paragraph style={{ padding: 12, background: '#f5f5f5', borderRadius: 6, marginTop: 4 }}>
                {selectedReview.content}
              </Paragraph>
            </div>
            <AttachedPhotos assetIds={selectedReview.attachedAssetIds} />

            <div style={{ marginBottom: 16 }}>
              <Text strong>Ghi Chú Kiểm Duyệt:</Text>
              <Input.TextArea
                rows={2}
                style={{ marginTop: 4 }}
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                placeholder="Lý do phê duyệt hoặc từ chối..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <Space>
                <Popconfirm
                  title="Xóa vĩnh viễn đánh giá này?"
                  description="Điểm đánh giá trung bình của quán sẽ được tính lại ngay."
                  onConfirm={() => handleDeleteReview(selectedReview.reviewId)}
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<Trash2 size="1em" />}>
                    Xóa Đánh Giá
                  </Button>
                </Popconfirm>
                {selectedReview.review?.user?.id && (
                  <Popconfirm
                    title={selectedReview.review.user.isLocked ? `Mở khóa @${selectedReview.review.user.username}?` : `Khóa / Ban @${selectedReview.review.user.username}?`}
                    description={selectedReview.review.user.isLocked ? 'Người dùng sẽ có thể đăng nhập lại.' : 'Ngắt kết nối và chặn người dùng này đăng bài/đánh giá.'}
                    onConfirm={() => handleToggleLockUser(selectedReview.review.user.id, selectedReview.review.user.isLocked, selectedReview.review.user.username)}
                    okText={selectedReview.review.user.isLocked ? 'Mở khóa' : 'Khóa'}
                    cancelText="Hủy"
                    okButtonProps={selectedReview.review.user.isLocked ? { type: 'primary' } : { danger: true }}
                  >
                    <Button type={selectedReview.review.user.isLocked ? 'default' : 'dashed'} danger={!selectedReview.review.user.isLocked} icon={selectedReview.review.user.isLocked ? <Unlock size="1em" /> : <Lock size="1em" />}>
                      {selectedReview.review.user.isLocked ? 'Mở khóa User' : 'Khóa / Ban User'}
                    </Button>
                  </Popconfirm>
                )}
              </Space>

              {selectedReview.moderationStatus === 'PENDING' && (
                <Space>
                  <Button
                    danger
                    icon={<CircleX size="1em" />}
                    onClick={() => handleModerateReview('REJECT')}
                    loading={actionLoading}
                  >
                    Từ Chối
                  </Button>
                  <Button
                    type="primary"
                    icon={<CircleCheck size="1em" />}
                    onClick={() => handleModerateReview('APPROVE')}
                    loading={actionLoading}
                  >
                    Phê Duyệt
                  </Button>
                </Space>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Comment */}
      <Modal
        title="Chi Tiết Bình Luận"
        open={commentModalOpen}
        onCancel={() => setCommentModalOpen(false)}
        footer={null}
        width={600}
      >
        {selectedComment && (
          <div>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Người bình luận">{selectedComment.comment?.author?.username}</Descriptions.Item>
              <Descriptions.Item label="Nội dung">{selectedComment.content}</Descriptions.Item>
              {selectedComment.stickerItem && (
                <Descriptions.Item label="Sticker Đính Kèm">
                  <img src={selectedComment.stickerItem.imageUrl} alt="sticker" style={{ maxHeight: 64 }} />
                </Descriptions.Item>
              )}
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <Text strong>Ghi Chú Kiểm Duyệt:</Text>
              <Input.TextArea
                rows={2}
                style={{ marginTop: 4 }}
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                placeholder="Lý do..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <Space>
                <Popconfirm
                  title="Xóa bình luận này?"
                  onConfirm={() => handleDeleteComment(selectedComment.commentId)}
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<Trash2 size="1em" />}>
                    Xóa Bình Luận
                  </Button>
                </Popconfirm>
                {selectedComment.comment?.author?.id && (
                  <Popconfirm
                    title={selectedComment.comment.author.isLocked ? `Mở khóa @${selectedComment.comment.author.username}?` : `Khóa / Ban @${selectedComment.comment.author.username}?`}
                    description={selectedComment.comment.author.isLocked ? 'Người dùng sẽ có thể đăng nhập lại.' : 'Ngắt kết nối và chặn người dùng này bình luận.'}
                    onConfirm={() => handleToggleLockUser(selectedComment.comment.author.id, selectedComment.comment.author.isLocked, selectedComment.comment.author.username)}
                    okText={selectedComment.comment.author.isLocked ? 'Mở khóa' : 'Khóa'}
                    cancelText="Hủy"
                    okButtonProps={selectedComment.comment.author.isLocked ? { type: 'primary' } : { danger: true }}
                  >
                    <Button type={selectedComment.comment.author.isLocked ? 'default' : 'dashed'} danger={!selectedComment.comment.author.isLocked} icon={selectedComment.comment.author.isLocked ? <Unlock size="1em" /> : <Lock size="1em" />}>
                      {selectedComment.comment.author.isLocked ? 'Mở khóa User' : 'Khóa / Ban User'}
                    </Button>
                  </Popconfirm>
                )}
              </Space>

              {selectedComment.moderationStatus === 'PENDING' && (
                <Space>
                  <Button
                    danger
                    icon={<CircleX size="1em" />}
                    onClick={() => handleModerateComment('REJECT')}
                    loading={actionLoading}
                  >
                    Từ Chối
                  </Button>
                  <Button
                    type="primary"
                    icon={<CircleCheck size="1em" />}
                    onClick={() => handleModerateComment('APPROVE')}
                    loading={actionLoading}
                  >
                    Phê Duyệt
                  </Button>
                </Space>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Post */}
      <Modal
        title={`Bài Trải Nghiệm: ${selectedPost?.title}`}
        open={postModalOpen}
        onCancel={() => setPostModalOpen(false)}
        footer={null}
        width={700}
      >
        {selectedPost && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Tác giả">{selectedPost.post?.author?.username}</Descriptions.Item>
              <Descriptions.Item label="Tiêu đề">{selectedPost.title}</Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <Text strong>Nội Dung Bài Viết:</Text>
              <Paragraph
                style={{ padding: 12, background: '#f5f5f5', borderRadius: 6, marginTop: 4, whiteSpace: 'pre-wrap' }}
              >
                {selectedPost.content}
              </Paragraph>
            </div>
            <AttachedPhotos assetIds={[selectedPost.coverAssetId, ...((Array.isArray(selectedPost.contentBlocks) ? selectedPost.contentBlocks : []).map((b: any) => b?.assetId))]} />

            <div style={{ marginBottom: 16 }}>
              <Text strong>Ghi Chú Kiểm Duyệt:</Text>
              <Input.TextArea
                rows={2}
                style={{ marginTop: 4 }}
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                placeholder="Lý do..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <Space>
                <Popconfirm
                  title="Xóa bài viết này?"
                  onConfirm={() => handleDeletePost(selectedPost.postId)}
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<Trash2 size="1em" />}>
                    Xóa Bài Viết
                  </Button>
                </Popconfirm>
                {selectedPost.post?.author?.id && (
                  <Popconfirm
                    title={selectedPost.post.author.isLocked ? `Mở khóa @${selectedPost.post.author.username}?` : `Khóa / Ban @${selectedPost.post.author.username}?`}
                    description={selectedPost.post.author.isLocked ? 'Người dùng sẽ có thể đăng nhập lại.' : 'Ngắt kết nối và chặn người dùng này đăng bài.'}
                    onConfirm={() => handleToggleLockUser(selectedPost.post.author.id, selectedPost.post.author.isLocked, selectedPost.post.author.username)}
                    okText={selectedPost.post.author.isLocked ? 'Mở khóa' : 'Khóa'}
                    cancelText="Hủy"
                    okButtonProps={selectedPost.post.author.isLocked ? { type: 'primary' } : { danger: true }}
                  >
                    <Button type={selectedPost.post.author.isLocked ? 'default' : 'dashed'} danger={!selectedPost.post.author.isLocked} icon={selectedPost.post.author.isLocked ? <Unlock size="1em" /> : <Lock size="1em" />}>
                      {selectedPost.post.author.isLocked ? 'Mở khóa User' : 'Khóa / Ban User'}
                    </Button>
                  </Popconfirm>
                )}
              </Space>

              {selectedPost.moderationStatus === 'PENDING' && (
                <Space>
                  <Button
                    danger
                    icon={<CircleX size="1em" />}
                    onClick={() => handleModeratePost('REJECT')}
                    loading={actionLoading}
                  >
                    Từ Chối
                  </Button>
                  <Button
                    type="primary"
                    icon={<CircleCheck size="1em" />}
                    onClick={() => handleModeratePost('APPROVE')}
                    loading={actionLoading}
                  >
                    Phê Duyệt & Xuất Bản
                  </Button>
                </Space>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Collection */}
      <Modal
        title={`Bộ Sưu Tập: ${selectedCollection?.name}`}
        open={collectionModalOpen}
        onCancel={() => setCollectionModalOpen(false)}
        footer={null}
        width={650}
      >
        {selectedCollection && (
          <div>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Người tạo">{selectedCollection.collection?.user?.username}</Descriptions.Item>
              <Descriptions.Item label="Tên bộ sưu tập">{selectedCollection.name}</Descriptions.Item>
              <Descriptions.Item label="Mô tả">{selectedCollection.description || 'Không có'}</Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <Text strong>Ghi Chú Kiểm Duyệt:</Text>
              <Input.TextArea
                rows={2}
                style={{ marginTop: 4 }}
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                placeholder="Lý do..."
              />
            </div>

            {selectedCollection.moderationStatus === 'PENDING' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button
                  danger
                  icon={<CircleX size="1em" />}
                  onClick={() => handleModerateCollection('REJECT')}
                  loading={actionLoading}
                >
                  Từ Chối
                </Button>
                <Button
                  type="primary"
                  icon={<CircleCheck size="1em" />}
                  onClick={() => handleModerateCollection('APPROVE')}
                  loading={actionLoading}
                >
                  Phê Duyệt
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

/** Ảnh sinh viên đính kèm (xem qua preview vì ảnh chưa duyệt) — admin nhìn trước khi phê duyệt. */
const AttachedPhotos: React.FC<{ assetIds?: Array<string | null | undefined> }> = ({ assetIds }) => {
  const ids = Array.from(new Set((assetIds || []).filter((x): x is string => typeof x === 'string' && x.length > 0)));
  if (ids.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <Text strong>Ảnh đính kèm ({ids.length}):</Text>
      <Image.PreviewGroup items={ids.map((id) => `/api/v1/media/${id}?variant=optimized&preview=true`)}>
        <Space wrap size={8} style={{ marginTop: 6 }}>
          {ids.map((id) => (
            <Image key={id} src={`/api/v1/media/${id}?variant=thumb&preview=true`} preview={{ src: `/api/v1/media/${id}?variant=optimized&preview=true` }} width={96} height={96} style={{ objectFit: 'cover', borderRadius: 8 }} alt="" />
          ))}
        </Space>
      </Image.PreviewGroup>
    </div>
  );
};

export default AdminReviewsPage;
