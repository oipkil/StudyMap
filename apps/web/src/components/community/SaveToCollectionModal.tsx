import React, { useEffect, useState } from 'react';
import { Modal, List, Button, Input, Typography, Space, Tag, message, Empty, Divider } from 'antd';
import axios from 'axios';
import { Lock, Globe, Plus, Check } from 'lucide-react';

const { Text } = Typography;

interface Props {
  open: boolean;
  placeId: string;
  placeName?: string;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Lưu một quán vào bộ sưu tập của tôi: liệt kê bộ sưu tập hiện có (đánh dấu bộ đã chứa quán),
 * cho phép tạo nhanh bộ sưu tập riêng tư mới rồi thêm luôn.
 */
export const SaveToCollectionModal: React.FC<Props> = ({ open, placeId, placeName, onClose, onSaved }) => {
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/me/collections');
      setCollections(res.data?.data || []);
    } catch {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const contains = (col: any) => (col.items || []).some((it: any) => it.placeId === placeId);

  const addTo = async (col: any) => {
    setBusyId(col.id);
    try {
      await axios.post(`/api/v1/me/collections/${col.id}/items`, { placeId });
      message.success(`Đã lưu vào "${col.name}"`);
      await load();
      onSaved?.();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không lưu được');
    } finally {
      setBusyId(null);
    }
  };

  const removeFrom = async (col: any) => {
    setBusyId(col.id);
    try {
      await axios.delete(`/api/v1/me/collections/${col.id}/items/${placeId}`);
      message.success(`Đã gỡ khỏi "${col.name}"`);
      await load();
      onSaved?.();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không gỡ được');
    } finally {
      setBusyId(null);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await axios.post('/api/v1/me/collections', { name, isPublic: false });
      const col = res.data?.data;
      if (col?.id) await axios.post(`/api/v1/me/collections/${col.id}/items`, { placeId });
      message.success(`Đã tạo "${name}" và lưu quán`);
      setNewName('');
      await load();
      onSaved?.();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không tạo được bộ sưu tập');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={placeName ? `Lưu "${placeName}" vào bộ sưu tập` : 'Lưu vào bộ sưu tập'}
      destroyOnHidden
    >
      <List
        loading={loading}
        dataSource={collections}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa có bộ sưu tập nào" /> }}
        renderItem={(col: any) => {
          const has = contains(col);
          return (
            <List.Item
              actions={[
                has ? (
                  <Button key="rm" size="small" loading={busyId === col.id} onClick={() => removeFrom(col)}>
                    Gỡ
                  </Button>
                ) : (
                  <Button key="add" size="small" type="primary" icon={<Plus size="1em" />} loading={busyId === col.id} onClick={() => addTo(col)}>
                    Lưu
                  </Button>
                ),
              ]}
            >
              <Space>
                {col.isPublic ? <Globe size="1em" style={{ color: '#2F6B4F' }} /> : <Lock size="1em" style={{ color: '#8c8c8c' }} />}
                <Text strong>{col.name}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {(col.items || []).length} quán
                </Text>
                {has && (
                  <Tag color="green" icon={<Check size="1em" />}>
                    Đã có
                  </Tag>
                )}
              </Space>
            </List.Item>
          );
        }}
      />
      <Divider style={{ margin: '12px 0' }} />
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder="Tạo bộ sưu tập mới (riêng tư) và lưu luôn…"
          value={newName}
          maxLength={100}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={createAndAdd}
        />
        <Button type="primary" loading={creating} onClick={createAndAdd} disabled={!newName.trim()}>
          Tạo & lưu
        </Button>
      </Space.Compact>
    </Modal>
  );
};

export default SaveToCollectionModal;
