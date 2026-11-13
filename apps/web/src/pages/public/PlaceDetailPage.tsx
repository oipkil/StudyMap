import { WIFI_LABEL, SOCKET_LABEL, PARKING_LABEL, labelOf } from '../../utils/amenityLabels';
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Star, Coffee, Wifi, Zap, Copy, Navigation, Share2, Sparkles, Armchair, FileText, Image as ImageIcon, Camera, MessageSquare, MapPin, Heart, Users, Pencil, Flag, Send, BookOpen, FolderPlus, Image, GraduationCap, Lightbulb, Snowflake, Droplets, Bike, Croissant, Bath, Clock } from 'lucide-react';
import {
  Typography,
  Tabs,
  Tag,
  Space,
  Row,
  Col,
  Card,
  Button,
  Alert,
  Spin,
  message,
  Input,
  Grid,
  Pagination,
} from 'antd';
import { WriteReviewModal } from '../../components/community/WriteReviewModal';
import { PostComposerModal } from '../../components/community/PostComposerModal';
import { ReviewCard, PostCard } from '../../components/community/ReviewCard';
import { CommentThread } from '../../components/community/CommentThread';
import { StickerPicker, StickerItem } from '../../components/community/StickerPicker';
import { ReportModal } from '../../components/community/ReportModal';
import { SaveToCollectionModal } from '../../components/community/SaveToCollectionModal';
import { PlaceContributionModal } from '../../components/places/PlaceContributionModal';
import { DynamicFieldsDisplay } from '../../components/places/DynamicFieldsDisplay';
import { PhotoGrid } from '../../components/media/PhotoGrid';
import { StudyAtmosphereMeter } from '../../components/places/StudyAtmosphereMeter';
import { NotFoundPage } from './NotFoundPage';
import { getDetailedOpenStatus } from '../../utils/openStatus';
import { useAuth } from '../../context/AuthContext';

const { Title, Text, Paragraph } = Typography;

