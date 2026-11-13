import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Plus, Lock, Globe, Trash2, Pencil, Share2 } from 'lucide-react';
import {
  Typography,
  Card,
  Tabs,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Switch,
  List,
  Row,
  Col,
  Empty,
  Spin,
  message,
  Popconfirm,
} from 'antd';

const { Title, Text, Paragraph } = Typography;

/**
 * embedded: nhúng vào tab của trang hồ sơ (ẩn tiêu đề trang, chỉ hiện đúng "view").
 * view: 'collections' | 'favorites'.
 */
export const UserCollectionsPage: React.FC<{ embedded?: boolean; view?: 'collections' | 'favorites' | 'all' }> = ({
  embedded = false,
  view,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [colRes, favRes] = await Promise.all([
        axios.get('/api/v1/me/collections'),
        axios.get('/api/v1/me/favorites'),
      ]);

      if (colRes.data.success) {
        setCollections(colRes.data.data || []);
      }
      if (favRes.data.success) {
        setFavorites(favRes.data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /** Xoá bộ sưu tập của chính mình. */
  const handleDeleteCollection = async (id: string) => {
    try {
      await axios.delete(`/api/v1/me/collections/${id}`);
      message.success('Đã xoá bộ sưu tập');
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được bộ sưu tập');
    }
  };

  const handleOpenCreate = () => {
    setEditingCollection(null);
    form.resetFields();
    form.setFieldsValue({ isPublic: false });
    setCreateModalOpen(true);
  };

  const handleOpenEdit = (col: any) => {
    setEditingCollection(col);
    form.setFieldsValue({
      name: col.name,
      description: col.description,
      isPublic: col.isPublic,
    });
    setCreateModalOpen(true);
  };

  const handleSaveCollection = async (values: any) => {
    setSubmitting(true);
    try {
      if (editingCollection) {
        await axios.patch(`/api/v1/me/collections/${editingCollection.id}`, values);
        message.success(
          values.isPublic
            ? 'Đã cập nhật bộ sưu tập và gửi yêu cầu phê duyệt công khai'
            : 'Đã lưu thay đổi bộ sưu tập riêng tư',
        );
      } else {
        await axios.post('/api/v1/me/collections', values);
        message.success(
          values.isPublic
            ? 'Tạo bộ sưu tập thành công (đang chờ duyệt để xuất bản công khai)'
            : 'Tạo bộ sưu tập riêng tư thành công',
        );
      }
      setCreateModalOpen(false);
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Có lỗi xảy ra khi lưu bộ sưu tập');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveFavorite = async (placeId: string) => {
    try {
      await axios.post(`/api/v1/me/favorites/${placeId}`);
      message.success('Đã xóa khỏi danh sách yêu thích');
      setFavorites((prev) => prev.filter((f) => f.placeId !== placeId));
    } catch {
      message.error('Lỗi khi xóa yêu thích');
    }
  };

  return (
    <div style={{ maxWidth: embedded ? undefined : 1100, margin: '0 auto' }}>
      {!embedded && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <Title level={3} style={{ margin: 0 }}>
              Bộ Sưu Tập & Quán Yêu Thích
            </Title>
            <Paragraph type="secondary" style={{ margin: '4px 0 0 0' }}>
              Tập hợp các không gian học tập yêu thích, chia sẻ danh sách địa điểm cho bạn bè cùng lớp.
            </Paragraph>
          </div>
          <Button type="primary" icon={<Plus size="1em" />} onClick={handleOpenCreate}>
            Tạo Bộ Sưu Tập Mới
          </Button>
        </div>
      )}
      {embedded && (view === 'collections' || view === 'all') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button type="primary" icon={<Plus size="1em" />} onClick={handleOpenCreate}>
            Tạo Bộ Sưu Tập Mới
          </Button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : (
        <CollectionsTabs
          view={view}
          embedded={embedded}
          items={[
            {
              key: 'collections',
              label: `Bộ Sưu Tập Của Tôi (${collections.length})`,
              children: (
                <div>
                  {collections.length === 0 ? (
                    <Empty description="Bạn chưa có bộ sưu tập nào" style={{ padding: '40px 0' }}>
                      <Button type="primary" onClick={handleOpenCreate}>
                        Tạo Bộ Sưu Tập Đầu Tiên
                      </Button>
                    </Empty>
                  ) : (
                    <Row gutter={[16, 16]}>
                      {collections.map((col) => (
                        <Col xs={24} sm={12} lg={8} key={col.id}>
                          <Card
                            hoverable
                            title={
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {col.isPublic ? (
                                  <Globe size="1em" style={{ color: '#2F6B4F' }} />
                                ) : (
                                  <Lock size="1em" style={{ color: '#8c8c8c' }} />
                                )}
                                <Text strong ellipsis style={{ maxWidth: 180 }}>
                                  {col.name}
                                </Text>
                              </div>
                            }
                            extra={
                              <Tag color={col.isPublic ? 'blue' : 'default'}>
                                {col.isPublic ? 'Công khai (Cần duyệt)' : 'Riêng tư'}
                              </Tag>
                            }
                            actions={[
                              <Button
                                key="edit"
                                type="text"
                                icon={<Pencil size="1em" />}
                                onClick={() => handleOpenEdit(col)}
                              >
                                Sửa
                              </Button>,
                              <Button
                                key="view"
                                type="text"
                                icon={<Share2 size="1em" />}
                                onClick={() => navigate(`/collections/${col.id}`)}
                              >
                                Xem
                              </Button>,
                              <Popconfirm
                                key="delete"
                                title="Xoá bộ sưu tập này?"
                                description="Các quán đã lưu trong bộ sưu tập cũng bị gỡ."
                                okText="Xoá"
                                cancelText="Huỷ"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => handleDeleteCollection(col.id)}
                              >
                                <Button type="text" danger icon={<Trash2 size="1em" />} data-testid="btn-delete-collection">
                                  Xoá
                                </Button>
                              </Popconfirm>,
                            ]}
                          >
                            <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ minHeight: 44 }}>
                              {col.description || 'Chưa có mô tả cho bộ sưu tập này.'}
                            </Paragraph>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: 12,
                              }}
                            >
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {col.items?.length || 0} địa điểm
                              </Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                {new Date(col.createdAt).toLocaleDateString('vi-VN')}
                              </Text>
                            </div>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  )}
                </div>
              ),
            },
            {
              key: 'favorites',
              label: `Quán Yêu Thích (${favorites.length})`,
              children: (
                <div>
                  {favorites.length === 0 ? (
                    <Empty description="Bạn chưa lưu quán yêu thích nào." />
                  ) : (
                    <List
                      grid={{ gutter: 16, xs: 1, sm: 2, md: 3 }}
                      dataSource={favorites}
                      renderItem={(fav: any) => (
                        <List.Item>
                          <Card
                            hoverable
                            cover={
                              fav.coverPhoto?.thumbUrl ? (
                                <img alt={fav.name} src={fav.coverPhoto.thumbUrl} style={{ height: 140, objectFit: 'cover' }} />
                              ) : (
                                <div style={{ height: 140, background: '#EEECE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6F6B66', fontSize: 12 }}>Chưa có ảnh</div>
                              )
                            }
                            actions={[
                              <Button
                                key="view"
                                type="primary"
                                ghost
                                size="small"
                                onClick={() => navigate(`/places/${fav.slug}`)}
                              >
                                Xem Chi Tiết
                              </Button>,
                              <Popconfirm
                                title="Bỏ lưu quán này?"
                                onConfirm={() => handleRemoveFavorite(fav.placeId)}
                                okText="Bỏ lưu"
                                cancelText="Hủy"
                              >
                                <Button key="del" danger type="text" size="small" icon={<Trash2 size="1em" />}>
                                  Bỏ Lưu
                                </Button>
                              </Popconfirm>,
                            ]}
                          >
                            <Card.Meta
                              title={<Text strong>{fav.name}</Text>}
                              description={
                                <div>
                                  <div style={{ fontSize: 12 }}>{fav.address || 'Chưa có địa chỉ'}</div>
                                  <div style={{ fontSize: 12, marginTop: 4 }}>
                                    {fav.reviewCount > 0 ? `★ ${Number(fav.ratingOverall).toFixed(1)} (${fav.reviewCount})` : 'Chưa có đánh giá'}
                                    {' · '}Lưu ngày {new Date(fav.favoritedAt || fav.createdAt).toLocaleDateString('vi-VN')}
                                  </div>
                                </div>
                              }
                            />
                          </Card>
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      {/* Modal Tạo/Sửa Bộ Sưu Tập */}
      <Modal
        title={editingCollection ? 'Chỉnh Sửa Bộ Sưu Tập' : 'Tạo Bộ Sưu Tập Mới'}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText={editingCollection ? 'Lưu Thay Đổi' : 'Tạo Bộ Sưu Tập'}
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" onFinish={handleSaveCollection}>
          <Form.Item
            name="name"
            label="Tên Bộ Sưu Tập"
            rules={[{ required: true, message: 'Vui lòng nhập tên bộ sưu tập' }]}
          >
            <Input placeholder="Ví dụ: Top Quán Chạy Deadline Q5 Gần KHTN" />
          </Form.Item>

          <Form.Item name="description" label="Mô Tả Danh Sách">
            <Input.TextArea rows={3} placeholder="Mô tả lý do hoặc ghi chú cho danh sách quán này..." />
          </Form.Item>

          <Form.Item
            name="isPublic"
            label="Chế Độ Công Khai Cho Sinh Viên Khác Xem"
            valuePropName="checked"
            extra="Bộ sưu tập công khai sẽ được kiểm duyệt trước khi xuất hiện trên trang khám phá chung."
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
/** view='all' (tab "Đã lưu" trong hồ sơ): xếp Quán yêu thích rồi Bộ sưu tập thành 2 mục liền nhau, không tab con. */
const CollectionsTabs: React.FC<{ view?: 'collections' | 'favorites' | 'all'; embedded: boolean; items: Array<{ key: string; label: string; children: React.ReactNode }> }> = ({ view, embedded, items }) => {
  if (embedded && view === 'all') {
    const ordered = [...items].sort((a) => (a.key === 'favorites' ? -1 : 1));
    return (
      <div>
        {ordered.map((it) => (
          <section key={it.key} style={{ marginBottom: 24 }}>
            <Title level={5} style={{ margin: '0 0 12px' }}>
              {it.label}
            </Title>
            {it.children}
          </section>
        ))}
      </div>
    );
  }
  return <Tabs defaultActiveKey={view || 'collections'} activeKey={embedded ? view || 'collections' : undefined} renderTabBar={embedded ? () => <></> : undefined} items={items} />;
};

export default UserCollectionsPage;
