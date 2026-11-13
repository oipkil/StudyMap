import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Typography, Tag, Button, Space, Spin, Segmented, Empty, Grid, Popconfirm, message } from 'antd';
import { PlaceContributionModal } from '../../components/places/PlaceContributionModal';
import { StickerPackSubmitModal } from '../../components/community/StickerPackSubmitModal';
import { timeAgo } from '../../components/community/ReviewCard';
import { CirclePlus, CircleCheck, Clock, CircleX, SquarePen, Store, Pencil, Smile, FileSearch, Trash2 } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

type Kind = 'suggestion' | 'change' | 'survey' | 'sticker';

interface ActivityItem {
  kind: Kind;
  id: string;
  title: string;
  subtitle?: string | null;
  status: string;
  note?: string | null;
  createdAt: string;
  raw: any;
}

const KIND_META: Record<Kind, { label: string; icon: React.ReactNode }> = {
  suggestion: { label: 'Đề xuất quán mới', icon: <Store size="1em" /> },
  change: { label: 'Báo sửa thông tin', icon: <SquarePen size="1em" /> },
  survey: { label: 'Yêu cầu khảo sát', icon: <FileSearch size="1em" /> },
  sticker: { label: 'Bộ nhãn dán', icon: <Smile size="1em" /> },
};

const statusTag = (status: string, isDraft?: boolean) => {
  if (isDraft) return <Tag>Bản nháp</Tag>;
  switch (status) {
    case 'APPROVED':
      return (
        <Tag icon={<CircleCheck size="1em" />} color="success">
          Đã duyệt
        </Tag>
      );
    case 'REJECTED':
      return (
        <Tag icon={<CircleX size="1em" />} color="error">
          Bị từ chối
        </Tag>
      );
    case 'CHANGES_REQUESTED':
    case 'NEEDS_CHANGES':
      return (
        <Tag icon={<CircleX size="1em" />} color="warning">
          Cần chỉnh sửa
        </Tag>
      );
    default:
      return (
        <Tag icon={<Clock size="1em" />} color="gold">
          Đang chờ duyệt
        </Tag>
      );
  }
};

/**
 * "Đóng góp của tôi": một danh sách hoạt động duy nhất (đề xuất quán, báo sửa, yêu cầu khảo sát, bộ nhãn dán)
 * với bộ lọc dạng nút — không tách thành nhiều tab. Bài viết/đánh giá nằm ở tab "Bài viết" của hồ sơ.
 * embedded: nhúng vào tab của trang hồ sơ (ẩn tiêu đề trang).
 */
