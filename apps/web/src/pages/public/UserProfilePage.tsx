import React, { useState, useEffect, useCallback } from 'react';
import { SafeAvatar } from '../../components/common/SafeAvatar';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Typography, Space, Tag, Tabs, Spin, Alert, Button, Empty, Grid, Image, Segmented, message } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { UserCollectionsPage } from '../me/UserCollectionsPage';
import { UserContributionsPage } from '../me/UserContributionsPage';
import { ReviewCard, PostCard, timeAgo } from '../../components/community/ReviewCard';
import { PostComposerModal } from '../../components/community/PostComposerModal';
import { EditProfileModal } from '../../components/profile/EditProfileModal';
import { CoverPhotoButton } from '../../components/profile/CoverPhotoButton';
import { Calendar, MapPin, Folder, Pencil, Star, SquarePen } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

/**
 * Hồ sơ người dùng kiểu mạng xã hội: ảnh bìa, avatar đè lên, tên + giới thiệu + số liệu, rồi 3–4 tab lớn:
 *  - Bài viết: dòng thời gian gộp đánh giá + bài viết (chính chủ thấy cả bài đang chờ duyệt, có ô "viết bài")
 *  - Ảnh: mọi ảnh trong đánh giá / bài viết
 *  - Đã lưu (chính chủ) / Bộ sưu tập (người khác)
 *  - Đóng góp (chính chủ): đề xuất quán, báo sửa, nhãn dán — một danh sách, lọc bằng nút
 */
