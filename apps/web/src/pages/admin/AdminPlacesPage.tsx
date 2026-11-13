import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Table, Typography, Button, Tag, Space, Modal, message, Card, Popconfirm, Badge, Alert, Input } from 'antd';
import { PublicationStatus, OperationalStatus, ModerationStatus } from '@ssg/shared';
import { PlaceEditorDrawer } from '../../components/admin/PlaceEditorDrawer';
import { CircleCheck, CircleX, Eye, Plus, Pencil, TriangleAlert, EyeOff, Trash2, Copy } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

interface PlaceItem {
  id: string;
  slug: string;
  defaultName: string;
  category: { id: string; name: string };
  operationalStatus: OperationalStatus;
  publicationStatus: PublicationStatus;
  currentPublishedRevision?: { id: string; revisionNumber: number; approvedAt: string; snapshotData?: any };
  _count: { revisions: number };
  updatedAt: string;
}

interface PlaceRevisionItem {
  id: string;
  revisionNumber: number;
  baseRevisionId?: string;
  moderationStatus: ModerationStatus;
  snapshotData: any;
  reviewerNote?: string;
  approvedAt?: string;
  createdAt: string;
}

export const AdminPlacesPage: React.FC = () => {
  const [places, setPlaces] = useState<PlaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceItem | null>(null);
  const [revisions, setRevisions] = useState<PlaceRevisionItem[]>([]);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [reviewerNote, setReviewerNote] = useState('');

  // Drawer thêm / sửa quán
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // Ẩn / xoá quán và rà quán trùng
  const [deleteTarget, setDeleteTarget] = useState<PlaceItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupGroups, setDupGroups] = useState<Array<{ label: string; reason: string; places: Array<{ id: string; slug: string; name: string; address: string | null; isPublic: boolean; reviewCount: number; createdAt: string }> }>>([]);
  const [drawerPlace, setDrawerPlace] = useState<any | null>(null);

  // Modal cảnh báo xung đột 3-way
  const [conflictData, setConflictData] = useState<{ revisionId: string; message: string } | null>(null);

  const fetchPlaces = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/places', { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setPlaces(json.data);
      }
    } catch {
      message.error('Không thể tải danh sách địa điểm');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaces();
  }, []);

  const openRevisionHistory = async (place: PlaceItem) => {
    setSelectedPlace(place);
    setIsRevisionModalOpen(true);
    try {
      const res = await fetch(`/api/v1/admin/places/${place.id}/revisions`, { credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        setRevisions(json.data);
      }
    } catch {
      message.error('Không thể tải lịch sử phiên bản');
    }
  };

  const handleModerate = async (
    revisionId: string,
    action: 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED',
    forceOverride = false,
  ) => {
    if (!selectedPlace) return;
    try {
      const res = await fetch(`/api/v1/admin/places/${selectedPlace.id}/revisions/${revisionId}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] ?? '',
        },
        credentials: 'include',
        body: JSON.stringify({ action, reviewerNote, forceOverride }),
      });
      const json = await res.json();

      if (res.status === 409) {
        // PHÁT HIỆN XUNG ĐỘT PHIÊN BẢN: Bật Modal cảnh báo chặn ghi đè
        setConflictData({
          revisionId,
          message: json.message || 'Xung đột phiên bản: Địa điểm đã có phiên bản khác được duyệt sau bản này!',
        });
        return;
      }

      if (json.success) {
        message.success(json.data?.message || 'Đã cập nhật trạng thái kiểm duyệt');
        setReviewerNote('');
        setConflictData(null);
        openRevisionHistory(selectedPlace);
        fetchPlaces();
      } else {
        message.error(json.message || 'Lỗi khi kiểm duyệt');
      }
    } catch {
      message.error('Lỗi kết nối máy chủ');
    }
  };

  const columns = [
    {
      title: 'Tên địa điểm',
      dataIndex: 'defaultName',
      key: 'defaultName',
      render: (name: string, record: PlaceItem) => (
        <div>
          <Text strong>{name}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              /{record.slug}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Danh mục',
      dataIndex: ['category', 'name'],
      key: 'category',
      render: (name: string) => <Tag color="green">{name}</Tag>,
    },
    {
      title: 'Trạng thái hoạt động',
      dataIndex: 'operationalStatus',
      key: 'operationalStatus',
      render: (status: OperationalStatus) => {
        return <Badge status={status === OperationalStatus.OPERATING ? 'success' : 'warning'} text={status} />;
      },
    },
    {
      title: 'Trạng thái xuất bản',
      dataIndex: 'publicationStatus',
      key: 'publicationStatus',
      render: (status: PublicationStatus) => {
        // Nhãn tiếng Việt để nhìn phát biết quán đang hiện hay đang bị ẩn
        const META: Record<string, { color: string; label: string }> = {
          PUBLISHED: { color: 'success', label: 'Đang hiện' },
          PENDING: { color: 'processing', label: 'Chờ duyệt' },
          DRAFT: { color: 'default', label: 'Nháp' },
          CHANGES_REQUESTED: { color: 'warning', label: 'Cần sửa' },
          REJECTED: { color: 'error', label: 'Bị từ chối' },
          HIDDEN: { color: 'warning', label: 'Đang ẩn' },
          REVOKED: { color: 'error', label: 'Đã thu hồi' },
        };
        const m = META[status] || { color: 'default', label: status };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: 'Phiên bản xuất bản',
      key: 'publishedRev',
      render: (_: any, record: PlaceItem) => (
        <Tag color="default">
          {record.currentPublishedRevision ? `v${record.currentPublishedRevision.revisionNumber}` : 'Chưa xuất bản'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, record: PlaceItem) => (
        <Space>
          <Button
            size="small"
            icon={<Pencil size="1em" />}
            onClick={() => {
              setDrawerPlace(record);
              setIsDrawerOpen(true);
            }}
          >
            Sửa (Tạo Rev)
          </Button>
          <Button size="small" icon={<Eye size="1em" />} onClick={() => openRevisionHistory(record)}>
            Lịch sử ({record._count.revisions})
          </Button>
          <Popconfirm
            title={record.publicationStatus === 'HIDDEN' ? 'Hiện lại quán này trên trang công khai?' : 'Ẩn quán khỏi trang công khai?'}
            description={record.publicationStatus === 'HIDDEN' ? 'Quán sẽ xuất hiện lại trong tìm kiếm, bản đồ và danh sách.' : 'Quán biến mất khỏi tìm kiếm / bản đồ nhưng dữ liệu vẫn được giữ, hiện lại lúc nào cũng được.'}
            okText={record.publicationStatus === 'HIDDEN' ? 'Hiện lại' : 'Ẩn quán'}
            cancelText="Huỷ"
            onConfirm={() => toggleVisibility(record)}
          >
            <Button size="small" icon={record.publicationStatus === 'HIDDEN' ? <Eye size="1em" /> : <EyeOff size="1em" />} data-testid="btn-toggle-place-visibility">
              {record.publicationStatus === 'HIDDEN' ? 'Hiện lại' : 'Ẩn'}
            </Button>
          </Popconfirm>
          <Button size="small" danger icon={<Trash2 size="1em" />} onClick={() => setDeleteTarget(record)} data-testid="btn-delete-place">
            Xoá
          </Button>
        </Space>
      ),
    },
  ];

  /** Ẩn hoặc hiện lại quán (ẩn = gỡ khỏi bản chiếu công khai, dữ liệu vẫn còn). */
  const toggleVisibility = async (record: PlaceItem) => {
    const hidden = record.publicationStatus !== 'HIDDEN';
    try {
      const res = await axios.post(`/api/v1/admin/places/${record.id}/visibility`, { hidden });
      message.success(res.data?.message || 'Đã cập nhật hiển thị');
      fetchPlaces();
      if (dupOpen) loadDuplicates();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không đổi được trạng thái hiển thị');
    }
  };

  /** Xoá hẳn quán — phải gõ đúng đường dẫn (slug) để xác nhận. */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim() !== deleteTarget.slug) {
      message.warning('Gõ đúng đường dẫn của quán để xác nhận');
      return;
    }
    setDeleting(true);
    try {
      const res = await axios.delete(`/api/v1/admin/places/${deleteTarget.id}?confirm=${encodeURIComponent(deleteTarget.slug)}`);
      message.success(res.data?.message || 'Đã xoá quán');
      setDeleteTarget(null);
      setDeleteConfirmText('');
      fetchPlaces();
      if (dupOpen) loadDuplicates();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được quán');
    } finally {
      setDeleting(false);
    }
  };

  /** Danh sách các nhóm quán nghi trùng (trùng tên sau khi bỏ dấu hoặc cách nhau dưới 60 m). */
  const loadDuplicates = async () => {
    setDupLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/places/duplicates');
      setDupGroups(res.data?.data?.groups || []);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không tải được danh sách quán trùng');
    } finally {
      setDupLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Quản lý địa điểm & phiên bản
          </Title>
          <Text type="secondary">
            Kiểm duyệt quy trình xuất bản snapshot hồ sơ quán, phòng chống ghi đè xung đột (3-way merge conflict guard).
          </Text>
        </div>
        <Space wrap>
          <Button
            icon={<Copy size="1em" />}
            onClick={() => {
              setDupOpen(true);
              loadDuplicates();
            }}
            data-testid="btn-find-duplicates"
          >
            Tìm quán trùng
          </Button>
          <Button
            type="primary"
            icon={<Plus size="1em" />}
            onClick={() => {
              setDrawerPlace(null);
              setIsDrawerOpen(true);
            }}
          >
            Thêm Quán Mới
          </Button>
        </Space>
      </div>

      <Table dataSource={places} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 15 }} scroll={{ x: 'max-content' }} />

      {/* Xoá quán: phải gõ đúng đường dẫn để xác nhận */}
      <Modal
        open={Boolean(deleteTarget)}
        title={`Xoá quán "${deleteTarget?.defaultName ?? ''}"`}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteConfirmText('');
        }}
        onOk={confirmDelete}
        okText="Xoá vĩnh viễn"
        cancelText="Huỷ"
        okButtonProps={{ danger: true, loading: deleting, disabled: deleteConfirmText.trim() !== deleteTarget?.slug }}
        destroyOnHidden
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title="Xoá là không khôi phục được"
          description="Toàn bộ phiên bản, đánh giá, lượt lưu của quán sẽ bị xoá theo. Nếu chỉ muốn quán biến mất khỏi trang công khai, hãy dùng nút Ẩn."
        />
        <Text>
          Gõ đường dẫn của quán để xác nhận: <Text code>{deleteTarget?.slug}</Text>
        </Text>
        <Input
          style={{ marginTop: 8 }}
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder={deleteTarget?.slug}
          data-testid="input-confirm-delete-place"
        />
      </Modal>

      {/* Quán trùng: gom nhóm theo tên hoặc vị trí để ẩn/xoá bản thừa */}
      <Modal
        open={dupOpen}
        title="Quán nghi bị trùng"
        onCancel={() => setDupOpen(false)}
        footer={[
          <Button key="reload" onClick={loadDuplicates} loading={dupLoading}>
            Quét lại
          </Button>,
          <Button key="close" type="primary" onClick={() => setDupOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={860}
        destroyOnHidden
      >
        {dupLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>Đang quét…</div>
        ) : dupGroups.length === 0 ? (
          <Alert type="success" showIcon title="Không thấy quán nào bị trùng" description="Không có quán trùng tên (sau khi bỏ dấu) hay nằm cách nhau dưới 60 m." />
        ) : (
          <div data-testid="duplicate-groups">
            {dupGroups.map((g, gi) => (
              <Card key={gi} size="small" title={g.label} style={{ marginBottom: 12 }}>
                {g.places.map((pl) => (
                  <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #F1EFEA', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <Text strong>{pl.name}</Text>{' '}
                      <Tag color={pl.isPublic ? 'green' : 'default'}>{pl.isPublic ? 'Đang hiện' : 'Đang ẩn'}</Tag>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          /{pl.slug} · {pl.address || 'chưa có địa chỉ'} · {pl.reviewCount} đánh giá · tạo {new Date(pl.createdAt).toLocaleDateString('vi-VN')}
                        </Text>
                      </div>
                    </div>
                    <Space>
                      <Popconfirm
                        title={pl.isPublic ? 'Ẩn quán này?' : 'Hiện lại quán này?'}
                        okText={pl.isPublic ? 'Ẩn' : 'Hiện lại'}
                        cancelText="Huỷ"
                        onConfirm={() => toggleVisibility({ id: pl.id, slug: pl.slug, defaultName: pl.name, publicationStatus: pl.isPublic ? 'PUBLISHED' : 'HIDDEN' } as PlaceItem)}
                      >
                        <Button size="small" icon={pl.isPublic ? <EyeOff size="1em" /> : <Eye size="1em" />}>
                          {pl.isPublic ? 'Ẩn' : 'Hiện lại'}
                        </Button>
                      </Popconfirm>
                      <Button
                        size="small"
                        danger
                        icon={<Trash2 size="1em" />}
                        onClick={() => {
                          setDupOpen(false);
                          setDeleteTarget({ id: pl.id, slug: pl.slug, defaultName: pl.name } as PlaceItem);
                        }}
                      >
                        Xoá
                      </Button>
                    </Space>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}
      </Modal>

      {/* Drawer Form Thêm / Sửa Quán (Bao gồm Menu, Giờ mở cửa, Dynamic Repeater Fields) */}
      <PlaceEditorDrawer
        open={isDrawerOpen}
        place={drawerPlace}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={() => fetchPlaces()}
      />

      {/* Modal Lịch sử phiên bản & Kiểm duyệt */}
      <Modal
        title={`Lịch sử phiên bản: ${selectedPlace?.defaultName}`}
        open={isRevisionModalOpen}
        onCancel={() => setIsRevisionModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsRevisionModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={850}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          {revisions.map((rev) => {
            const isPublished = selectedPlace?.currentPublishedRevision?.id === rev.id;
            const snap = rev.snapshotData || {};
            const repeaterFields = snap.dynamicFieldValues?.filter((d: any) => d.dataType === 'REPEATER') || [];

            return (
              <Card
                key={rev.id}
                size="small"
                style={{
                  marginBottom: 12,
                  borderColor: isPublished
                    ? '#52c41a'
                    : rev.moderationStatus === ModerationStatus.PENDING
                      ? '#2F6B4F'
                      : '#d9d9d9',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <Space>
                      <Tag color={isPublished ? 'green' : 'default'}>
                        Phiên bản #{rev.revisionNumber} {isPublished && '★ Đang hiển thị công khai'}
                      </Tag>
                      <Tag
                        color={
                          rev.moderationStatus === ModerationStatus.APPROVED
                            ? 'success'
                            : rev.moderationStatus === ModerationStatus.PENDING
                              ? 'warning'
                              : 'error'
                        }
                      >
                        {rev.moderationStatus}
                      </Tag>
                      {rev.baseRevisionId && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Base Rev: {rev.baseRevisionId.slice(0, 8)}...
                        </Text>
                      )}
                    </Space>

                    <Paragraph style={{ margin: '8px 0 4px 0' }}>
                      <Text strong>Tên quán: </Text> {snap.name}
                    </Paragraph>

                    <div style={{ fontSize: 13, color: '#555' }}>
                      <span>
                        {' '}
                        Giờ mở cửa:{' '}
                        {snap.weeklySchedule?.[0]?.is24h
                          ? '24/24'
                          : `${snap.weeklySchedule?.[0]?.shifts?.[0]?.openTime || '07:00'} - ${snap.weeklySchedule?.[0]?.shifts?.[0]?.closeTime || '22:00'}`}
                      </span>
                      <span style={{ marginLeft: 16 }}>
                        ☕ Thực đơn: {snap.menuGroups?.[0]?.items?.length || 0} món
                      </span>
                      {repeaterFields.length > 0 && (
                        <span style={{ marginLeft: 16 }}>
                          Phòng học nhóm (Repeater): {repeaterFields[0].value?.length || 0} phòng
                        </span>
                      )}
                    </div>

                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Tạo lúc: {new Date(rev.createdAt).toLocaleString('vi-VN')}
                    </Text>
                    {rev.reviewerNote && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary" italic>
                          Ghi chú: {rev.reviewerNote}
                        </Text>
                      </div>
                    )}
                  </div>

                  {rev.moderationStatus === ModerationStatus.PENDING && (
                    <Space>
                      <Popconfirm
                        title="Xác nhận phê duyệt phiên bản này?"
                        description="Hồ sơ quán công khai sẽ lập tức phản ánh dữ liệu mới nhất."
                        onConfirm={() => handleModerate(rev.id, 'APPROVE')}
                        okText="Phê duyệt"
                        cancelText="Hủy"
                      >
                        <Button type="primary" size="small" icon={<CircleCheck size="1em" />}>
                          Duyệt & Xuất Bản
                        </Button>
                      </Popconfirm>
                      <Popconfirm
                        title="Từ chối phiên bản này?"
                        onConfirm={() => handleModerate(rev.id, 'REJECT')}
                        okText="Từ chối"
                        cancelText="Hủy"
                      >
                        <Button danger size="small" icon={<CircleX size="1em" />}>
                          Từ Chối
                        </Button>
                      </Popconfirm>
                    </Space>
                  )}
                </div>
              </Card>
            );
          })}
        </Space>
      </Modal>

      {/* Modal Cảnh Báo Xung Đột 3-Way Merge & Chặn Ghi Đè */}
      <Modal
        title={
          <Space>
            <TriangleAlert size="1em" style={{ color: '#faad14' }} />
            <span>Phát Hiện Xung Đột Phiên Bản (3-Way Conflict)</span>
          </Space>
        }
        open={Boolean(conflictData)}
        onCancel={() => setConflictData(null)}
        footer={[
          <Button key="cancel" onClick={() => setConflictData(null)}>
            Hủy Bỏ & Đối Chiếu Lại
          </Button>,
          <Popconfirm
            key="force"
            title="CẢNH BÁO: Ghi đè có kiểm soát?"
            description="Thao tác này sẽ ép xuất bản phiên bản này và thay thế phiên bản công khai hiện hành!"
            onConfirm={() => {
              if (conflictData) {
                handleModerate(conflictData.revisionId, 'APPROVE', true);
              }
            }}
            okText="Xác nhận ghi đè"
            cancelText="Hủy"
          >
            <Button type="primary" danger>
              Ghi Đè Có Kiểm Soát (Force Override)
            </Button>
          </Popconfirm>,
        ]}
      >
        <Alert
          type="error"
          showIcon
          title="Hệ thống đã ngăn chặn hành vi ghi đè dữ liệu tự động!"
          description={conflictData?.message}
          style={{ marginBottom: 16 }}
        />
        <Paragraph>
          Kể từ khi biên tập viên bắt đầu chỉnh sửa bản thảo này dựa trên phiên bản gốc, một phiên bản khác đã được
          duyệt và đang xuất bản công khai.
        </Paragraph>
        <Paragraph type="secondary">
          Bạn có thể hủy bỏ để mở lại bản thảo và đối chiếu khác biệt, hoặc sử dụng quyền Quản trị viên để{' '}
          <strong>Ghi đè có kiểm soát (Force Override)</strong> nếu đã thống nhất các thay đổi.
        </Paragraph>
      </Modal>
    </div>
  );
};

export default AdminPlacesPage;