export const PlaceDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const screensBp = Grid.useBreakpoint();
  const { user } = useAuth();

  const [place, setPlace] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFavorited, setIsFavorited] = useState<boolean>(false);
  const [favoriteLoading, setFavoriteLoading] = useState<boolean>(false);

  // Reviews, Comments & Posts state
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState<boolean>(false);
  const [comments, setComments] = useState<any[]>([]);
  // Phân trang tại chỗ cho đánh giá / bài viết / bình luận (5 mục mỗi trang)
  const PAGE = 5;
  const [reviewPage, setReviewPage] = useState(1);
  const [postPage, setPostPage] = useState(1);
  const [commentPage, setCommentPage] = useState(1);
  const pager = (total: number, current: number, onChange: (n: number) => void, testId: string) =>
    total > PAGE ? (
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
        <Pagination size="small" current={current} pageSize={PAGE} total={total} onChange={onChange} showSizeChanger={false} data-testid={testId} />
      </div>
    ) : null;
  const [commentText, setCommentText] = useState<string>('');
  const [replyToComment, setReplyToComment] = useState<any | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<StickerItem | null>(null);
  const [submittingComment, setSubmittingComment] = useState<boolean>(false);

  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState<boolean>(false);
  const [createPostModalOpen, setCreatePostModalOpen] = useState<boolean>(false);

  // Modals state
  const [reviewModalOpen, setReviewModalOpen] = useState<boolean>(false);
  const [reportModalOpen, setReportModalOpen] = useState<boolean>(false);
  const [reportTarget, setReportTarget] = useState<{ type: 'PLACE' | 'REVIEW' | 'COMMENT'; id: string; title: string }>(
    {
      type: 'PLACE',
      id: '',
      title: '',
    },
  );
  const [contributionModalOpen, setContributionModalOpen] = useState<boolean>(false);
  const [saveCollectionOpen, setSaveCollectionOpen] = useState<boolean>(false);
  const [photoCategory, setPhotoCategory] = useState<'all' | 'desk' | 'menu' | 'space'>('all');
  const [showWeeklySchedule, setShowWeeklySchedule] = useState<boolean>(false);

  useEffect(() => {
    fetchPlaceDetail();
  }, [slug]);

  const fetchPlaceDetail = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/places/${slug}`);
      if (res.data?.success && res.data?.data) {
        setPlace(res.data.data);
        const placeId = res.data.data.placeId || res.data.data.id;
        if (placeId) {
          fetchReviews(placeId);
          fetchComments(placeId);
          fetchPosts(placeId);
          checkFavorite(placeId);
        }
      } else {
        setPlace(null);
      }
    } catch (err) {
      console.error('Lỗi khi tải thông tin quán:', err);
      setPlace(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = async (placeId: string) => {
    setReviewsLoading(true);
    try {
      const res = await axios.get(`/api/v1/places/${placeId}/reviews`);
      if (res.data?.success) {
        setReviews(res.data.data || []);
      }
    } catch (err) {
      console.warn('Lỗi tải đánh giá:', err);
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  const fetchComments = async (placeId: string) => {
    try {
      const res = await axios.get(`/api/v1/community/comments?targetType=PLACE&targetId=${placeId}`);
      if (res.data?.success) {
        setComments(res.data.data || []);
      }
    } catch (err) {
      console.warn('Lỗi tải bình luận:', err);
      setComments([]);
    }
  };

  const fetchPosts = async (placeId: string) => {
    setPostsLoading(true);
    try {
      const res = await axios.get(`/api/v1/community/posts?placeId=${placeId}`);
      if (res.data?.success) {
        setPosts(res.data.data || []);
      }
    } catch (err) {
      console.warn('Lỗi tải bài viết:', err);
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  };

  const checkFavorite = async (placeId: string) => {
    if (!user) return;
    try {
      const res = await axios.get('/api/v1/me/favorites');
      if (res.data.success) {
        const isFav = res.data.data.some((f: any) => f.placeId === placeId);
        setIsFavorited(isFav);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFavorite = async () => {
    if (!user) {
      message.info('Vui lòng đăng nhập để lưu quán yêu thích');
      navigate('/login');
      return;
    }
    const placeId = place.placeId || place.id;
    setFavoriteLoading(true);
    try {
      const res = await axios.post(`/api/v1/me/favorites/${placeId}`);
      if (res.data.success) {
        setIsFavorited(res.data.isFavorited);
        message.success(res.data.isFavorited ? 'Đã lưu quán vào danh sách yêu thích' : 'Đã bỏ lưu quán');
      }
    } catch {
      message.error('Lỗi khi cập nhật yêu thích');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleHelpfulVote = async (reviewId: string) => {
    if (!user) {
      message.info('Vui lòng đăng nhập để bình chọn');
      navigate('/login');
      return;
    }
    try {
      const res = await axios.post(`/api/v1/places/reviews/${reviewId}/vote-helpful`);
      if (res.data.success) {
        message.success(res.data.voted ? 'Đã cảm ơn đánh giá hữu ích' : 'Đã hủy bình chọn');
        fetchReviews(place.placeId || place.id);
      }
    } catch {
      message.error('Lỗi khi bình chọn hữu ích');
    }
  };

  /** Xoá đánh giá của chính mình -> điểm quán được tính lại ngay. */
  const handleDeleteReview = async (reviewId: string) => {
    try {
      await axios.delete(`/api/v1/places/reviews/${reviewId}`);
      message.success('Đã xoá đánh giá của bạn');
      fetchPlaceDetail();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được đánh giá');
    }
  };

  /** Thu hồi bản đánh giá đang chờ duyệt (giữ bản đã duyệt nếu có). */
  const handleWithdrawReview = async (reviewId: string) => {
    try {
      const res = await axios.post(`/api/v1/places/reviews/${reviewId}/withdraw`);
      message.success(res.data?.message || 'Đã thu hồi');
      fetchPlaceDetail();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thu hồi được');
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await axios.delete(`/api/v1/community/posts/${postId}`);
      message.success('Đã xoá bài viết');
      fetchPosts(place.placeId || place.id);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được bài viết');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await axios.delete(`/api/v1/community/comments/${commentId}`);
      message.success('Đã xoá bình luận');
      fetchComments(place.placeId || place.id);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được bình luận');
    }
  };

  const handleSendComment = async () => {
    if (!user) {
      message.info('Vui lòng đăng nhập để gửi bình luận');
      navigate('/login');
      return;
    }
    if (!commentText.trim() && !selectedSticker) {
      message.warning('Vui lòng nhập nội dung bình luận hoặc chọn nhãn dán');
      return;
    }

    setSubmittingComment(true);
    try {
      const placeId = place.placeId || place.id;
      const res = await axios.post('/api/v1/community/comments', {
        targetType: 'PLACE',
        targetId: placeId,
        parentCommentId: replyToComment ? replyToComment.id : null,
        content: commentText.trim() || 'Đã gửi nhãn dán',
        stickerItemId: selectedSticker ? selectedSticker.id : null,
      });

      if (res.data.success) {
        message.success('Đã gửi bình luận thành công');
        setCommentText('');
        setSelectedSticker(null);
        setReplyToComment(null);
        fetchComments(placeId);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi gửi bình luận');
    } finally {
      setSubmittingComment(false);
    }
  };

  const snap = place?.snapshot || {};
  // Phòng học nhóm: trường động kiểu REPEATER trong snapshot (fieldKey study_rooms_list)
  // Tra nhanh giá trị trường động theo key (dùng cho khối công thái học / giờ đông khách / mật khẩu Wi-Fi)
  const dynByKey: Record<string, any> = Array.isArray(snap.dynamicFieldValues)
    ? Object.fromEntries(snap.dynamicFieldValues.filter((d: any) => d?.fieldKey).map((d: any) => [d.fieldKey, d.value]))
    : {};
  const dynText = (key: string) => {
    const v = dynByKey[key];
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v ? 'Có' : 'Không';
    if (typeof v === 'object') return null;
    return String(v);
  };

  const repeaterField = Array.isArray(snap.dynamicFieldValues)
    ? snap.dynamicFieldValues.find((d: any) => d?.dataType === 'REPEATER' && Array.isArray(d.value))
    : null;
  const studyRooms: any[] = repeaterField?.value || snap.customFields?.study_rooms || [];

  const DAY_LABEL = (d: number) => (d === 0 ? 'CN' : `Thứ ${d + 1}`);
  const formatPriceRange = (min?: number | null, max?: number | null) => {
    if (!min && !max) return 'Chưa cập nhật';
    const fmt = (p: number) => (p >= 1000 ? `${Math.round(p / 1000)}k` : `${p}đ`);
    if (min && max) {
      if (min === max) return fmt(min);
      return `${fmt(min)} - ${fmt(max)}`;
    }
    return min ? `Từ ${fmt(min)}` : `Đến ${fmt(max!)}`;
  };
  const gallery: any[] = Array.isArray(snap.gallery) ? snap.gallery : [];
  const coverPhoto = gallery.find((g) => g?.isCover) || gallery[0] || null;
  const isMobileView = !screensBp.md;

  const allPhotos = useMemo(
    () => [coverPhoto, ...gallery.filter((g) => g !== coverPhoto)].filter(Boolean),
    [coverPhoto, gallery],
  );

  const matchPhotoCategory = (p: any, cat: 'desk' | 'menu' | 'space') => {
    if (p?.category === cat) return true;
    const text = `${p?.caption || ''} ${p?.alt || ''} ${p?.publicUrl || ''}`.toLowerCase();
    if (cat === 'desk') {
      const keywords = ['bàn', 'ban', 'ghế', 'ghe', 'desk', 'chair', 'ổ cắm', 'socket', 'học', 'study', 'work', 'laptop', 'cắm điện', 'công thái học'];
      return keywords.some((k) => text.includes(k));
    }
    if (cat === 'menu') {
      const keywords = ['menu', 'giá', 'nước', 'đồ uống', 'cafe', 'cà phê', 'tea', 'trà', 'bánh', 'cake', 'drink', 'pha chế', 'quầy'];
      return keywords.some((k) => text.includes(k));
    }
    if (cat === 'space') {
      const keywords = ['không gian', 'không-gian', 'view', 'quán', 'space', 'tầng', 'sân', 'ngoài', 'room', 'phòng', 'ban công', 'cửa', 'vintage', 'hiện đại', 'thoáng'];
      return keywords.some((k) => text.includes(k));
    }
    return false;
  };

  const deskPhotos = useMemo(() => allPhotos.filter((p) => matchPhotoCategory(p, 'desk')), [allPhotos]);
  const menuPhotos = useMemo(() => allPhotos.filter((p) => matchPhotoCategory(p, 'menu')), [allPhotos]);
  const spacePhotos = useMemo(() => allPhotos.filter((p) => matchPhotoCategory(p, 'space')), [allPhotos]);

  const categoryCounts = useMemo(
    () => ({
      all: allPhotos.length,
      desk: deskPhotos.length,
      menu: menuPhotos.length,
      space: spacePhotos.length,
    }),
    [allPhotos.length, deskPhotos.length, menuPhotos.length, spacePhotos.length],
  );

  const categorizedPhotos = useMemo(() => {
    if (photoCategory === 'desk') return deskPhotos;
    if (photoCategory === 'menu') return menuPhotos;
    if (photoCategory === 'space') return spacePhotos;
    return allPhotos;
  }, [photoCategory, allPhotos, deskPhotos, menuPhotos, spacePhotos]);

  const openInfo = useMemo(() => {
    return place ? getDetailedOpenStatus(place) : { isOpen: false, text: 'Đang tải...', color: '#999', bg: '#f5f5f5', border: '#ddd' };
  }, [place]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!place) {
    return (
      <NotFoundPage
        title="Không tìm thấy quán này"
        description="Quán có thể đã bị gỡ, đổi đường dẫn, hoặc đang chờ ban quản trị duyệt."
      />
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60, paddingLeft: 12, paddingRight: 12 }}>
      {/* Hero Visual Gallery kiểu Airbnb / Pinterest: Chiếm vị trí nổi bật, ưu tiên thị giác */}
      {gallery.length > 0 && (
        <Card
          style={{
            marginBottom: 24,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid #EAE3D9',
            boxShadow: '0 4px 20px rgba(74, 46, 24, 0.06)',
          }}
          styles={{ body: { padding: 12 } }}
        >
          {/* Photo Category Filter Tabs: Lọc nhanh ảnh Bàn & Ổ cắm, Menu, Không gian */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4A2E18', marginRight: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Camera size={14} color="#6F4E37" /> Góc chụp:
              </span>
              {[
                { key: 'all', label: `Tất cả (${categoryCounts.all})`, icon: <ImageIcon size={13} />, count: categoryCounts.all },
                { key: 'desk', label: `Bàn & Ổ cắm (${categoryCounts.desk})`, icon: <Armchair size={13} />, count: categoryCounts.desk },
                { key: 'menu', label: `Menu (${categoryCounts.menu})`, icon: <FileText size={13} />, count: categoryCounts.menu },
                { key: 'space', label: `Không gian (${categoryCounts.space})`, icon: <Sparkles size={13} />, count: categoryCounts.space },
              ].map((cat) => {
                const isActive = photoCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setPhotoCategory(cat.key as any)}
                    style={{
                      background: isActive ? '#4A2E18' : '#FAF7F2',
                      color: isActive ? '#FFFFFF' : cat.count === 0 ? '#A89F91' : '#4A2E18',
                      border: '1px solid ' + (isActive ? '#4A2E18' : '#EAE3D9'),
                      borderRadius: 18,
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.18s ease',
                      opacity: !isActive && cat.count === 0 ? 0.65 : 1,
                    }}
                  >
                    {cat.icon}
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            <Button
              size="small"
              type="link"
              onClick={() => setContributionModalOpen(true)}
              style={{ color: '#6F4E37', fontWeight: 600, padding: 0 }}
            >
              + Đóng góp thêm ảnh góc quán
            </Button>
          </div>

          {categorizedPhotos.length > 0 ? (
            <div style={{ position: 'relative' }}>
              <PhotoGrid
                photos={categorizedPhotos.map((g: any) => ({
                  assetId: g.assetId,
                  url: g.publicUrl || g.thumbUrl,
                  fullUrl: g.publicUrl,
                  alt: g.caption || snap.name,
                }))}
                variant={isMobileView ? 'feed' : 'collage'}
                height={isMobileView ? 340 : 500}
                singleMaxHeight={320}
                gap={8}
                rounded={14}
              />

              {/* Nút nổi xem toàn bộ album kiểu Airbnb */}
              <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 4 }}>
                <Button
                  size="middle"
                  icon={<Image size="1em" />}
                  onClick={() => {
                    const firstImg = document.querySelector('[data-testid="photo-grid-fb"] img') as HTMLElement;
                    if (firstImg) firstImg.click();
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.94)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(234, 227, 217, 0.9)',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: 13,
                    color: '#4A2E18',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.16)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 38,
                    padding: '0 16px',
                  }}
                >
                  Xem toàn bộ ({allPhotos.length} ảnh)
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 16px', background: '#FAF7F2', borderRadius: 12, border: '1px dashed #EAE3D9' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#4A2E18' }}>
                Chưa có ảnh trong mục này
              </div>
              <div style={{ fontSize: 13, color: '#7A6C60', marginTop: 4, marginBottom: 16 }}>
                Quán chưa có ảnh cho phân loại này. Bạn có thể bấm "Tất cả" hoặc đóng góp ảnh mới!
              </div>
              <Space>
                <Button size="middle" onClick={() => setPhotoCategory('all')}>
                  Xem tất cả ({allPhotos.length} ảnh)
                </Button>
                <Button size="middle" type="primary" icon={<Camera size={14} />} style={{ background: '#6F4E37', borderColor: '#6F4E37' }} onClick={() => setContributionModalOpen(true)}>
                  Đóng góp ảnh
                </Button>
              </Space>
            </div>
          )}
        </Card>
      )}

      {/* Header Info */}
      <Card style={{ marginBottom: 24, borderRadius: 14, overflow: 'hidden', border: '1px solid #EAE3D9' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <Space align="center" size="middle" wrap>
              <Title level={2} style={{ margin: 0, color: '#4A2E18', fontWeight: 800 }}>
                {snap.name || place.name}
              </Title>
              <Tag icon={<Clock size={12} />} style={{ fontSize: 13, padding: '3px 10px', background: openInfo.bg, color: openInfo.color, border: `1px solid ${openInfo.border}`, borderRadius: 6, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {openInfo.text}
              </Tag>
              {snap.studentDiscountDetails && (
                <Tag icon={<GraduationCap size={13} />} style={{ fontSize: 13, padding: '2px 10px', background: '#FFF7E6', color: '#C67D34', border: '1px solid #FFD591', borderRadius: 6, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  Ưu đãi sinh viên
                </Tag>
              )}
            </Space>

            <div
              style={{
                marginTop: 8,
                color: '#7A6C60',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              <MapPin size="1em" style={{ color: '#6F4E37' }} />
              <Text style={{ color: '#7A6C60' }}>{snap.address || place.address || 'Quận 5, TP.HCM'}</Text>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              width: isMobileView ? '100%' : 'auto',
              marginTop: isMobileView ? 8 : 0,
            }}
          >
            <Button
              type={isFavorited ? 'primary' : 'default'}
              danger={isFavorited}
              icon={isFavorited ? <Heart size="1em" fill="currentColor" /> : <Heart size="1em" />}
              onClick={handleToggleFavorite}
              loading={favoriteLoading}
              style={{
                borderRadius: 8,
                ...(isFavorited ? {} : { borderColor: '#EAE3D9', color: '#4A2E18' }),
                flex: isMobileView ? '1 1 calc(50% - 4px)' : 'none',
              }}
            >
              {isFavorited ? 'Đã Lưu' : 'Lưu Quán'}
            </Button>
            <Button
              icon={<FolderPlus size="1em" />}
              onClick={() => {
                if (!user) {
                  message.info('Đăng nhập để lưu quán vào bộ sưu tập');
                  navigate('/login');
                  return;
                }
                setSaveCollectionOpen(true);
              }}
              style={{
                borderRadius: 8,
                borderColor: '#EAE3D9',
                color: '#4A2E18',
                flex: isMobileView ? '1 1 calc(50% - 4px)' : 'none',
              }}
            >
              Bộ sưu tập
            </Button>
            <Button
              icon={<Pencil size="1em" />}
              onClick={() => setContributionModalOpen(true)}
              style={{
                borderRadius: 8,
                borderColor: '#EAE3D9',
                color: '#4A2E18',
                flex: isMobileView ? '1 1 calc(50% - 4px)' : 'none',
              }}
            >
              Báo sửa
            </Button>
            <Button
              danger
              icon={<Flag size="1em" />}
              onClick={() => {
                setReportTarget({ type: 'PLACE', id: place.placeId || place.id, title: snap.name });
                setReportModalOpen(true);
              }}
              style={{
                borderRadius: 8,
                flex: isMobileView ? '1 1 calc(50% - 4px)' : 'none',
              }}
            >
              Báo cáo
            </Button>
          </div>
        </div>

        {/* Highlight Metrics (Gọn gàng, chuẩn responsive không bị tràn chữ trên điện thoại) */}
        <Row gutter={[{ xs: 10, sm: 14 }, { xs: 10, sm: 14 }]} style={{ marginTop: 20 }}>
          <Col xs={12} sm={6}>
            <div
              style={{
                padding: '12px 14px',
                background: '#FFFFFF',
                border: '1px solid #EAE3D9',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(74, 46, 24, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 80,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: '#FFF9F0',
                    border: '1px solid #F0D5BE',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#C67D34',
                    flexShrink: 0,
                  }}
                >
                  <Star size={13} fill="#C67D34" stroke="#C67D34" />
                </div>
                <span style={{ fontSize: 12, color: '#7A6C60', fontWeight: 600 }}>
                  Đánh giá SV
                </span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#C67D34', marginTop: 4, lineHeight: 1.2 }}>
                {place.ratingOverall > 0 ? `${place.ratingOverall} / 5` : 'Mới'}
              </div>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div
              style={{
                padding: '12px 14px',
                background: '#FFFFFF',
                border: '1px solid #EAE3D9',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(74, 46, 24, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 80,
              }}
              title={
                place.priceMin || place.priceMax
                  ? `${place.priceMin ? place.priceMin.toLocaleString('vi-VN') + 'đ' : ''} - ${place.priceMax ? place.priceMax.toLocaleString('vi-VN') + 'đ' : ''}`
                  : undefined
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: '#F5EFEB',
                    border: '1px solid #E4D5CA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6F4E37',
                    flexShrink: 0,
                  }}
                >
                  <Coffee size={13} />
                </div>
                <span style={{ fontSize: 12, color: '#7A6C60', fontWeight: 600 }}>
                  Mức giá
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#6F4E37', marginTop: 4, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatPriceRange(place.priceMin, place.priceMax)}
              </div>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div
              style={{
                padding: '12px 14px',
                background: '#FFFFFF',
                border: '1px solid #EAE3D9',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(74, 46, 24, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 80,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: '#EDF4F0',
                    border: '1px solid #CADDCF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2D5A43',
                    flexShrink: 0,
                  }}
                >
                  <Wifi size={13} />
                </div>
                <span style={{ fontSize: 12, color: '#7A6C60', fontWeight: 600 }}>
                  Tốc độ Wi-Fi
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2D5A43', marginTop: 4, lineHeight: 1.2 }}>
                {labelOf(WIFI_LABEL, snap.amenities?.wifiQuality)}
              </div>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div
              style={{
                padding: '12px 14px',
                background: '#FFFFFF',
                border: '1px solid #EAE3D9',
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(74, 46, 24, 0.04)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 80,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: '#EDF4F0',
                    border: '1px solid #CADDCF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2D5A43',
                    flexShrink: 0,
                  }}
                >
                  <Zap size={13} />
                </div>
                <span style={{ fontSize: 12, color: '#7A6C60', fontWeight: 600 }}>
                  Mật độ ổ cắm
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#2D5A43', marginTop: 4, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {labelOf(SOCKET_LABEL, snap.amenities?.socketDensity)}
              </div>
            </div>
          </Col>
        </Row>

        {/* Fast Student Study Action Bar: WiFi Copy, Direction, Share */}
        <div
          style={{
            marginTop: 18,
            padding: '12px 18px',
            background: 'linear-gradient(135deg, #FAF7F2 0%, #F5ECE1 100%)',
            borderRadius: 12,
            border: '1px solid #EAE3D9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: '#FFFFFF',
                  border: '1px solid #EAE3D9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6F4E37',
                }}
              >
                <Wifi size={18} />
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#7A6C60', display: 'block', lineHeight: 1.1, fontWeight: 500 }}>
                  Mật khẩu Wi-Fi quán:
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#4A2E18', fontFamily: 'monospace' }}>
                  {dynText('wifi_password') || snap.amenities?.wifiPassword || 'Hỏi nhân viên tại quán'}
                </span>
              </div>
            </div>
            <Button
              size="small"
              icon={<Copy size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              onClick={() => {
                const pass = dynText('wifi_password') || snap.amenities?.wifiPassword || '';
                if (!pass) {
                  message.info('Quán chưa cung cấp mật khẩu Wi-Fi — bạn hỏi nhân viên giúp nhé');
                  return;
                }
                navigator.clipboard.writeText(pass);
                message.success(`Đã sao chép mật khẩu Wi-Fi: ${pass}`);
              }}
              style={{
                borderRadius: 8,
                borderColor: '#C67D34',
                color: '#C67D34',
                fontWeight: 600,
                fontSize: 12,
                background: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 12px',
                height: 32,
              }}
            >
              Sao Chép Pass
            </Button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              type="primary"
              size="small"
              icon={<Navigation size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              onClick={() => {
                const query = encodeURIComponent(`${snap.name || place.name} ${snap.address || place.address || 'TP.HCM'}`);
                window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
              }}
              style={{
                background: '#2D5A43',
                borderColor: '#2D5A43',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 12px',
                height: 32,
              }}
            >
              Chỉ Đường Maps
            </Button>
            <Button
              size="small"
              icon={<Share2 size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: snap.name || place.name,
                    text: `Ghé quán cà phê học bài "${snap.name || place.name}" cùng mình nhé!`,
                    url: window.location.href,
                  }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  message.success('Đã sao chép liên kết quán!');
                }
              }}
              style={{
                borderRadius: 8,
                borderColor: '#EAE3D9',
                color: '#4A2E18',
                fontWeight: 600,
                fontSize: 12,
                background: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 12px',
                height: 32,
              }}
            >
              Rủ Bạn Bè
            </Button>
          </div>
        </div>
      </Card>

      {/* 1. Trực Quan Hóa Dữ Liệu Học Bài & Giờ Cao Điểm (Nomad List Standard) */}
      <StudyAtmosphereMeter
        placeId={place.placeId || place.id}
        placeName={snap.name || place.name}
        noiseLevel={snap.amenities?.noiseLevel}
        socketDensity={snap.amenities?.socketDensity}
        wifiQuality={snap.amenities?.wifiQuality}
        motorcycleParking={snap.amenities?.motorcycleParking}
        is24h={place.is24h || snap.weeklySchedule?.some((s: any) => s.is24h)}
        crowdByBlock={{
          crowd_morning: dynText('crowd_morning'),
          crowd_noon: dynText('crowd_noon'),
          crowd_afternoon: dynText('crowd_afternoon'),
          crowd_evening: dynText('crowd_evening'),
          crowd_latenight: dynText('crowd_latenight'),
        }}
        onContribute={() => setContributionModalOpen(true)}
      />

      {/* ========================================================================= */}
      {/* 1. ĐÁNH GIÁ TỪ SINH VIÊN (HIỂN THỊ TRỰC TIẾP RA NGOÀI TRƯỚC TIỆN ÍCH)     */}
      {/* ========================================================================= */}
      <Card
        data-testid="reviews-section"
        style={{
          borderRadius: 14,
          border: '1px solid #EAE3D9',
          boxShadow: '0 4px 18px rgba(74, 46, 24, 0.05)',
          background: '#FFFFFF',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <Space size={10}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF9F0', border: '1px solid #F0D5BE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C67D34' }}>
              <Star size={18} fill="#C67D34" stroke="#C67D34" />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, color: '#4A2E18', fontWeight: 800 }}>
                Đánh Giá Từ Sinh Viên ({reviews.length})
              </Title>
            </div>
          </Space>

          <Button
            type="primary"
            icon={<Star size="1em" fill="currentColor" />}
            onClick={() => (user ? setReviewModalOpen(true) : navigate('/login'))}
            data-testid="btn-write-review"
            style={{ background: '#6F4E37', borderColor: '#6F4E37', borderRadius: 8, fontWeight: 700 }}
          >
            Viết Đánh Giá
          </Button>
        </div>

        {/* Điểm tổng hợp */}
        <div
          style={{
            background: '#FAF7F2',
            borderRadius: 12,
            padding: '14px 18px',
            border: '1px solid #EAE3D9',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#C67D34', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={28} fill="#C67D34" stroke="#C67D34" />
              <span>{place.ratingOverall > 0 ? place.ratingOverall : '5.0'}</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#4A2E18' }}>
                Điểm đánh giá trung bình
              </div>
              <div style={{ fontSize: 12, color: '#7A6C60' }}>
                {reviews.length > 0 ? `${reviews.length} đánh giá từ sinh viên` : 'Chưa có đánh giá nào'}
              </div>
            </div>
          </div>
        </div>

        {/* Danh sách review */}
        {reviewsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : reviews.length === 0 ? (
          <Alert
            message="Chưa có đánh giá nào cho quán"
            description="Hãy là người đầu tiên chia sẻ góc học tập, tốc độ wifi và trải nghiệm của bạn tại quán nhé!"
            type="info"
            showIcon
            action={
              <Button size="small" type="primary" style={{ background: '#6F4E37', borderColor: '#6F4E37' }} onClick={() => (user ? setReviewModalOpen(true) : navigate('/login'))}>
                Đánh giá ngay
              </Button>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reviews.slice((reviewPage - 1) * PAGE, reviewPage * PAGE).map((review: any) => (
              <ReviewCard
                key={review.id}
                author={review.author || review.user}
                rating={review.ratingOverall}
                content={review.content || review.revision?.content || ''}
                photos={review.photos || []}
                visitDate={review.visitDate || review.revision?.visitDate}
                createdAt={review.createdAt}
                helpfulCount={review.helpfulVotesCount ?? review.helpfulCount}
                onHelpful={() => handleHelpfulVote(review.id)}
                onReport={() => {
                  setReportTarget({ type: 'REVIEW', id: review.id, title: (review.content || '').slice(0, 80) || 'Đánh giá' });
                  setReportModalOpen(true);
                }}
                onDelete={((review.author?.id || review.user?.id) === user?.id || user?.role === 'ADMIN') ? () => handleDeleteReview(review.id) : undefined}
                onWithdraw={(review.author?.id || review.user?.id) === user?.id && review.hasPendingRevision ? () => handleWithdrawReview(review.id) : undefined}
              />
            ))}
            {pager(reviews.length, reviewPage, setReviewPage, 'review-pagination')}
          </div>
        )}
      </Card>

      {/* ========================================================================= */}
      {/* 2. THÔNG TIN & TIỆN ÍCH QUÁN (THIẾT KẾ GỌN GÀNG, BỚT CHỮ, VISUAL CHIPS)     */}
      {/* ========================================================================= */}
      <Card
        style={{
          borderRadius: 14,
          border: '1px solid #EAE3D9',
          boxShadow: '0 4px 18px rgba(74, 46, 24, 0.05)',
          background: '#FFFFFF',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Space size={10}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F5EFEB', border: '1px solid #E4D5CA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6F4E37' }}>
              <FileText size={18} />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, color: '#4A2E18', fontWeight: 800 }}>
                Thông Tin & Tiện Ích Quán
              </Title>
            </div>
          </Space>

          <Button size="small" type="link" onClick={() => setContributionModalOpen(true)} style={{ color: '#6F4E37', fontWeight: 600 }}>
            + Đóng góp thêm thông tin
          </Button>
        </div>

        {/* Mô tả ngắn gọn có nút Xem thêm để tránh tường chữ */}
        {(snap.shortDescription || snap.fullDescription) && (
          <div style={{ marginBottom: 16, background: '#FAF7F2', borderRadius: 10, padding: '12px 16px', border: '1px solid #EAE3D9' }} data-testid="place-description">
            <Paragraph
              style={{ margin: 0, fontSize: 13, color: '#4A2E18', lineHeight: 1.6, whiteSpace: 'pre-line' }}
              ellipsis={{ rows: 2, expandable: true, symbol: 'Xem thêm ▾' }}
            >
              {snap.shortDescription || snap.fullDescription}
            </Paragraph>
          </div>
        )}

        {/* Tiện Ích Sinh Viên (Dạng chips gọn gàng, súc tích) */}
        <div style={{ marginBottom: 16 }} data-testid="ergonomics-rows">
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7A6C60', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Tiện nghi học bài
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(
              [
                dynText('desk_height_cm')
                  ? { icon: <Armchair size={14} color="#6F4E37" />, label: `Bàn ${dynText('desk_height_cm')}cm laptop` }
                  : dynByKey.desk_laptop_friendly
                    ? { icon: <Armchair size={14} color="#6F4E37" />, label: 'Bàn laptop' }
                    : null,
                dynByKey.chair_back_support !== false
                  ? { icon: <Armchair size={14} color="#6F4E37" />, label: 'Ghế đệm tựa lưng' }
                  : null,
                dynByKey.desk_lamp_available
                  ? { icon: <Lightbulb size={14} color="#C67D34" />, label: 'Đèn bàn' }
                  : null,
                snap.amenities?.airConditioned !== false
                  ? { icon: <Snowflake size={14} color="#2D5A43" />, label: 'Máy lạnh' }
                  : null,
                dynByKey.free_water_refill !== false
                  ? { icon: <Droplets size={14} color="#2D5A43" />, label: 'Nước lọc free' }
                  : null,
                snap.amenities?.motorcycleParking
                  ? { icon: <Bike size={14} color="#6F4E37" />, label: labelOf(PARKING_LABEL, snap.amenities.motorcycleParking) }
                  : null,
                dynByKey.has_food
                  ? { icon: <Croissant size={14} color="#C67D34" />, label: 'Bánh & đồ ăn nhẹ' }
                  : null,
                snap.amenities?.groupStudyAllowed
                  ? { icon: <Users size={14} color="#2D5A43" />, label: 'Học nhóm' }
                  : null,
                dynText('restroom_quality')
                  ? { icon: <Bath size={14} color="#6F4E37" />, label: `WC ${dynText('restroom_quality')}` }
                  : null,
              ].filter(Boolean) as { icon: React.ReactNode; label: string }[]
            ).map((chip, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 16,
                  background: '#FAF7F2',
                  border: '1px solid #EAE3D9',
                  color: '#4A2E18',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {chip.icon}
                {chip.label}
              </span>
            ))}
          </div>
        </div>

        {/* Ưu đãi sinh viên chi tiết nếu có */}
        {snap.studentDiscountDetails && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#FFF9F0', border: '1px solid #F0D5BE', borderRadius: 10, fontSize: 13, color: '#C67D34', display: 'flex', alignItems: 'center', gap: 8 }}>
            <GraduationCap size={18} color="#C67D34" style={{ flexShrink: 0 }} />
            <span><strong>Ưu đãi sinh viên:</strong> {snap.studentDiscountDetails}</span>
          </div>
        )}

        {/* Lịch mở cửa chi tiết cả tuần (Thu gọn mặc định để tránh rối mắt) */}
        {snap.weeklySchedule && snap.weeklySchedule.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #EAE3D9' }}>
            <Button
              type="link"
              size="small"
              onClick={() => setShowWeeklySchedule(!showWeeklySchedule)}
              style={{ padding: 0, height: 'auto', fontSize: 12, color: '#C67D34', fontWeight: 600 }}
            >
              {showWeeklySchedule ? 'Thu gọn lịch mở cửa cả tuần ▴' : 'Xem lịch mở cửa cả tuần ▾'}
            </Button>
            {showWeeklySchedule && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: '#FAF7F2', borderRadius: 8, border: '1px solid #EAE3D9', fontSize: 12, maxWidth: 380 }}>
                {snap.weeklySchedule.map((s: any, idx: number) => {
                  const shifts: any[] = Array.isArray(s.shifts) ? s.shifts : [];
                  const text = s.isClosed ? 'Đóng cửa' : s.is24h ? '24/24' : shifts.length > 0 ? shifts.map((sh: any) => `${sh.openTime}-${sh.closeTime}`).join(', ') : `${s.openTime || ''}-${s.closeTime || ''}`;
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                      <span style={{ color: '#7A6C60' }}>{DAY_LABEL(s.dayOfWeek)}:</span>
                      <span style={{ fontWeight: 600, color: '#4A2E18' }}>{text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tiện ích chi tiết mở rộng nếu có */}
        <div style={{ marginTop: 14 }}>
          <DynamicFieldsDisplay values={snap.dynamicFieldValues} />
        </div>

        {/* Phòng học nhóm nếu quán có */}
        {studyRooms.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #EAE3D9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Users size="1em" style={{ color: '#2F6B4F' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4A2E18' }}>
                Phòng Học Nhóm Chuyên Dụng ({studyRooms.length} phòng)
              </span>
            </div>
            <Row gutter={[12, 12]}>
              {studyRooms.map((room: any, index: number) => (
                <Col xs={24} sm={12} key={index}>
                  <div style={{ padding: '10px 14px', background: '#FAF7F2', borderRadius: 8, border: '1px solid #EAE3D9' }}>
                    <div style={{ fontWeight: 700, color: '#4A2E18', fontSize: 13 }}>{room.room_name || `Phòng ${index + 1}`}</div>
                    <div style={{ fontSize: 12, color: '#7A6C60', marginTop: 2 }}>
                      Sức chứa: <strong>{room.capacity ? `${room.capacity} người` : '4-8 người'}</strong> • Giá: <strong>{typeof room.price_per_hour === 'number' && room.price_per_hour > 0 ? `${room.price_per_hour.toLocaleString('vi-VN')}đ / giờ` : 'Miễn phí khi gọi đồ uống'}</strong>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Card>

      {/* ========================================================================= */}
      {/* 3. CỘNG ĐỒNG: BÀI TRẢI NGHIỆM & HỎI ĐÁP / BÌNH LUẬN                         */}
      {/* ========================================================================= */}
      <Card style={{ borderRadius: 14, border: '1px solid #EAE3D9', boxShadow: '0 4px 18px rgba(74, 46, 24, 0.05)', background: '#FFFFFF' }}>
        <Tabs
          defaultActiveKey="comments"
          items={[
            {
              key: 'comments',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={14} />
                  <span>Hỏi Đáp & Thảo Luận ({comments.length})</span>
                </span>
              ),
              children: (
                <div>
                  {/* Ô nhập bình luận */}
                  <Card size="small" style={{ marginBottom: 20, background: '#FAF9F6' }}>
                    {replyToComment && (
                      <div
                        style={{
                          marginBottom: 8,
                          padding: 6,
                          background: '#e6f7ff',
                          borderRadius: 4,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>
                          Đang trả lời:{' '}
                          <strong>{replyToComment.author?.displayName || replyToComment.author?.username}</strong>
                        </Text>
                        <Button size="small" type="text" onClick={() => setReplyToComment(null)}>
                          ✕ Hủy
                        </Button>
                      </div>
                    )}
                    <Input.TextArea
                      rows={3}
                      placeholder="Đặt câu hỏi về quán (ổ cắm, mật khẩu wifi, chỗ ngồi...) hoặc bình luận cảm nhận..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                    />
                    {selectedSticker && (
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Đính kèm nhãn dán:
                        </Text>
                        <img src={selectedSticker.url} alt={selectedSticker.name} style={{ width: 36, height: 36 }} />
                        <Button size="small" type="text" danger onClick={() => setSelectedSticker(null)}>
                          ✕ Xóa
                        </Button>
                      </div>
                    )}
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}
                    >
                      <StickerPicker onSelect={(stk) => setSelectedSticker(stk)} />
                      <Button
                        type="primary"
                        icon={<Send size="1em" />}
                        onClick={handleSendComment}
                        loading={submittingComment}
                        style={{ background: '#6F4E37', borderColor: '#6F4E37', borderRadius: 6 }}
                      >
                        Gửi Bình Luận
                      </Button>
                    </div>
                  </Card>

                  {/* Danh sách bình luận */}
                  <CommentThread
                    comments={comments}
                    currentUserId={user?.id}
                    isAdmin={user?.role === 'ADMIN'}
                    page={commentPage}
                    pageSize={PAGE}
                    onPageChange={setCommentPage}
                    onReply={(c) => setReplyToComment(c)}
                    onDelete={handleDeleteComment}
                    onReport={(c) => {
                      setReportTarget({ type: 'COMMENT', id: c.id, title: c.content || 'Bình luận' });
                      setReportModalOpen(true);
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'gallery_album',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ImageIcon size={14} />
                  <span>Thư Viện Hình Ảnh ({allPhotos.length})</span>
                </span>
              ),
              children: (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 16,
                      flexWrap: 'wrap',
                      gap: 10,
                    }}
                  >
                    <div>
                      <Title level={4} style={{ margin: 0, color: '#4A2E18', fontWeight: 800 }}>
                        Tất Cả Hình Ảnh Quán ({allPhotos.length} ảnh)
                      </Title>
                      <Text type="secondary" style={{ fontSize: 13, color: '#7A6C60' }}>
                        Toàn bộ ảnh chụp thực tế không gian, bàn ghế, ổ cắm và đồ uống của quán
                      </Text>
                    </div>
                    <Button
                      type="primary"
                      icon={<Image size="1em" />}
                      onClick={() => setContributionModalOpen(true)}
                      style={{ background: '#6F4E37', borderColor: '#6F4E37', borderRadius: 8, fontWeight: 600 }}
                    >
                      + Đóng Góp Thêm Ảnh
                    </Button>
                  </div>

                  {allPhotos.length === 0 ? (
                    <Alert message="Quán chưa có hình ảnh nào. Hãy là người đầu tiên đóng góp ảnh!" type="info" showIcon />
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobileView ? '1fr' : 'repeat(3, 1fr)',
                        gap: 16,
                      }}
                    >
                      {allPhotos.map((p, idx) => (
                        <div
                          key={p.assetId || idx}
                          style={{
                            borderRadius: 14,
                            overflow: 'hidden',
                            border: '1px solid #EAE3D9',
                            background: '#FFFFFF',
                            boxShadow: '0 2px 10px rgba(74, 46, 24, 0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-3px)';
                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(74, 46, 24, 0.12)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 2px 10px rgba(74, 46, 24, 0.05)';
                          }}
                        >
                          <div style={{ height: 230, overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
                            <img
                              src={p.publicUrl || p.thumbUrl}
                              alt={p.caption || snap.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s ease' }}
                              onClick={() => {
                                const imgs = document.querySelectorAll('[data-testid="photo-grid-fb"] img');
                                if (imgs[idx]) (imgs[idx] as HTMLElement).click();
                                else if (imgs[0]) (imgs[0] as HTMLElement).click();
                              }}
                            />
                            {p.isCover && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 10,
                                  left: 10,
                                  background: '#C67D34',
                                  color: '#fff',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 9px',
                                  borderRadius: 6,
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                }}
                              >
                                ★ Ảnh Bìa
                              </div>
                            )}
                          </div>
                          <div style={{ padding: '10px 14px', background: '#FAF7F2', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 13, color: '#4A2E18', fontWeight: 600, lineHeight: 1.4 }}>
                              {p.caption || `Góc chụp thực tế ${idx + 1}`}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                              <span style={{ fontSize: 11, color: '#A89F91' }}>
                                #{idx + 1} • {snap.name}
                              </span>
                              <Button
                                size="small"
                                type="text"
                                style={{ color: '#6F4E37', fontWeight: 600, fontSize: 12, padding: 0 }}
                                onClick={() => {
                                  const imgs = document.querySelectorAll('[data-testid="photo-grid-fb"] img');
                                  if (imgs[idx]) (imgs[idx] as HTMLElement).click();
                                  else if (imgs[0]) (imgs[0] as HTMLElement).click();
                                }}
                              >
                                Phóng to 🔍
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'posts',
              label: `📝 Bài Viết Trải Nghiệm (${posts.length})`,
              children: (
                <div>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}
                  >
                    <div>
                      <Title level={4} style={{ margin: 0 }}>
                        Bài Viết Trải Nghiệm Từ Sinh Viên
                      </Title>
                      <Text type="secondary">Chia sẻ câu chuyện, góc học tập và kinh nghiệm tại quán.</Text>
                    </div>
                    <Button type="primary" icon={<BookOpen size="1em" />} onClick={() => (user ? setCreatePostModalOpen(true) : navigate('/login'))} data-testid="btn-write-post" style={{ background: '#6F4E37', borderColor: '#6F4E37' }}>
                      Viết Bài Trải Nghiệm
                    </Button>
                  </div>

                  {postsLoading ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <Spin />
                    </div>
                  ) : posts.length === 0 ? (
                    <Alert
                      message="Chưa có bài trải nghiệm nào về quán này. Hãy viết bài chia sẻ đầu tiên!"
                      type="info"
                      showIcon
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {posts.slice((postPage - 1) * PAGE, postPage * PAGE).map((post: any) => (
                        <PostCard
                          key={post.id}
                          author={post.author}
                          title={post.title || post.currentPublishedRevision?.title}
                          content={post.content || post.currentPublishedRevision?.content}
                          summary={post.summary}
                          photos={post.photos || []}
                          createdAt={post.createdAt}
                          slug={post.slug || post.id}
                          onDelete={(post.author?.id === user?.id || user?.role === 'ADMIN') ? () => handleDeletePost(post.id) : undefined}
                        />
                      ))}
                      {pager(posts.length, postPage, setPostPage, 'post-pagination')}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Viết Đánh Giá */}
      <WriteReviewModal
        placeId={place.placeId || place.id}
        placeName={snap.name}
        visible={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        onSuccess={() => fetchReviews(place.placeId || place.id)}
      />

      {/* Viết bài về quán (kiểu mạng xã hội, có ảnh) */}
      <PostComposerModal
        open={createPostModalOpen}
        onClose={() => setCreatePostModalOpen(false)}
        onSuccess={() => fetchPosts(place.placeId || place.id)}
        defaultPlace={{ placeId: place.placeId || place.id, name: snap.name, slug: place.slug, address: snap.address }}
      />

      {/* Modal Báo Cáo */}
      <ReportModal
        targetType={reportTarget.type}
        targetId={reportTarget.id}
        targetTitle={reportTarget.title}
        visible={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
      />

      {/* Modal Đóng Góp / Báo Sửa */}
      {user && (
        <SaveToCollectionModal
          open={saveCollectionOpen}
          placeId={place.placeId || place.id}
          placeName={snap.name}
          onClose={() => setSaveCollectionOpen(false)}
        />
      )}

      <PlaceContributionModal
        visible={contributionModalOpen}
        onClose={() => setContributionModalOpen(false)}
        defaultPlaceId={place.placeId || place.id}
      />
    </div>
  );
};

export default PlaceDetailPage;