export const UserContributionsPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [stickerModalOpen, setStickerModalOpen] = useState(false);
  const [contributionModalOpen, setContributionModalOpen] = useState(false);
  const [selectedPlaceIdForEdit, setSelectedPlaceIdForEdit] = useState<string | undefined>(undefined);
  const [editingSuggestion, setEditingSuggestion] = useState<any | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [contribRes, packRes] = await Promise.all([axios.get('/api/v1/me/contributions'), axios.get('/api/v1/community/stickers/packs/mine').catch(() => ({ data: { data: [] } }))]);
      const c = contribRes.data?.data || {};
      const list: ActivityItem[] = [
        ...(c.suggestions || []).map((s: any) => ({
          kind: 'suggestion' as Kind,
          id: s.id,
          title: s.proposedName,
          subtitle: s.addressDescription,
          status: s.status,
          note: s.reviewerNotes,
          createdAt: s.createdAt,
          raw: s,
        })),
        ...(c.changeRequests || []).map((r: any) => ({
          kind: 'change' as Kind,
          id: r.id,
          title: r.place?.defaultName || 'Quán',
          subtitle: r.reason,
          status: r.status,
          note: r.reviewerNotes,
          createdAt: r.createdAt,
          raw: r,
        })),
        ...(c.surveyRequests || []).map((r: any) => ({
          kind: 'survey' as Kind,
          id: r.id,
          title: r.place?.defaultName || 'Khu vực mới',
          subtitle: r.reason,
          status: r.status,
          note: r.reviewerNotes,
          createdAt: r.createdAt,
          raw: r,
        })),
        ...((packRes as any).data?.data || []).map((p: any) => ({
          kind: 'sticker' as Kind,
          id: p.id,
          title: p.name,
          subtitle: `${(p.items || []).length} nhãn dán`,
          status: p.moderationStatus,
          note: p.reviewerNote,
          createdAt: p.createdAt,
          raw: p,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(list);
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu đóng góp:', err);
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.kind] = (c[it.kind] || 0) + 1;
    return c;
  }, [items]);
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);

  /** Thu hồi đóng góp chưa được duyệt (đề xuất quán, khảo sát, báo sai thông tin). */
  const withdraw = async (it: ActivityItem) => {
    const path = it.kind === 'suggestion' ? 'suggestions' : it.kind === 'survey' ? 'survey-requests' : 'change-requests';
    try {
      await axios.delete(`/api/v1/me/contributions/${path}/${it.id}`);
      message.success('Đã thu hồi đóng góp');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thu hồi được');
    }
  };

  const canWithdraw = (it: ActivityItem) => it.kind !== 'sticker' && it.status !== 'APPROVED';

  const canResubmit = (it: ActivityItem) => (it.kind === 'suggestion' || it.kind === 'change') && (it.status === 'REJECTED' || it.status === 'CHANGES_REQUESTED' || it.raw.isDraft);

  return (
    <div style={{ maxWidth: embedded ? undefined : 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {!embedded ? (
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Đóng góp của tôi
            </Title>
            <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
              Theo dõi đề xuất quán, báo sửa và bộ nhãn dán bạn đã gửi.
            </Paragraph>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 13 }}>
            Đề xuất quán, báo sửa thông tin, yêu cầu khảo sát và bộ nhãn dán bạn đã gửi.
          </Text>
        )}
        <Space wrap>
          <Button icon={<Smile size="1em" />} onClick={() => setStickerModalOpen(true)}>
            Gửi bộ nhãn dán
          </Button>
          <Button
            type="primary"
            icon={<CirclePlus size="1em" />}
            onClick={() => {
              setEditingSuggestion(null);
              setSelectedPlaceIdForEdit(undefined);
              setContributionModalOpen(true);
            }}
            data-testid="btn-suggest-place"
          >
            Đề xuất quán mới
          </Button>
        </Space>
      </div>

      <Segmented
        block={isMobile}
        size={isMobile ? 'small' : 'middle'}
        value={filter}
        onChange={(v) => setFilter(v as any)}
        style={{ marginBottom: 12, maxWidth: '100%', overflowX: 'auto' }}
        options={[
          { label: `Tất cả (${counts.all || 0})`, value: 'all' },
          { label: `Đề xuất (${counts.suggestion || 0})`, value: 'suggestion' },
          { label: `Báo sửa (${counts.change || 0})`, value: 'change' },
          { label: `Khảo sát (${counts.survey || 0})`, value: 'survey' },
          { label: `Nhãn dán (${counts.sticker || 0})`, value: 'sticker' },
        ]}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      ) : shown.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={filter === 'all' ? 'Bạn chưa gửi đóng góp nào. Phát hiện quán mới? Bấm "Đề xuất quán mới".' : 'Không có mục nào trong nhóm này'}
          style={{ padding: '32px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="contribution-list">
          {shown.map((it) => (
            <div key={`${it.kind}-${it.id}`} data-testid="contribution-item" style={{ display: 'flex', gap: 12, padding: 12, border: '1px solid #E8E6E1', borderRadius: 10, background: '#fff', alignItems: 'flex-start' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EEF4F0', color: '#2F6B4F', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{KIND_META[it.kind].icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {KIND_META[it.kind].label}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    · {timeAgo(it.createdAt)}
                  </Text>
                  {statusTag(it.status, it.raw.isDraft)}
                </div>
                <Text strong style={{ display: 'block', fontSize: 15 }}>
                  {it.title}
                </Text>
                {it.subtitle && (
                  <Text type="secondary" style={{ fontSize: 13 }} ellipsis>
                    {it.subtitle}
                  </Text>
                )}
                {it.kind === 'sticker' && (it.raw.items || []).length > 0 && (
                  <Space wrap size={4} style={{ marginTop: 6 }}>
                    {(it.raw.items || []).slice(0, 10).map((s: any) => (
                      <img key={s.id} src={s.url} alt={s.altText} title={s.altText} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: '#F7F6F3' }} />
                    ))}
                  </Space>
                )}
                {it.note && it.status !== 'APPROVED' && (
                  <div style={{ marginTop: 4 }}>
                    <Text type="danger" style={{ fontSize: 12 }}>
                      Phản hồi của ban duyệt: {it.note}
                    </Text>
                  </div>
                )}
              </div>
              {canWithdraw(it) && (
                <Popconfirm title="Thu hồi đóng góp này?" okText="Thu hồi" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => withdraw(it)}>
                  <Button size="small" danger icon={<Trash2 size="1em" />} data-testid="btn-withdraw-contribution">
                    {isMobile ? '' : 'Thu hồi'}
                  </Button>
                </Popconfirm>
              )}
              {canResubmit(it) && (
                <Button
                  size="small"
                  type="primary"
                  icon={<Pencil size="1em" />}
                  onClick={() => {
                    setEditingSuggestion(it.kind === 'suggestion' ? it.raw : null);
                    setSelectedPlaceIdForEdit(it.raw.placeId || it.raw.targetPlaceId);
                    setContributionModalOpen(true);
                  }}
                >
                  {isMobile ? 'Sửa' : 'Sửa & gửi lại'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <StickerPackSubmitModal open={stickerModalOpen} onClose={() => setStickerModalOpen(false)} onSuccess={fetchData} />

      <PlaceContributionModal
        visible={contributionModalOpen}
        editingSuggestion={editingSuggestion}
        defaultPlaceId={selectedPlaceIdForEdit}
        onClose={() => {
          setContributionModalOpen(false);
          setSelectedPlaceIdForEdit(undefined);
        }}
        onSuccess={() => {
          setContributionModalOpen(false);
          setSelectedPlaceIdForEdit(undefined);
          fetchData();
        }}
      />
    </div>
  );
};
export default UserContributionsPage;
