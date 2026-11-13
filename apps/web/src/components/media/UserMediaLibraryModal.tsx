import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Typography, Space, Row, Col, Card, Tag, Pagination, Spin, Empty, Segmented, Popconfirm, message } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { Image, CircleCheck, Upload, Trash2 } from 'lucide-react';

const { Text } = Typography;

interface UserMediaLibraryModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectAsset: (asset: any) => void;
  onOpenUpload: () => void;
}

const STATUS_LABEL: Record<string, { color: string; text: string }> = {
  APPROVED: { color: 'green', text: 'Đã duyệt' },
  PENDING: { color: 'gold', text: 'Chờ duyệt' },
  REJECTED: { color: 'red', text: 'Từ chối' },
  REVOKED: { color: 'default', text: 'Thu hồi' },
};

/**
 * Kho ảnh để gắn vào hồ sơ quán.
 * Admin mặc định xem TOÀN BỘ kho ảnh (trước đây chỉ đọc /media/my nên tài khoản admin chưa tải ảnh nào thấy trống trơn).
 * Người dùng thường chỉ thấy ảnh của mình.
 */
export const UserMediaLibraryModal: React.FC<UserMediaLibraryModalProps> = ({ visible, onClose, onSelectAsset, onOpenUpload }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [assets, setAssets] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [scope, setScope] = useState<'all' | 'mine'>(isAdmin ? 'all' : 'mine');

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const base = scope === 'all' && isAdmin ? '/api/v1/media/admin/list' : '/api/v1/media/my';
      let url = `${base}?page=${page}&limit=12`;
      if (statusFilter !== 'ALL') url += `&status=${statusFilter}`;
      if (scope === 'all' && isAdmin) url += '&source=all';
      const res = await fetch(url, { credentials: 'include' });
      const json = await res.json();
      if (json.success && json.data) {
        setAssets(json.data.assets || []);
        setTotal(json.data.total || 0);
      } else {
        setAssets([]);
        setTotal(0);
      }
    } catch (err) {
      console.error('Lỗi khi tải kho ảnh:', err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, scope, isAdmin]);

  useEffect(() => {
    if (visible) fetchMedia();
    else setSelectedAssetId(null);
  }, [visible, fetchMedia]);

  const handleConfirmSelect = () => {
    const chosen = assets.find((a) => a.id === selectedAssetId);
    if (chosen) {
      onSelectAsset(chosen);
      onClose();
    }
  };

  const handleDelete = async (assetId: string) => {
    try {
      const res = await fetch(`/api/v1/media/${assetId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] || '' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Không xoá được ảnh');
      message.success('Đã xoá ảnh');
      if (selectedAssetId === assetId) setSelectedAssetId(null);
      fetchMedia();
    } catch (err: any) {
      message.error(err.message || 'Không xoá được ảnh');
    }
  };

  return (
    <Modal
      title={
        <Space>
          <Image size="1em" style={{ color: '#2F6B4F' }} />
          <span>Kho ảnh</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button
          key="upload"
          icon={<Upload size="1em" />}
          onClick={() => {
            onClose();
            onOpenUpload();
          }}
        >
          Tải ảnh mới
        </Button>,
        <Button key="select" type="primary" disabled={!selectedAssetId} onClick={handleConfirmSelect} data-testid="btn-pick-asset">
          Chọn ảnh này
        </Button>,
      ]}
      width={860}
      destroyOnHidden
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text type="secondary">Chọn ảnh đã có trong kho để gắn vào hồ sơ quán (ảnh bìa / thư viện / thực đơn).</Text>
          <Space wrap>
            {isAdmin && (
              <Segmented
                value={scope}
                size="small"
                data-testid="library-scope"
                onChange={(v) => {
                  setScope(v as 'all' | 'mine');
                  setPage(1);
                }}
                options={[
                  { value: 'all', label: 'Tất cả ảnh' },
                  { value: 'mine', label: 'Ảnh tôi tải' },
                ]}
              />
            )}
            <Segmented
              value={statusFilter}
              size="small"
              onChange={(v) => {
                setStatusFilter(v as string);
                setPage(1);
              }}
              options={[
                { value: 'ALL', label: 'Tất cả' },
                { value: 'APPROVED', label: 'Đã duyệt' },
                { value: 'PENDING', label: 'Chờ duyệt' },
              ]}
            />
          </Space>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
          </div>
        ) : assets.length === 0 ? (
          <Empty description={scope === 'mine' ? 'Bạn chưa tải ảnh nào lên kho' : 'Kho ảnh chưa có ảnh nào'}>
            <Button
              type="primary"
              icon={<Upload size="1em" />}
              onClick={() => {
                onClose();
                onOpenUpload();
              }}
            >
              Tải ảnh lên kho
            </Button>
          </Empty>
        ) : (
          <div>
            <Row gutter={[12, 12]} data-testid="library-grid">
              {assets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                const st = STATUS_LABEL[asset.moderationStatus] || { color: 'default', text: asset.moderationStatus };
                return (
                  <Col xs={12} sm={8} md={6} key={asset.id}>
                    <Card
                      hoverable
                      size="small"
                      cover={
                        <div style={{ height: 110, background: '#EEECE7', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                          <img src={`/api/v1/media/${asset.id}?variant=thumb&preview=true`} alt={asset.originalName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          {isSelected && (
                            <div style={{ position: 'absolute', top: 6, right: 6, background: '#fff', borderRadius: '50%', display: 'flex' }}>
                              <CircleCheck size="1em" style={{ color: '#2F6B4F', fontSize: 18 }} />
                            </div>
                          )}
                        </div>
                      }
                      style={{ borderColor: isSelected ? '#2F6B4F' : undefined, borderWidth: isSelected ? 2 : 1 }}
                      onClick={() => setSelectedAssetId(asset.id)}
                    >
                      <Text ellipsis style={{ width: '100%', fontSize: 11 }} strong>
                        {asset.originalName}
                      </Text>
                      <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Space size={2}>
                          {asset.isAnimated && (
                            <Tag color="magenta" style={{ fontSize: 9, margin: 0 }}>
                              {asset.frameCount} frames
                            </Tag>
                          )}
                          <Tag color={st.color} style={{ fontSize: 9, margin: 0 }}>
                            {st.text}
                          </Tag>
                        </Space>
                        <Popconfirm
                          title="Xoá hẳn ảnh này?"
                          okText="Xoá"
                          cancelText="Huỷ"
                          okButtonProps={{ danger: true }}
                          onConfirm={(e) => {
                            (e as any)?.stopPropagation?.();
                            handleDelete(asset.id);
                          }}
                        >
                          <Button type="text" size="small" danger icon={<Trash2 size="1em" />} data-testid="btn-delete-library-asset" onClick={(e) => e.stopPropagation()} />
                        </Popconfirm>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>

            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Pagination size="small" current={page} pageSize={12} total={total} onChange={(p) => setPage(p)} showSizeChanger={false} />
            </div>
          </div>
        )}
      </Space>
    </Modal>
  );
};

export default UserMediaLibraryModal;
