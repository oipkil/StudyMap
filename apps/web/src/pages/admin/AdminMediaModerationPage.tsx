import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Card, Row, Col, Tag, Button, Space, Modal, Input, Form, message, Spin, Empty, Tooltip, Alert, Segmented, Grid, Pagination, Popconfirm } from 'antd';
import { PhotoUploadModal } from '../../components/media/PhotoUploadModal';
import { ImageCropModal } from '../../components/media/ImageCropModal';
import { FrameScrubberModal } from '../../components/media/FrameScrubberModal';
import { CircleCheck, CircleX, Ban, CirclePlay, CirclePause, Scissors, Upload, RefreshCw, FileSearch, Trash2 } from 'lucide-react';

const { Title, Text } = Typography;

export const AdminMediaModerationPage: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.md;
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  // Nguồn ảnh: ảnh nội dung (mặc định) / ảnh của bộ nhãn dán (duyệt ở trang Bộ nhãn dán) / tất cả
  const [sourceFilter, setSourceFilter] = useState<string>('content');
  // Phân trang phía server (API /media/admin/list trả total/page/limit)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);

  // Modal states
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedAssetForCrop, setSelectedAssetForCrop] = useState<any | null>(null);
  const [frameModalOpen, setFrameModalOpen] = useState(false);
  const [selectedAssetForFrames, setSelectedAssetForFrames] = useState<any | null>(null);

  // Moderation action modal
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | 'REVOKE'>('APPROVE');
  const [targetAsset, setTargetAsset] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [actionLoading, setActionLoading] = useState(false);

  // Playing animations map: assetId -> boolean
  const [playingAnimations, setPlayingAnimations] = useState<Record<string, boolean>>({});

  /** Duyệt nhanh toàn bộ ảnh đang hiển thị (hàng đợi ảnh đại diện / ảnh bìa thường rất nhiều). */
  const approveAllShown = async () => {
    const ids = assets.filter((a) => a.moderationStatus === 'PENDING').map((a) => a.id);
    if (ids.length === 0) {
      message.info('Không có ảnh chờ duyệt trong trang này');
      return;
    }
    try {
      const res = await fetch('/api/v1/media/admin/moderate-bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] || '' },
        body: JSON.stringify({ assetIds: ids, action: 'APPROVE' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Không duyệt được');
      message.success(`Đã duyệt ${ids.length} ảnh`);
      fetchAssets();
    } catch (err: any) {
      message.error(err.message || 'Không duyệt được');
    }
  };

  /** Xoá hẳn ảnh (kể cả file trên ổ đĩa) — admin xoá được mọi ảnh. */
  const handleDeleteAsset = async (assetId: string) => {
    try {
      const res = await fetch(`/api/v1/media/${assetId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] || '' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Không xoá được ảnh');
      message.success('Đã xoá ảnh');
      fetchAssets();
    } catch (err: any) {
      message.error(err.message || 'Không xoá được ảnh');
    }
  };

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/v1/media/admin/list?page=${page}&limit=${pageSize}&source=${sourceFilter}`;
      if (statusFilter !== 'ALL') {
        url += `&status=${statusFilter}`;
      }

      const res = await fetch(url, { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.data) {
        setAssets(data.data.assets || []);
        setTotal(Number(data.data.total || 0));
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách ảnh:', err);
      message.error('Không thể kết nối đến máy chủ kiểm duyệt');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, pageSize, sourceFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Đổi bộ lọc -> quay về trang 1
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const toggleAnimation = (assetId: string) => {
    setPlayingAnimations((prev) => ({
      ...prev,
      [assetId]: !prev[assetId],
    }));
  };

  const handleOpenAction = (asset: any, type: 'APPROVE' | 'REJECT' | 'REVOKE') => {
    setTargetAsset(asset);
    setActionType(type);
    form.resetFields();
    setActionModalVisible(true);
  };

  const handleActionSubmit = async (values: { reviewerNote: string }) => {
    if (!targetAsset) return;
    setActionLoading(true);

    try {
      const match = document.cookie.match(/ssg_csrf=([^;]+)/);
      const csrfToken = match ? match[1] : '';

      const res = await fetch(`/api/v1/media/admin/${targetAsset.id}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({
          action: actionType,
          reviewerNote: values.reviewerNote,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi kiểm duyệt ảnh');
      }

      message.success(data.message || 'Đã cập nhật trạng thái kiểm duyệt!');
      setActionModalVisible(false);
      fetchAssets();
    } catch (err: any) {
      message.error(err.message || 'Không thể thực hiện kiểm duyệt');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Tag color="success">ĐÃ DUYỆT</Tag>;
      case 'REJECTED':
        return <Tag color="error">BỊ TỪ CHỐI</Tag>;
      case 'REVOKED':
        return <Tag color="default" style={{ background: '#000', color: '#fff', borderColor: '#333' }}>ĐÃ THU HỒI</Tag>;
      default:
        return <Tag color="warning">CHỜ DUYỆT</Tag>;
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Thư viện ảnh & kiểm duyệt media
          </Title>
          <Text type="secondary">
            Kiểm soát ảnh cách ly, bảo toàn hoạt ảnh Sharp, cắt ảnh bất biến và thực thi thu hồi tài nguyên (Revocation).
          </Text>
        </div>
        <Space>
          <Button icon={<RefreshCw size="1em" />} onClick={fetchAssets} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<Upload size="1em" />}
            onClick={() => setUploadModalOpen(true)}
            style={{ background: '#2F6B4F' }}
          >
            Tải Ảnh Lên Kho
          </Button>
          <Popconfirm title="Duyệt toàn bộ ảnh đang chờ trong trang này?" okText="Duyệt hết" cancelText="Huỷ" onConfirm={approveAllShown}>
            <Button icon={<CircleCheck size="1em" />} data-testid="btn-approve-all-media">
              Duyệt hết trang này
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* Thông báo minh bạch quy trình duyệt */}
      <Alert
        title="Duyệt thủ công: xem ảnh (và từng khung hình với ảnh động) trước khi phê duyệt. Chưa có sàng lọc AI tự động."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* Filter Tabs */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as any)}
          block={isNarrow}
          size={isNarrow ? 'small' : 'middle'}
          options={[
            { value: 'ALL', label: `Tất cả (${total})` },
            { value: 'PENDING', label: 'Chờ duyệt' },
            { value: 'APPROVED', label: 'Đã duyệt' },
            { value: 'REJECTED', label: 'Từ chối' },
            { value: 'REVOKED', label: 'Thu hồi' },
          ]}
        />
        <Segmented
          style={{ marginTop: 8 }}
          value={sourceFilter}
          onChange={(v) => {
            setSourceFilter(v as string);
            setPage(1);
          }}
          block={isNarrow}
          size={isNarrow ? 'small' : 'middle'}
          data-testid="media-source-filter"
          options={[
            { value: 'content', label: 'Ảnh nội dung' },
            { value: 'sticker', label: 'Ảnh nhãn dán' },
            { value: 'all', label: 'Tất cả nguồn' },
          ]}
        />
        {sourceFilter === 'content' && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
            Ảnh của bộ nhãn dán / emoji / GIF được duyệt ở trang “Bộ nhãn dán” — duyệt bộ là ảnh tự công khai, không phải duyệt lại ở đây.
          </Text>
        )}
      </div>

      {/* Assets Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">Đang tải danh sách tài nguyên...</Text>
          </div>
        </div>
      ) : assets.length === 0 ? (
        <Empty description="Không có ảnh nào trong bộ lọc hiện tại" />
      ) : (
        <Row gutter={[20, 20]}>
          {assets.map((asset) => {
            const isPlaying = playingAnimations[asset.id];
            const imageUrl = isPlaying || !asset.isAnimated
              ? `/api/v1/media/${asset.id}?variant=optimized&preview=true`
              : `/api/v1/media/${asset.id}?variant=poster&preview=true`;

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={asset.id}>
                <Card
                  hoverable
                  cover={
                    <div
                      style={{
                        position: 'relative',
                        height: 200,
                        background: '#141414',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={asset.originalName}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={(e: any) => {
                          // Fallback nếu ảnh bị thu hồi hoặc lỗi tải
                          e.target.src = '/api/v1/media/' + asset.id + '?variant=thumb&preview=true';
                        }}
                      />

                      {/* Animated Badge & Play/Pause toggle */}
                      {asset.isAnimated && (
                        <div style={{ position: 'absolute', bottom: 8, right: 8 }}>
                          <Button
                            size="small"
                            type="primary"
                            shape="round"
                            icon={isPlaying ? <CirclePause size="1em" /> : <CirclePlay size="1em" />}
                            onClick={() => toggleAnimation(asset.id)}
                            style={{
                              background: 'rgba(0, 0, 0, 0.65)',
                              borderColor: 'rgba(255, 255, 255, 0.4)',
                            }}
                          >
                            {isPlaying ? 'Dừng' : `${asset.frameCount} frames`}
                          </Button>
                        </div>
                      )}

                      {/* Status Tag Overlay */}
                      <div style={{ position: 'absolute', top: 8, left: 8 }}>
                        {getStatusBadge(asset.moderationStatus)}
                      </div>
                    </div>
                  }
                  actions={[
                    asset.isAnimated ? (
                      <Tooltip title="Soi từng khung hình (Frames)" key="frames">
                        <Button
                          type="text"
                          icon={<FileSearch size="1em" style={{ color: '#2F6B4F' }} />}
                          onClick={() => {
                            setSelectedAssetForFrames(asset);
                            setFrameModalOpen(true);
                          }}
                        />
                      </Tooltip>
                    ) : null,
                    <Tooltip title="Cắt ảnh & sinh Revision mới" key="crop">
                      <Button
                        type="text"
                        icon={<Scissors size="1em" style={{ color: '#fa8c16' }} />}
                        onClick={() => {
                          setSelectedAssetForCrop(asset);
                          setCropModalOpen(true);
                        }}
                      />
                    </Tooltip>,
                    asset.moderationStatus !== 'APPROVED' ? (
                      <Tooltip title="Phê duyệt công khai" key="approve">
                        <Button
                          type="text"
                          icon={<CircleCheck size="1em" style={{ color: '#52c41a' }} />}
                          onClick={() => handleOpenAction(asset, 'APPROVE')}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title="Thu hồi quyền truy cập (Revoke)" key="revoke">
                        <Button
                          type="text"
                          icon={<Ban size="1em" style={{ color: '#ff4d4f' }} />}
                          onClick={() => handleOpenAction(asset, 'REVOKE')}
                        />
                      </Tooltip>
                    ),
                    asset.moderationStatus !== 'REJECTED' && asset.moderationStatus !== 'REVOKED' ? (
                      <Tooltip title="Từ chối ảnh" key="reject">
                        <Button
                          type="text"
                          icon={<CircleX size="1em" style={{ color: '#d4380d' }} />}
                          onClick={() => handleOpenAction(asset, 'REJECT')}
                        />
                      </Tooltip>
                    ) : null,
                    <Popconfirm
                      key="delete"
                      title="Xoá hẳn ảnh này?"
                      description="Xoá cả file trên ổ đĩa, không khôi phục được."
                      okText="Xoá"
                      cancelText="Huỷ"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleDeleteAsset(asset.id)}
                    >
                      <Tooltip title="Xoá ảnh khỏi kho">
                        <Button type="text" icon={<Trash2 size="1em" style={{ color: '#ff4d4f' }} />} data-testid="btn-delete-asset" />
                      </Tooltip>
                    </Popconfirm>,
                  ].filter(Boolean)}
                >
                  <Card.Meta
                    title={
                      <Tooltip title={asset.originalName}>
                        <Text strong ellipsis style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {asset.originalName}
                        </Text>
                      </Tooltip>
                    }
                    description={
                      <Space orientation="vertical" size={2} style={{ width: '100%', marginTop: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <Text type="secondary">{asset.mimeType}</Text>
                          <Text type="secondary">{(asset.byteSize / 1024).toFixed(1)} KB</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                          <Text type="secondary">
                            {asset.width}x{asset.height} px
                          </Text>
                          <Text type="secondary">
                            Phiên bản: {asset.revisions?.length || 1}
                          </Text>
                        </div>
                        {asset.usages && asset.usages.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <Tag color="green" style={{ fontSize: 11 }}>
                              Được dùng ở {asset.usages.length} hồ sơ quán
                            </Tag>
                          </div>
                        )}
                      </Space>
                    }
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[12, 24, 48]}
            showTotal={(t, range) => `${range[0]}–${range[1]} / ${t} ảnh`}
            onChange={(pg, ps) => {
              setPage(ps !== pageSize ? 1 : pg);
              setPageSize(ps);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            data-testid="media-pagination"
          />
        </div>
      )}

      {/* Moderation Modal (Approve, Reject, Revoke) */}
      <Modal
        title={
          <Space>
            {actionType === 'APPROVE' && <CircleCheck size="1em" style={{ color: '#52c41a' }} />}
            {actionType === 'REJECT' && <CircleX size="1em" style={{ color: '#faad14' }} />}
            {actionType === 'REVOKE' && <Ban size="1em" style={{ color: '#ff4d4f' }} />}
            <span>
              {actionType === 'APPROVE' && 'Phê Duyệt Tài Nguyên Đa Phương Tiện'}
              {actionType === 'REJECT' && 'Từ Chối Tài Nguyên Đa Phương Tiện'}
              {actionType === 'REVOKE' && 'Thu Hồi Tài Nguyên Đa Phương Tiện (Revocation)'}
            </span>
          </Space>
        }
        open={actionModalVisible}
        onCancel={() => setActionModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setActionModalVisible(false)}>
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            danger={actionType === 'REVOKE' || actionType === 'REJECT'}
            loading={actionLoading}
            onClick={() => form.submit()}
          >
            {actionType === 'APPROVE' && 'Xác Nhận Duyệt'}
            {actionType === 'REJECT' && 'Xác Nhận Từ Chối'}
            {actionType === 'REVOKE' && 'Xác Nhận Thu Hồi Ngay'}
          </Button>,
        ]}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleActionSubmit}>
          {actionType === 'REVOKE' && (
            <Alert
              title="Cơ chế Thu Hồi Tài Nguyên Nghiêm Ngặt"
              description="Sau khi giao dịch thu hồi được ghi nhận trong cơ sở dữ liệu, Media Gateway sẽ lập tức chặn và trả về HTTP 403 Forbidden cho toàn bộ các lượt truy cập mới đối với ảnh này và mọi phiên bản liên quan."
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {actionType === 'APPROVE' && (
            <Alert
              title="Nguyên tắc truy cập công khai"
              description="Sau khi được duyệt, ảnh vẫn chỉ hiển thị công khai tới người dùng khác khi bài viết hoặc hồ sơ quán chứa ảnh đã được xuất bản (isPublished = true)."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item
            name="reviewerNote"
            label={actionType === 'APPROVE' ? 'Ghi chú (không bắt buộc)' : 'Lý do / Ghi chú kiểm duyệt'}
            rules={actionType === 'APPROVE' ? [] : [{ required: true, message: 'Vui lòng nhập lý do khi từ chối / thu hồi' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder={
                actionType === 'REVOKE'
                  ? 'Ví dụ: Phát hiện vi phạm bản quyền hoặc ảnh không phù hợp thuần phong mỹ tục'
                  : 'Ghi chú cho người dùng...'
              }
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Upload Modal */}
      <PhotoUploadModal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onDone={() => fetchAssets()} />

      {/* Crop Modal */}
      <ImageCropModal
        visible={cropModalOpen}
        asset={selectedAssetForCrop}
        onClose={() => {
          setCropModalOpen(false);
          setSelectedAssetForCrop(null);
        }}
        onSuccess={() => fetchAssets()}
      />

      {/* Frame Scrubber Modal (Contact sheet & frame-by-frame) */}
      <FrameScrubberModal
        visible={frameModalOpen}
        asset={selectedAssetForFrames}
        onClose={() => {
          setFrameModalOpen(false);
          setSelectedAssetForFrames(null);
        }}
      />
    </div>
  );
};
export default AdminMediaModerationPage;
