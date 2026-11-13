import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Smile, CircleCheck, CircleX, Eye } from 'lucide-react';
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Image,
  message,
} from 'antd';

const { Title, Text, Paragraph } = Typography;

export const AdminStickersPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [packs, setPacks] = useState<any[]>([]);
  const [selectedPack, setSelectedPack] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchPacks();
  }, []);

  const fetchPacks = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/community/stickers');
      if (res.data.success) {
        setPacks(res.data.data);
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách bộ sticker');
    } finally {
      setLoading(false);
    }
  };

  const handleModerate = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedPack) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/v1/admin/community/stickers/${selectedPack.id}/moderate`, {
        action,
      });
      if (res.data.success) {
        message.success(res.data.message);
        setModalOpen(false);
        fetchPacks();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi duyệt sticker');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      title: 'Tên Bộ Nhãn Dán',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row: any) => (
        <Space>
          <Smile size="1em" style={{ color: '#2F6B4F', fontSize: 18 }} />
          <div>
            <Text strong>{name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>{row.slug}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Tác Giả',
      key: 'author',
      render: (_: any, row: any) => row.author?.username || 'Cộng tác viên',
    },
    {
      title: 'Số Lượng Sticker',
      key: 'count',
      render: (_: any, row: any) => `${row.items?.length || 0} nhãn`,
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'moderationStatus',
      key: 'moderationStatus',
      render: (s: string) => (
        <Tag color={s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : 'orange'}>
          {s === 'APPROVED' ? 'Đã phát hành' : s === 'REJECTED' ? 'Từ chối' : 'Chờ duyệt'}
        </Tag>
      ),
    },
    {
      title: 'Thao Tác',
      key: 'actions',
      render: (_: any, row: any) => (
        <Button
          size="small"
          icon={<Eye size="1em" />}
          onClick={() => {
            setSelectedPack(row);
            setModalOpen(true);
          }}
        >
          Xem & Duyệt
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4}>
          Bộ nhãn dán
        </Title>
        <Paragraph type="secondary">
          Kiểm tra các hình ảnh nhãn dán do sinh viên thiết kế trước khi đưa vào kho bình luận công khai toàn hệ thống.
        </Paragraph>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={packs}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      </Card>

      <Modal
        title={`Xem Bộ Nhãn Dán: ${selectedPack?.name}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
      >
        {selectedPack && (
          <div>
            <Paragraph type="secondary">
              Tác giả: {selectedPack.author?.username || 'Cộng tác viên'} · {selectedPack.items?.length || 0} nhãn dán
            </Paragraph>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                margin: '16px 0',
                padding: 16,
                background: '#fafafa',
                borderRadius: 8,
              }}
            >
              {selectedPack.items?.map((item: any) => (
                <div key={item.id} style={{ textAlign: 'center' }}>
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    style={{ width: 64, height: 64, objectFit: 'contain' }}
                  />
                  <Text ellipsis style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                    {item.name}
                  </Text>
                </div>
              ))}
            </div>

            {selectedPack.moderationStatus === 'PENDING' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <Button
                  danger
                  icon={<CircleX size="1em" />}
                  onClick={() => handleModerate('REJECT')}
                  loading={actionLoading}
                >
                  Từ Chối
                </Button>
                <Button
                  type="primary"
                  icon={<CircleCheck size="1em" />}
                  onClick={() => handleModerate('APPROVE')}
                  loading={actionLoading}
                >
                  Phê Duyệt Phát Hành
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminStickersPage;
