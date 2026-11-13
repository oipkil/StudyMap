import React, { useCallback, useEffect, useState } from 'react';
import { Typography, Card, Button, Table, Tag, Modal, Form, Input, Switch, InputNumber, Checkbox, Space, message, Alert, Popconfirm, Grid, Empty } from 'antd';
import axios from 'axios';
import { Plus, Send, RefreshCw, Trash2, Pencil, MessageSquare } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;

interface Channel {
  id: string;
  name: string;
  chatId: string;
  isEnabled: boolean;
  events: string[];
  throttleMinutes: number;
  tokenMasked: string;
  lastStatus?: string | null;
  lastError?: string | null;
  lastSentAt?: string | null;
}

/**
 * Tích hợp bot Zalo: khi có việc cần duyệt (đề xuất quán, đánh giá, bình luận, báo cáo…) hệ thống nhắn vào
 * chat/nhóm Zalo. Token lưu mã hoá trong DB, chọn sự kiện nào gửi — tất cả cấu hình động ở đây, không sửa code.
 */
export const AdminIntegrationsPage: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.md;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [events, setEvents] = useState<Array<{ key: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);
  const [chatHints, setChatHints] = useState<Array<{ chatId: string; chatType?: string; from?: string; text?: string }>>([]);
  const [readingUpdates, setReadingUpdates] = useState(false);
  const [checkingToken, setCheckingToken] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/admin/integrations/channels');
      setChannels(res.data?.data?.channels || []);
      setEvents(res.data?.data?.events || []);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không tải được danh sách kênh');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setChatHints([]);
    form.resetFields();
    form.setFieldsValue({ isEnabled: true, throttleMinutes: 0, events: events.map((e) => e.key) });
    setModalOpen(true);
  };

  const openEdit = (ch: Channel) => {
    setEditing(ch);
    setChatHints([]);
    form.resetFields();
    form.setFieldsValue({ name: ch.name, chatId: ch.chatId, isEnabled: ch.isEnabled, events: ch.events, throttleMinutes: ch.throttleMinutes, token: undefined });
    setModalOpen(true);
  };

  const save = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const body: any = { name: values.name, chatId: values.chatId, isEnabled: Boolean(values.isEnabled), events: values.events || [], throttleMinutes: Number(values.throttleMinutes) || 0 };
      if (values.token) body.token = values.token.trim();
      if (editing) await axios.put(`/api/v1/admin/integrations/channels/${editing.id}`, body);
      else await axios.post('/api/v1/admin/integrations/channels', body);
      message.success(editing ? 'Đã cập nhật kênh' : 'Đã thêm kênh Zalo');
      setModalOpen(false);
      load();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không lưu được kênh');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await axios.delete(`/api/v1/admin/integrations/channels/${id}`);
      message.success('Đã xoá kênh');
      load();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không xoá được kênh');
    }
  };

  const sendTest = async (id: string) => {
    try {
      await axios.post(`/api/v1/admin/integrations/channels/${id}/test`);
      message.success('Đã gửi tin nhắn thử — kiểm tra Zalo');
      load();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Gửi thử thất bại');
      load();
    }
  };

  /** Gọi getMe của Zalo để chắc chắn token còn dùng được. */
  const checkToken = async () => {
    const token = form.getFieldValue('token');
    setCheckingToken(true);
    try {
      const res = await axios.post('/api/v1/admin/integrations/zalo/check', token ? { token } : { channelId: editing?.id });
      message.success(res.data?.message || 'Token hợp lệ');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Token không dùng được');
    } finally {
      setCheckingToken(false);
    }
  };

  /** Đọc tin nhắn gần nhất của bot để lấy chat_id (Zalo không cho tra cứu id trực tiếp). */
  const readUpdates = async () => {
    const token = form.getFieldValue('token');
    setReadingUpdates(true);
    try {
      const res = await axios.post('/api/v1/admin/integrations/zalo/updates', token ? { token } : { channelId: editing?.id });
      const chats = res.data?.data?.chats || [];
      setChatHints(chats);
      if (chats.length === 0) message.info('Chưa có tin nhắn nào — hãy nhắn cho bot (hoặc trong nhóm có bot) rồi bấm lại');
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không đọc được tin nhắn của bot');
    } finally {
      setReadingUpdates(false);
    }
  };

  const columns = [
    {
      title: 'Kênh',
      dataIndex: 'name',
      render: (_: any, ch: Channel) => (
        <div>
          <Text strong>{ch.name}</Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              chat_id: {ch.chatId}
            </Text>
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            token: {ch.tokenMasked}
          </Text>
        </div>
      ),
    },
    {
      title: 'Sự kiện gửi',
      dataIndex: 'events',
      render: (evts: string[]) =>
        evts.length === 0 ? (
          <Tag>Tất cả sự kiện</Tag>
        ) : (
          <Space wrap size={[4, 4]}>
            {evts.map((e) => (
              <Tag key={e} style={{ margin: 0 }}>
                {events.find((x) => x.key === e)?.label || e}
              </Tag>
            ))}
          </Space>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isEnabled',
      render: (_: any, ch: Channel) => (
        <Space orientation="vertical" size={2}>
          <Tag color={ch.isEnabled ? 'green' : 'default'}>{ch.isEnabled ? 'Đang bật' : 'Đang tắt'}</Tag>
          {ch.lastStatus === 'OK' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Gửi gần nhất: {ch.lastSentAt ? new Date(ch.lastSentAt).toLocaleString('vi-VN') : '—'}
            </Text>
          )}
          {ch.lastStatus === 'ERROR' && (
            <Text type="danger" style={{ fontSize: 12 }}>
              Lỗi: {ch.lastError}
            </Text>
          )}
          {ch.throttleMinutes > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Gộp tin mỗi {ch.throttleMinutes} phút
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Thao tác',
      render: (_: any, ch: Channel) => (
        <Space wrap>
          <Button size="small" icon={<Send size="1em" />} onClick={() => sendTest(ch.id)} data-testid="btn-test-zalo">
            Gửi thử
          </Button>
          <Button size="small" icon={<Pencil size="1em" />} onClick={() => openEdit(ch)}>
            Sửa
          </Button>
          <Popconfirm title="Xoá kênh này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => remove(ch.id)}>
            <Button size="small" danger icon={<Trash2 size="1em" />}>
              Xoá
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <MessageSquare size="1em" style={{ color: '#2F6B4F', marginRight: 8 }} />
            Thông báo qua bot Zalo
          </Title>
          <Text type="secondary">Có việc cần duyệt là bot nhắn ngay vào nhóm Zalo của ban quản trị.</Text>
        </div>
        <Space wrap>
          <Button icon={<RefreshCw size="1em" />} onClick={load}>
            Làm mới
          </Button>
          <Button type="primary" icon={<Plus size="1em" />} onClick={openCreate} style={{ background: '#2F6B4F' }} data-testid="btn-add-zalo-channel">
            Thêm kênh Zalo
          </Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="Cách lấy token và chat_id"
        description={
          <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            <li>
              Tạo bot tại <Text code>https://zalo.me/s/botcreator/</Text> → lấy <Text strong>token HTTP API</Text>.
            </li>
            <li>Nhắn cho bot (hoặc mời bot vào nhóm rồi nhắn một tin) để bot có dữ liệu.</li>
            <li>
              Bấm <Text strong>Thêm kênh Zalo</Text>, dán token rồi bấm <Text strong>Đọc tin nhắn gần nhất</Text> để chọn đúng chat_id.
            </li>
          </ol>
        }
      />

      <Card>
        {channels.length === 0 && !loading ? (
          <Empty description="Chưa có kênh thông báo nào">
            <Button type="primary" onClick={openCreate} style={{ background: '#2F6B4F' }}>
              Thêm kênh Zalo đầu tiên
            </Button>
          </Empty>
        ) : (
          <Table rowKey="id" loading={loading} dataSource={channels} columns={columns as any} pagination={false} scroll={{ x: 'max-content' }} size={isNarrow ? 'small' : 'middle'} />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? `Sửa kênh: ${editing.name}` : 'Thêm kênh thông báo Zalo'}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Huỷ"
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên kênh" rules={[{ required: true, min: 2, message: 'Đặt tên để phân biệt các nhóm' }]}>
            <Input placeholder="Ví dụ: Nhóm quản trị SSG" />
          </Form.Item>
          <Form.Item
            name="token"
            label={editing ? 'Token bot (để trống nếu không đổi)' : 'Token bot Zalo'}
            rules={editing ? [] : [{ required: true, min: 20, message: 'Dán token HTTP API của bot' }]}
            extra="Token được mã hoá AES-256-GCM trước khi lưu, trang này chỉ hiện dạng che."
          >
            <Input.Password placeholder="1458718293486048817:xxxxxxxxxxxxxxxx" autoComplete="off" />
          </Form.Item>
          <Form.Item name="chatId" label="chat_id (người nhận hoặc nhóm)" rules={[{ required: true, min: 3, message: 'Cần chat_id' }]}>
            <Input placeholder="6ede9afa66b88fe6d6a9" />
          </Form.Item>
          <Space wrap style={{ marginBottom: 12 }}>
            <Button onClick={readUpdates} loading={readingUpdates} data-testid="btn-read-zalo-updates">
              Đọc tin nhắn gần nhất để lấy chat_id
            </Button>
            <Button onClick={checkToken} loading={checkingToken} data-testid="btn-check-zalo-token">
              Kiểm tra token
            </Button>
          </Space>
          {chatHints.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {chatHints.map((c) => (
                <div key={c.chatId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <Tag color={c.chatType === 'GROUP' ? 'blue' : 'default'}>{c.chatType || 'CHAT'}</Tag>
                  <Text code style={{ fontSize: 12 }}>
                    {c.chatId}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12, flex: 1 }} ellipsis>
                    {c.from}: {c.text}
                  </Text>
                  <Button size="small" onClick={() => form.setFieldsValue({ chatId: c.chatId })}>
                    Dùng
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Form.Item name="events" label="Gửi thông báo cho sự kiện">
            <Checkbox.Group>
              <Space orientation="vertical" size={2}>
                {events.map((e) => (
                  <Checkbox key={e.key} value={e.key}>
                    {e.label}
                  </Checkbox>
                ))}
              </Space>
            </Checkbox.Group>
          </Form.Item>
          <Form.Item name="throttleMinutes" label="Gộp tin (phút)" extra="0 = gửi mọi sự kiện ngay. Ví dụ 10 = tối đa 1 tin mỗi 10 phút cho kênh này.">
            <InputNumber min={0} max={1440} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="isEnabled" label="Bật kênh" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
          <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
            Bot chỉ gửi ra Zalo tiêu đề việc cần duyệt và đường dẫn trang quản trị — không gửi nội dung riêng tư của sinh viên.
          </Paragraph>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminIntegrationsPage;
