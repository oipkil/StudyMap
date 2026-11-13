import React, { useState, useEffect } from 'react';
import { SafeAvatar } from '../../components/common/SafeAvatar';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Typography, Card, Row, Col, Tag, Button, Spin, Alert, Popconfirm, message, Grid } from 'antd';
import { Globe, ArrowLeft, Trash2, Lock } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

export const PublicCollectionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = !Grid.useBreakpoint().md;
  const [collection, setCollection] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const handleRemoveItem = async (placeId: string) => {
    try {
      await axios.delete(`/api/v1/me/collections/${id}/items/${placeId}`);
      message.success('Đã gỡ quán khỏi bộ sưu tập');
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không gỡ được');
    }
  };

  useEffect(() => {
    const fetchCollection = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/v1/community/collections/${id}`);
        if (res.data.success) {
          setCollection(res.data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchCollection();
  }, [id, reloadKey]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!collection) {
    return (
      <Alert
        title="Không tìm thấy bộ sưu tập"
        description="Bộ sưu tập này không tồn tại, đang ở chế độ riêng tư hoặc chưa được phê duyệt."
        type="warning"
        showIcon
      />
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', paddingBottom: 60 }}>
      <Button type="text" icon={<ArrowLeft size="1em" />} onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
        Quay lại
      </Button>

      <Card style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: isMobile ? 16 : 24 } }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <Globe size="1em" style={{ fontSize: isMobile ? 20 : 24, color: '#2F6B4F', marginTop: isMobile ? 4 : 6, flexShrink: 0 }} />
          <Title level={isMobile ? 3 : 2} style={{ margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
            {collection.name}
          </Title>
        </div>

        <Paragraph style={{ fontSize: 15, color: '#595959', margin: '6px 0 12px 0' }}>
          {collection.description || 'Danh sách các quán được tuyển chọn cho sinh viên.'}
        </Paragraph>

        {/* Tác giả + nhãn: xuống dòng tự nhiên trên điện thoại (trước đây flex không wrap ép tên tác giả đứng dọc từng chữ) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <SafeAvatar size="small" src={collection.author?.avatarUrl} name={collection.author?.displayName || collection.author?.username} style={{ backgroundColor: '#2F6B4F', flexShrink: 0 }} />
            <Text strong style={{ whiteSpace: 'nowrap' }}>{collection.author?.displayName || collection.author?.username || 'Sinh viên SSG'}</Text>
          </div>
          <Tag color="green" style={{ margin: 0 }}>{collection.items?.length || 0} quán</Tag>
          {collection.isOwner && !collection.isPublic && (
            <Tag icon={<Lock size="1em" />} style={{ margin: 0 }}>Riêng tư — chỉ bạn thấy</Tag>
          )}
          {collection.isOwner && collection.isPublic && collection.moderationStatus !== 'APPROVED' && (
            <Tag color="warning" style={{ margin: 0 }}>Đang chờ duyệt công khai</Tag>
          )}
        </div>
      </Card>

      <Title level={4} style={{ fontSize: isMobile ? 16 : undefined }}>Quán trong bộ sưu tập</Title>
      {!collection.items || collection.items.length === 0 ? (
        <Alert title="Chưa có quán nào trong bộ sưu tập này." type="info" showIcon />
      ) : (
        <Row gutter={[16, 16]}>
          {collection.items.map((item: any) => (
            <Col xs={24} sm={12} key={item.id}>
              <Card
                hoverable
                onClick={() => item.place?.slug && navigate(`/places/${item.place.slug}`)}
                actions={
                  collection.isOwner
                    ? [
                        <Popconfirm
                          key="rm"
                          title="Gỡ quán này khỏi bộ sưu tập?"
                          okText="Gỡ"
                          cancelText="Hủy"
                          onConfirm={(e) => {
                            e?.stopPropagation();
                            handleRemoveItem(item.placeId);
                          }}
                          onCancel={(e) => e?.stopPropagation()}
                        >
                          <Button type="text" danger size="small" icon={<Trash2 size="1em" />} onClick={(e) => e.stopPropagation()}>
                            Gỡ khỏi bộ sưu tập
                          </Button>
                        </Popconfirm>,
                      ]
                    : undefined
                }
                cover={
                  item.place?.coverPhoto?.thumbUrl ? (
                    <img alt={item.place.name} src={item.place.coverPhoto.thumbUrl} style={{ height: 160, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ height: 160, background: '#EEECE7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6F6B66', fontSize: 12 }}>Chưa có ảnh</div>
                  )
                }
              >
                <Card.Meta
                  title={
                    <Text strong style={{ fontSize: 16 }}>
                      {item.place?.name || 'Quán đã bị gỡ'}
                    </Text>
                  }
                  description={
                    <div>
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                        {item.place?.address || 'Chưa có địa chỉ'}
                      </div>
                      {item.note && (
                        <div style={{ marginTop: 8, fontStyle: 'italic', color: '#2F6B4F', fontSize: 13 }}>
                          "{item.note}"
                        </div>
                      )}
                    </div>
                  }
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};
export default PublicCollectionPage;
