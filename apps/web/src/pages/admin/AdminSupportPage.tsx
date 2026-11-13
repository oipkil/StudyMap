import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Input,
  Select,
  Typography,
  message,
  Card,
  List,
} from 'antd';
import axios from 'axios';
import { Headphones, MessageSquare } from 'lucide-react';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface SupportTicket {
  id: string;
  subject: string;
  status: 'WAITING' | 'HUMAN_ACTIVE' | 'RESOLVED' | 'CLOSED';
  priority: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    displayName?: string;
    email: string;
  };
  messages?: Array<{
    id: string;
    senderType: 'USER' | 'ADMIN' | 'SYSTEM' | 'AI';
    message: string;
    createdAt: string;
  }>;
}

export const AdminSupportPage: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const url =
        statusFilter === 'ALL'
          ? '/api/v1/admin/support/tickets'
          : `/api/v1/admin/support/tickets?status=${statusFilter}`;
      const res = await axios.get(url);
      if (res.data.success && res.data.data) {
        setTickets(res.data.data.tickets || []);
      }
    } catch {
      message.error('Không thể nạp danh sách yêu cầu hỗ trợ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter]);

  const handleOpenDetail = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setNewStatus(ticket.status);
    setReplyText('');
    try {
      const res = await axios.get(`/api/v1/admin/support/tickets/${ticket.id}`);
      if (res.data.success && res.data.data) {
        setSelectedTicket(res.data.data.ticket);
        setNewStatus(res.data.data.ticket.status);
      }
    } catch {
      // Use existing ticket data
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    try {
      setReplyLoading(true);
      await axios.post(`/api/v1/admin/support/tickets/${selectedTicket.id}/messages`, {
        message: replyText.trim(),
      });
      message.success('Đã gửi phản hồi đến sinh viên');
      setReplyText('');
      handleOpenDetail(selectedTicket);
      fetchTickets();
    } catch {
      message.error('Lỗi khi gửi phản hồi');
    } finally {
      setReplyLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedTicket) return;
    try {
      await axios.patch(`/api/v1/admin/support/tickets/${selectedTicket.id}/status`, {
        status: newStatus,
      });
      message.success('Cập nhật trạng thái thành công');
      fetchTickets();
      setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus as any } : null));
    } catch {
      message.error('Không thể cập nhật trạng thái');
    }
  };

  const renderStatusTag = (status: string) => {
    switch (status) {
      case 'WAITING':
        return <Tag color="gold">Chờ xử lý</Tag>;
      case 'HUMAN_ACTIVE':
        return <Tag color="processing">Đang hỗ trợ</Tag>;
      case 'RESOLVED':
        return <Tag color="success">Đã giải quyết</Tag>;
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  const columns = [
    {
      title: 'Tiêu Đề Yêu Cầu',
      dataIndex: 'subject',
      key: 'subject',
      render: (t: string, r: SupportTicket) => (
        <div>
          <Text strong>{t}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Tạo: {new Date(r.createdAt).toLocaleString('vi-VN')}
          </Text>
        </div>
      ),
    },
    {
      title: 'Sinh Viên',
      key: 'user',
      render: (_: unknown, r: SupportTicket) => (
        <div>
          <Text strong>{r.user?.displayName || r.user?.username}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.user?.email}
          </Text>
        </div>
      ),
    },
    {
      title: 'Trạng Thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: string) => renderStatusTag(st),
    },
    {
      title: 'Hành Động',
      key: 'action',
      render: (_: unknown, record: SupportTicket) => (
        <Button
          type="primary"
          ghost
          icon={<MessageSquare size="1em" />}
          size="small"
          onClick={() => handleOpenDetail(record)}
        >
          Xử Lý & Trả Lời
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Hỗ trợ sinh viên
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0 0' }}>
            Tiếp nhận thắc mắc, xử lý khiếu nại, phản hồi vé hỗ trợ theo thời gian thực.
          </Paragraph>
        </div>
        <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 180 }}>
          <Option value="ALL">Tất cả trạng thái</Option>
          <Option value="WAITING">Chờ xử lý</Option>
          <Option value="HUMAN_ACTIVE">Đang xử lý</Option>
          <Option value="RESOLVED">Đã giải quyết</Option>
        </Select>
      </div>

      <Table
        rowKey="id"
        dataSource={tickets}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />

      <Modal
        title={
          <Space>
            <Headphones size="1em" />
            <span>Xử Lý Vé Hỗ Trợ: {selectedTicket?.subject}</span>
          </Space>
        }
        open={!!selectedTicket}
        onCancel={() => setSelectedTicket(null)}
        footer={null}
        width={700}
      >
        {selectedTicket && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <Text type="secondary">Sinh viên: </Text>
                <Text strong>{selectedTicket.user?.displayName || selectedTicket.user?.username}</Text>
                <Text type="secondary"> ({selectedTicket.user?.email})</Text>
              </div>
              <Space>
                <Select value={newStatus} onChange={setNewStatus} style={{ width: 140 }}>
                  <Option value="WAITING">Chờ xử lý</Option>
                  <Option value="HUMAN_ACTIVE">Đang hỗ trợ</Option>
                  <Option value="RESOLVED">Đã giải quyết</Option>
                </Select>
                <Button size="small" onClick={handleUpdateStatus}>
                  Lưu
                </Button>
              </Space>
            </div>

            <Card
              size="small"
              title="Lịch Sử Trao Đổi"
              style={{ maxHeight: 350, overflowY: 'auto', marginBottom: 16 }}
            >
              <List
                dataSource={selectedTicket.messages || []}
                renderItem={(msg) => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: 12,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor:
                        msg.senderType === 'ADMIN' ? '#EEF4F0' : msg.senderType === 'AI' ? '#FBFAF7' : '#F1F0EC',
                      border: msg.senderType === 'AI' ? '1px dashed #E8E6E1' : '1px solid transparent',
                      marginLeft: msg.senderType === 'ADMIN' ? 40 : 0,
                      marginRight: msg.senderType === 'USER' ? 40 : 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text strong style={{ fontSize: 12, color: msg.senderType === 'AI' ? '#6F6B66' : undefined }}>
                        {msg.senderType === 'ADMIN'
                          ? 'Quản trị viên'
                          : msg.senderType === 'AI'
                            ? 'Trợ lý AI (trước khi chuyển)'
                            : msg.senderType === 'SYSTEM'
                              ? 'Hệ thống'
                              : 'Sinh viên'}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {new Date(msg.createdAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </div>
                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                      {String(msg.message || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '')}
                    </Text>
                  </div>
                )}
              />
            </Card>

            <div style={{ display: 'flex', gap: 8 }}>
              <TextArea
                rows={3}
                placeholder="Nhập câu trả lời gửi đến sinh viên..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <Button
                type="primary"
                style={{ height: 'auto' }}
                onClick={handleSendReply}
                loading={replyLoading}
              >
                Gửi Phản Hồi
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
export default AdminSupportPage;
