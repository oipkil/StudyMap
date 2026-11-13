import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Ban, Eye } from 'lucide-react';
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
  Descriptions,
} from 'antd';

const { Title, Text, Paragraph } = Typography;

export const AdminReportsPage: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [resolutionNote, setResolutionNote] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/community/reports');
      if (res.data.success) {
        setReports(res.data.data);
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi tải danh sách báo cáo');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (status: 'RESOLVED' | 'DISMISSED', actionTaken: string) => {
    if (!selectedReport) return;
    setActionLoading(true);
    try {
      const res = await axios.patch(`/api/v1/admin/community/reports/${selectedReport.id}`, {
        status,
        actionTaken,
        resolutionNote: resolutionNote || 'Đã giải quyết theo quy định cộng đồng',
      });
      if (res.data.success) {
        message.success(res.data.message);
        setModalOpen(false);
        setResolutionNote('');
        fetchReports();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi xử lý báo cáo');
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      title: 'Đối Tượng Báo Cáo',
      dataIndex: 'targetType',
      key: 'targetType',
      render: (t: string) => <Tag color="green">{t}</Tag>,
    },
    {
      title: 'Lý Do Vi Phạm',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string) => <Tag color="volcano">{r}</Tag>,
    },
    {
      title: 'Người Báo Cáo',
      key: 'reporter',
      render: (_: any, row: any) => row.reporter?.username || 'Sinh viên',
    },
    {
      title: 'Chi Tiết Mô Tả',
      dataIndex: 'details',
      key: 'details',
      render: (text: string) => <Text ellipsis style={{ maxWidth: 280 }}>{text || 'Không có mô tả thêm'}</Text>,
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => {
        switch (s) {
          case 'RESOLVED':
            return <Tag color="success">Đã giải quyết</Tag>;
          case 'DISMISSED':
            return <Tag color="default">Đã bác bỏ</Tag>;
          case 'INVESTIGATING':
            return <Tag color="processing">Đang xác minh</Tag>;
          default:
            return <Tag color="warning">Chờ xử lý</Tag>;
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
              setSelectedReport(row);
              setResolutionNote(row.resolutionNote || '');
              setModalOpen(true);
            }}
          >
            Xem & Xử Lý
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4}>
          Báo cáo vi phạm
        </Title>
        <Paragraph type="secondary">
          Tiếp nhận và xử lý các phản ánh của sinh viên về spam, sai lệch thông tin địa điểm, ngôn từ không phù hợp hoặc hành vi quấy rối.
        </Paragraph>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={reports}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      </Card>

      <Modal
        title={`Xử Lý Báo Cáo Vi Phạm (${selectedReport?.targetType})`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        {selectedReport && (
          <div>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Đối tượng">{selectedReport.targetType} (ID: {selectedReport.targetId})</Descriptions.Item>
              <Descriptions.Item label="Lý do báo cáo">{selectedReport.reason}</Descriptions.Item>
              <Descriptions.Item label="Người gửi báo cáo">
                {selectedReport.reporter?.username} ({selectedReport.reporter?.email})
              </Descriptions.Item>
              <Descriptions.Item label="Nội dung phản ánh">
                {selectedReport.details || 'Không có mô tả thêm'}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={selectedReport.status === 'RESOLVED' ? 'green' : selectedReport.status === 'DISMISSED' ? 'default' : 'orange'}>
                  {selectedReport.status === 'RESOLVED' ? 'Đã giải quyết' : selectedReport.status === 'DISMISSED' ? 'Đã bác bỏ' : selectedReport.status === 'INVESTIGATING' ? 'Đang xác minh' : 'Chờ xử lý'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <Text strong>Biện Pháp Xử Lý / Ghi Chú:</Text>
              <Input.TextArea
                rows={3}
                style={{ marginTop: 6 }}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Nhập ghi chú giải quyết (VD: Đã ẩn bình luận vi phạm và gửi cảnh báo đến tài khoản)..."
              />
            </div>

            {(selectedReport.status === 'OPEN' || selectedReport.status === 'INVESTIGATING' || selectedReport.status === 'PENDING') && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button
                  onClick={() => handleResolve('DISMISSED', 'Bác bỏ báo cáo (Nội dung hợp lệ)')}
                  loading={actionLoading}
                >
                  Bác Bỏ (Hợp Lệ)
                </Button>
                <Button
                  type="primary"
                  danger
                  icon={<Ban size="1em" />}
                  onClick={() => handleResolve('RESOLVED', 'Đã xử lý và ẩn nội dung vi phạm')}
                  loading={actionLoading}
                >
                  Xác Nhận Vi Phạm & Giải Quyết
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminReportsPage;