export const UserProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: viewer, refetchUser } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<any[] | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'review' | 'post'>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isMe = Boolean(viewer && profile && viewer.id === profile.id);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/users/${id}`);
      if (res.data.success) setProfile(res.data.data);
      else setError('Không tìm thấy thông tin người dùng');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Lỗi khi tải hồ sơ');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTimeline = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/me/timeline');
      setTimeline(res.data?.data || []);
    } catch {
      setTimeline([]);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);
  useEffect(() => {
    if (isMe) fetchTimeline();
    else setTimeline(null);
  }, [isMe, fetchTimeline]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (error || !profile) {
    return (
      <div style={{ maxWidth: 700, margin: '40px auto', padding: '0 16px' }}>
        <Alert type="warning" title="Hồ sơ người dùng" description={error || 'Người dùng này chưa công khai hồ sơ hoặc không tồn tại.'} showIcon />
      </div>
    );
  }

  const roleLabel = profile.role === 'ADMIN' ? 'Quản trị viên' : 'Sinh viên';
  /** Xoá đánh giá / bài viết của chính mình ngay trên dòng thời gian. */
  const removeMine = async (kind: 'review' | 'post', id: string) => {
    try {
      await axios.delete(kind === 'review' ? `/api/v1/places/reviews/${id}` : `/api/v1/community/posts/${id}`);
      message.success(kind === 'review' ? 'Đã xoá đánh giá' : 'Đã xoá bài viết');
      fetchProfile();
      fetchTimeline();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được');
    }
  };

  // Dòng thời gian: chính chủ dùng /me/timeline (kể cả chờ duyệt); người khác dùng dữ liệu công khai
  const feed: any[] = isMe && timeline ? timeline : profile.timeline || [];
  const shownFeed = timelineFilter === 'all' ? feed : feed.filter((f) => f.kind === timelineFilter);
  const photos: any[] = isMe && timeline ? timeline.flatMap((f) => (f.photos || []).map((p: any) => ({ ...p, kind: f.kind, placeName: f.place?.name, status: f.status }))) : profile.photos || [];
  const collections: any[] = profile.collections || [];
  const stats = {
    posts: feed.filter((f) => f.kind === 'post').length,
    reviews: feed.filter((f) => f.kind === 'review').length,
    photos: photos.length,
    collections: profile.stats?.collections ?? collections.length,
  };

  const avatarSize = isMobile ? 96 : 140;
  const coverHeight = isMobile ? 120 : 200;

  const feedTab = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isMe && (
        <div style={{ background: '#fff', border: '1px solid #E8E6E1', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <SafeAvatar src={profile.avatarUrl} name={profile.displayName || profile.username} style={{ backgroundColor: '#2F6B4F', flexShrink: 0 }} />
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              data-testid="composer-trigger"
              style={{ flex: 1, textAlign: 'left', background: '#F7F6F3', border: '1px solid #E8E6E1', borderRadius: 20, padding: '10px 14px', color: '#6F6B66', cursor: 'pointer', fontSize: 15 }}
            >
              Bạn muốn chia sẻ quán nào?
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid #F1EFEA', paddingTop: 8, flexWrap: 'wrap' }}>
            <Button type="text" icon={<SquarePen size="1em" />} onClick={() => setComposerOpen(true)}>
              Viết bài về quán
            </Button>
            <Button type="text" icon={<Star size="1em" fill="currentColor" style={{ color: '#B8860B' }} />} onClick={() => navigate('/')}>
              Đánh giá một quán
            </Button>
          </div>
        </div>
      )}
      {feed.length > 0 && (
        <Segmented
          size="small"
          value={timelineFilter}
          onChange={(v) => setTimelineFilter(v as any)}
          options={[
            { label: `Tất cả (${feed.length})`, value: 'all' },
            { label: `Đánh giá (${stats.reviews})`, value: 'review' },
            { label: `Bài viết (${stats.posts})`, value: 'post' },
          ]}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
      {shownFeed.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={isMe ? 'Bạn chưa có bài nào. Hãy đánh giá hoặc viết về một quán bạn thích.' : 'Chưa có bài nào được công khai'} style={{ padding: '32px 0' }} />
      ) : (
        shownFeed.map((item) =>
          item.kind === 'review' ? (
            <ReviewCard
              key={`r-${item.id}`}
              author={{ id: profile.id, displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl }}
              rating={item.ratingOverall}
              content={item.content || item.excerpt || ''}
              photos={item.photos || []}
              visitDate={item.visitDate}
              createdAt={item.createdAt}
              helpfulCount={item.helpfulVotesCount}
              place={item.place}
              status={isMe ? item.status : undefined}
              reviewerNote={item.reviewerNote}
              onDelete={isMe ? () => removeMine('review', item.id) : undefined}
              compact
            />
          ) : (
            <PostCard
              key={`p-${item.id}`}
              author={{ id: profile.id, displayName: profile.displayName, username: profile.username, avatarUrl: profile.avatarUrl }}
              title={item.title || 'Bài viết'}
              content={item.content}
              summary={item.summary}
              photos={item.photos || []}
              createdAt={item.createdAt}
              slug={item.status && item.status !== 'APPROVED' ? undefined : item.slug}
              place={item.place}
              status={isMe ? item.status : undefined}
              reviewerNote={item.reviewerNote}
              onDelete={isMe ? () => removeMine('post', item.id) : undefined}
            />
          ),
        )
      )}
    </div>
  );

  const photosTab =
    photos.length === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={isMe ? 'Chưa có ảnh. Thêm ảnh khi viết đánh giá hoặc bài viết.' : 'Chưa có ảnh công khai'} style={{ padding: '32px 0' }} />
    ) : (
      <Image.PreviewGroup items={photos.map((p) => p.fullUrl || p.url)}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 100 : 150}px, 1fr))`, gap: 6 }} data-testid="photo-grid">
          {photos.map((p, i) => (
            <div key={`${p.assetId}-${i}`} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 8, overflow: 'hidden', background: '#EEECE7' }}>
              <Image src={p.url} preview={{ src: p.fullUrl || p.url }} alt={p.placeName || ''} width="100%" height="100%" style={{ objectFit: 'cover' }} wrapperStyle={{ width: '100%', height: '100%' }} />
              {p.placeName && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 8px 6px', background: 'linear-gradient(transparent, rgba(0,0,0,0.55))', color: '#fff', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{p.placeName}</div>}
            </div>
          ))}
        </div>
      </Image.PreviewGroup>
    );

  const publicCollectionsTab =
    collections.length === 0 ? (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có bộ sưu tập công khai" style={{ padding: '32px 0' }} />
    ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {collections.map((c) => (
          <Link key={c.id} to={`/collections/${c.id}`} style={{ display: 'block', background: '#fff', border: '1px solid #E8E6E1', borderRadius: 12, overflow: 'hidden', color: '#1F2421' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: 110, background: '#EEECE7' }}>
              {(c.previews || []).slice(0, 4).map((u: string, i: number) => (
                <img key={i} src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ))}
              {(c.previews || []).length === 0 && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6F6B66' }}>
                  <Folder size="1em" style={{ fontSize: 28 }} />
                </div>
              )}
            </div>
            <div style={{ padding: 12 }}>
              <Text strong>{c.name}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {c.itemCount} quán · {timeAgo(c.createdAt)}
                </Text>
              </div>
            </div>
          </Link>
        ))}
      </div>
    );

  const tabs = [
    { key: 'posts', label: `Bài viết${feed.length ? ` (${feed.length})` : ''}`, children: feedTab },
    { key: 'photos', label: `Ảnh${stats.photos ? ` (${stats.photos})` : ''}`, children: photosTab },
    isMe
      ? { key: 'saved', label: 'Đã lưu', children: <UserCollectionsPage embedded view="all" /> }
      : { key: 'collections', label: `Bộ sưu tập${stats.collections ? ` (${stats.collections})` : ''}`, children: publicCollectionsTab },
    ...(isMe ? [{ key: 'contributions', label: 'Đóng góp', children: <UserContributionsPage embedded /> }] : []),
  ];
  // Tương thích link cũ: ?tab=my-collections|favorites -> Đã lưu; reviews -> Bài viết
  const legacy: Record<string, string> = { 'my-collections': 'saved', favorites: 'saved', reviews: 'posts' };
  const requested = searchParams.get('tab') || '';
  const wanted = legacy[requested] || requested;
  const activeTab = tabs.some((t) => t.key === wanted) ? wanted : 'posts';

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '0 0 32px' : '16px 16px 40px' }}>
      {/* Ảnh bìa + thẻ hồ sơ */}
      <div style={{ background: '#fff', border: '1px solid #E8E6E1', borderRadius: isMobile ? 0 : 12, overflow: 'hidden' }}>
        <div style={{ height: coverHeight, background: '#2F6B4F', position: 'relative', overflow: 'hidden' }} data-testid="profile-cover">
          {profile.coverUrl ? (
            <img src={profile.coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 12px, transparent 12px 24px)' }} />
          )}
          {isMe && (
            <div style={{ position: 'absolute', right: 12, bottom: 12 }}>
              <CoverPhotoButton hasCover={Boolean(profile.coverUrl)} onSaved={fetchProfile} compact={isMobile} />
            </div>
          )}
        </div>
        <div style={{ padding: isMobile ? '0 16px 12px' : '0 24px 16px' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'center' : 'flex-end', gap: isMobile ? 8 : 20, marginTop: -avatarSize / 2 }}>
            <div style={{ borderRadius: '50%', border: '4px solid #fff', background: '#fff', flexShrink: 0 }}>
              <SafeAvatar size={avatarSize} src={profile.avatarUrl} name={profile.displayName || profile.username} style={{ backgroundColor: profile.role === 'ADMIN' ? '#B8860B' : '#2F6B4F' }} data-testid="profile-avatar" />
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: isMobile ? 'center' : 'left', paddingBottom: isMobile ? 0 : 6 }}>
              <Title level={3} style={{ margin: 0, lineHeight: 1.2 }}>
                {profile.displayName || profile.username}
              </Title>
              <Space size={6} wrap style={{ justifyContent: isMobile ? 'center' : 'flex-start' }}>
                <Text type="secondary">@{profile.username}</Text>
                <Tag color={profile.role === 'ADMIN' ? 'gold' : 'green'} style={{ margin: 0 }}>
                  {roleLabel}
                </Tag>
              </Space>
            </div>
            {isMe && (
              <Space wrap style={{ justifyContent: 'center', paddingBottom: isMobile ? 0 : 6 }}>
                <Button icon={<Pencil size="1em" />} onClick={() => setEditOpen(true)} data-testid="btn-edit-profile">
                  Chỉnh sửa hồ sơ
                </Button>
                <Button type="primary" icon={<SquarePen size="1em" />} onClick={() => setComposerOpen(true)}>
                  Viết bài
                </Button>
              </Space>
            )}
          </div>

          {isMe && (profile.avatarPending || profile.coverPending) && (
            <Tag color="gold" style={{ marginTop: 6 }} data-testid="profile-photo-pending">
              {profile.avatarPending && profile.coverPending ? 'Ảnh đại diện & ảnh bìa đang chờ duyệt' : profile.avatarPending ? 'Ảnh đại diện đang chờ duyệt' : 'Ảnh bìa đang chờ duyệt'} — người khác chưa nhìn thấy
            </Tag>
          )}
          {profile.bio && (
            <Paragraph style={{ margin: '12px 0 0', color: '#1F2421', textAlign: isMobile ? 'center' : 'left', whiteSpace: 'pre-line' }}>
              {profile.bio}
            </Paragraph>
          )}
          <Space size={16} wrap style={{ marginTop: 10, justifyContent: isMobile ? 'center' : 'flex-start', width: '100%', color: '#6F6B66', fontSize: 13 }}>
            {(profile.campus?.name || profile.campusName) && (
              <span>
                <MapPin size="1em" /> {profile.campus?.name || profile.campusName}
              </span>
            )}
            <span>
              <Calendar size="1em" /> Tham gia {new Date(profile.createdAt).toLocaleDateString('vi-VN')}
            </span>
          </Space>
          <Space size={isMobile ? 16 : 28} wrap style={{ marginTop: 12, justifyContent: isMobile ? 'center' : 'flex-start', width: '100%' }}>
            {[
              { n: stats.posts, l: 'bài viết' },
              { n: stats.reviews, l: 'đánh giá' },
              { n: stats.photos, l: 'ảnh' },
              { n: stats.collections, l: 'bộ sưu tập' },
            ].map((s) => (
              <span key={s.l}>
                <Text strong style={{ fontSize: 16 }}>
                  {s.n}
                </Text>{' '}
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {s.l}
                </Text>
              </span>
            ))}
          </Space>
        </div>
        <Tabs
          size="large"
          items={tabs.map((t) => ({ key: t.key, label: t.label }))}
          activeKey={activeTab}
          onChange={(k) => setSearchParams(k === 'posts' ? {} : { tab: k })}
          tabBarStyle={{ margin: 0, padding: isMobile ? '0 8px' : '0 16px' }}
          data-testid="profile-tabs"
        />
      </div>

      <div style={{ marginTop: 16, padding: isMobile ? '0 12px' : 0 }}>{tabs.find((t) => t.key === activeTab)?.children}</div>

      {isMe && (
        <>
          <PostComposerModal
            open={composerOpen}
            onClose={() => setComposerOpen(false)}
            onSuccess={() => {
              fetchTimeline();
              fetchProfile();
            }}
          />
          <EditProfileModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              fetchProfile();
              refetchUser();
            }}
          />
        </>
      )}
    </div>
  );
};

export default UserProfilePage;
