import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Typography,
  Card,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Input,
  message,
} from 'antd';
import { SuggestionPreview, useSuggestionPreview } from '../../components/admin/SuggestionPreview';
import { Select } from 'antd';
import { CircleCheck, CircleX, Eye, Pencil } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

export const AdminContributionsPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [reviewerNote, setReviewerNote] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  // Bản xem trước hồ sơ quán sẽ tạo (server dựng từ initialData) + danh sách thiếu sót
  const { data: preview, loading: previewLoading } = useSuggestionPreview(modalOpen ? selectedSuggestion?.id : null);
  // Admin chọn lại danh mục / cơ sở trường khi duyệt (sinh viên ghi "khác" hoặc chọn sai)
  const [categories, setCategories] = useState<any[]>([]);
  const [campuses, setCampuses] = useState<any[]>([]);
  const [overrideCategoryId, setOverrideCategoryId] = useState<string | undefined>(undefined);
  const [overrideCampusId, setOverrideCampusId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    axios
      .get('/api/v1/places/meta')
      .then((r) => {
        setCategories(r.data?.data?.categories || []);
        setCampuses(r.data?.data?.campuses || []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setOverrideCategoryId(selectedSuggestion?.categoryId);
    setOverrideCampusId(selectedSuggestion?.initialData?.nearestCampusId || selectedSuggestion?.campusId || null);
  }, [selectedSuggestion?.id]);

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/community/suggestions');
      if (res.data.success) {
        setSuggestions(res.data.data);
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách đề xuất');
    } finally {
      setLoading(false);
    }
  };

  const handleModerate = async (action: 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED') => {
    if (!selectedSuggestion) return;
    setActionLoading(true);
    try {
      const res = await axios.post(`/api/v1/admin/community/suggestions/${selectedSuggestion.id}/moderate`, {
        action,
        reviewerNote: reviewerNote || (action === 'APPROVE' ? 'Đã duyệt đề xuất thành công' : 'Đã từ chối đề xuất'),
        ...(action === 'APPROVE' ? { categoryId: overrideCategoryId, nearestCampusId: overrideCampusId ?? null } : {}),
      });
      if (res.data.success) {
        message.success(res.data.message);
        setModalOpen(false);
        setReviewerNote('');
        fetchSuggestions();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xử lý đề xuất');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      title: 'Tên Quán Đề Xuất',
      dataIndex: 'proposedName',
      key: 'proposedName',
      render: (text: string, row: any) => (
        <div>
          <Text strong>{text}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{row.addressDescription}</Text>
        </div>
      ),
    },
    {
      title: 'Người Đề Xuất',
      key: 'user',
      render: (_: any, row: any) => row.user?.username || 'Sinh viên',
    },
    {
      title: 'Khoảng Giá',
      key: 'price',
      render: (_: any, row: any) => {
        const init = row.initialData || {};
        if (init.priceMin && init.priceMax) {
          return `${init.priceMin.toLocaleString()} - ${init.priceMax.toLocaleString()} đ`;
        }
        return 'Chưa rõ';
      },
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        switch (status) {
          case 'APPROVED':
            return <Tag color="success">Đã duyệt thành quán</Tag>;
          case 'REJECTED':
            return <Tag color="error">Đã từ chối</Tag>;
          case 'CHANGES_REQUESTED':
            return <Tag color="processing">Cần bổ sung</Tag>;
          default:
            return <Tag color="warning">Chờ duyệt</Tag>;
        }
      },
    },
    {
      title: 'Thời Gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleString('vi-VN'),
    },
    {
      title: 'Thao Tác',
      key: 'actions',
      render: (_: any, row: any) => (
        <Space>
          <Button
            size="small"
            icon={<Eye size="1em" />}
            onClick={() => {
              setSelectedSuggestion(row);
              setReviewerNote(row.reviewerNotes || '');
              setModalOpen(true);
            }}
          >
            Chi Tiết & Duyệt
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4}>
          Đề xuất quán mới từ sinh viên
        </Title>
        <Paragraph type="secondary">
          Xem xét các đề xuất quán mới do sinh viên đóng góp. Khi phê duyệt, hệ thống sẽ tự động tạo hồ sơ quán, tạo bản ghi phiên bản 1 (Revision 1) và đưa vào vùng tìm kiếm & bản đồ.
        </Paragraph>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={suggestions}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      </Card>

      {/* Modal chi tiết và duyệt */}
      <Modal
        title={`Đề xuất quán: ${selectedSuggestion?.proposedName}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={820}
        style={{ top: 24, maxWidth: 'calc(100vw - 16px)' }}
      >
        {selectedSuggestion && (
          <div>
            <SuggestionPreview suggestion={selectedSuggestion} preview={preview} loading={previewLoading} />

            {(selectedSuggestion.status === 'PENDING' || selectedSuggestion.status === 'CHANGES_REQUESTED') && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: 16 }}>
                <div>
                  <Text strong>Danh mục khi tạo quán</Text>
                  <Select style={{ width: '100%', marginTop: 6 }} value={overrideCategoryId} onChange={setOverrideCategoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} data-testid="approve-category" />
                </div>
                <div>
                  <Text strong>Cơ sở trường gần nhất</Text>
                  <Select style={{ width: '100%', marginTop: 6 }} allowClear showSearch optionFilterProp="label" placeholder="Không gắn" value={overrideCampusId ?? undefined} onChange={(v) => setOverrideCampusId(v ?? null)} options={campuses.map((c) => ({ value: c.id, label: c.universityName ? `${c.name} — ${c.universityName}` : c.name }))} data-testid="approve-campus" />
                </div>
              </div>
            )}

            <div style={{ margin: '16px 0' }}>
              <Text strong>Ghi chú phản hồi cho sinh viên:</Text>
              <Input.TextArea
                rows={2}
                style={{ marginTop: 8 }}
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
                placeholder="Ví dụ: Cảm ơn bạn, quán đã lên bản đồ — hoặc: Thiếu vị trí trên bản đồ, bạn bổ sung giúp nhé"
              />
            </div>

            {(selectedSuggestion.status === 'PENDING' || selectedSuggestion.status === 'CHANGES_REQUESTED') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Button danger icon={<CircleX size="1em" />} onClick={() => handleModerate('REJECT')} loading={actionLoading}>
                  Từ chối
                </Button>
                <Button icon={<Pencil size="1em" />} onClick={() => handleModerate('CHANGES_REQUESTED')} loading={actionLoading}>
                  Yêu cầu bổ sung
                </Button>
                <Button
                  type="primary"
                  icon={<CircleCheck size="1em" />}
                  onClick={() => handleModerate('APPROVE')}
                  loading={actionLoading}
                  disabled={Boolean(preview && !preview.valid)}
                  title={preview && !preview.valid ? 'Đề xuất còn thiếu dữ liệu — xem cảnh báo ở trên' : undefined}
                  data-testid="btn-approve-suggestion"
                >
                  Phê duyệt thành quán mới
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminContributionsPage;
