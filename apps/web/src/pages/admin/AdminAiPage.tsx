import React, { useState, useEffect } from 'react';
import {
  Typography,
  Tabs,
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  InputNumber,
  message,
  Card,
  Popconfirm,
  Badge,
  Descriptions,
  Alert,
} from 'antd';
import axios from 'axios';
import { Plus, Pencil, Trash2, Plug, History, Eye, Headphones, Undo2, ShieldCheck, CircleCheck, CircleX, Zap, RefreshCw } from 'lucide-react';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export const AdminAiPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('providers');

  // Provider state
  const [providers, setProviders] = useState<any[]>([]);
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [providerForm] = Form.useForm();

  // Task config state
  const [taskConfigs, setTaskConfigs] = useState<any[]>([]);
  const [selectedTaskConfig, setSelectedTaskConfig] = useState<any | null>(null);
  const [taskConfigForm] = Form.useForm();

  // Conversation audit & human support state
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [isViewContentModalOpen, setIsViewContentModalOpen] = useState(false);
  const [auditPurpose, setAuditPurpose] = useState('');
  const [humanReplyText, setHumanReplyText] = useState('');
  const [conversationDetail, setConversationDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // 1. Fetch Providers
  const fetchProviders = async () => {
    try {
      const res = await axios.get('/api/v1/admin/ai/providers');
      if (res.data.success) {
        setProviders(res.data.data);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể tải danh sách nhà cung cấp AI');
    }
  };

  // 2. Fetch Task Configs
  const fetchTaskConfigs = async () => {
    try {
      const res = await axios.get('/api/v1/admin/ai/task-configs');
      if (res.data.success) {
        setTaskConfigs(res.data.data);
        if (res.data.data.length > 0) {
          const first = res.data.data[0];
          setSelectedTaskConfig(first);
          taskConfigForm.setFieldsValue({
            activeModelId: first.activeModelId,
            fallbackModelId: first.fallbackModelId,
            systemPrompt: first.systemPrompt,
            maxPlacesInAnswer: first.maxPlacesInAnswer,
          });
        }
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể tải cấu hình tác vụ AI');
    }
  };

  // 3. Fetch Conversations
  const fetchConversations = async () => {
    try {
      const res = await axios.get('/api/v1/admin/ai/conversations');
      if (res.data.success) {
        setConversations(res.data.data);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể tải danh sách hội thoại');
    }
  };

  useEffect(() => {
    fetchProviders();
    fetchTaskConfigs();
    fetchConversations();
  }, []);

  // Provider CRUD
  const handleOpenCreateProvider = () => {
    setEditingProvider(null);
    providerForm.resetFields();
    setTestResult(null);
    setIsProviderModalOpen(true);
  };

  const handleOpenEditProvider = (p: any) => {
    setEditingProvider(p);
    providerForm.setFieldsValue({
      name: p.name,
      adapterType: p.adapterType,
      baseUrl: p.baseUrl,
      isEnabled: p.isEnabled,
      isDefault: p.isDefault,
      models: p.models,
    });
    setTestResult(null);
    setIsProviderModalOpen(true);
  };

  const handleSaveProvider = async (values: any) => {
    try {
      if (editingProvider) {
        await axios.put(`/api/v1/admin/ai/providers/${editingProvider.id}`, values);
        message.success('Đã cập nhật cấu hình nhà cung cấp');
      } else {
        await axios.post('/api/v1/admin/ai/providers', values);
        message.success('Đã thêm nhà cung cấp AI mới');
      }
      setIsProviderModalOpen(false);
      fetchProviders();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khi lưu nhà cung cấp');
    }
  };

  const handleDeleteProvider = async (id: string) => {
    try {
      await axios.delete(`/api/v1/admin/ai/providers/${id}`);
      message.success('Đã xóa nhà cung cấp');
      fetchProviders();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể xóa');
    }
  };

  // Quản lý model của provider: đồng bộ từ API nhà cung cấp, thêm tay, xoá
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);
  const [addModelProviderId, setAddModelProviderId] = useState<string | null>(null);
  const [addModelForm] = Form.useForm();

  const handleSyncModels = async (id: string) => {
    setSyncingProviderId(id);
    try {
      const res = await axios.post(`/api/v1/admin/ai/providers/${id}/sync-models`);
      message.success(res.data.message || 'Đã đồng bộ model');
      fetchProviders();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không đồng bộ được danh sách model');
    } finally {
      setSyncingProviderId(null);
    }
  };

  const handleAddModel = async (values: any) => {
    if (!addModelProviderId) return;
    try {
      await axios.post(`/api/v1/admin/ai/providers/${addModelProviderId}/models`, values);
      message.success('Đã thêm model');
      setAddModelProviderId(null);
      addModelForm.resetFields();
      fetchProviders();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể thêm model');
    }
  };

  const handleDeleteModel = async (providerId: string, modelConfigId: string) => {
    try {
      await axios.delete(`/api/v1/admin/ai/providers/${providerId}/models/${modelConfigId}`);
      message.success('Đã xóa model');
      fetchProviders();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Không thể xóa model');
    }
  };

  const handleTestConnection = async () => {
    const values = providerForm.getFieldsValue();
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/v1/admin/ai/providers/test-connection', {
        baseUrl: values.baseUrl,
        apiKey: values.apiKey,
      });
      setTestResult(res.data);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Lỗi kết nối kiểm tra',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Task Config Save & Rollback
  const handleSaveTaskConfig = async (values: any) => {
    if (!selectedTaskConfig) return;
    try {
      await axios.put(`/api/v1/admin/ai/task-configs/${selectedTaskConfig.id}`, values);
      message.success('Đã cập nhật cấu hình tác vụ và tạo phiên bản mới');
      fetchTaskConfigs();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi cập nhật cấu hình');
    }
  };

  const handleRollbackVersion = async (targetVersion: number) => {
    if (!selectedTaskConfig) return;
    try {
      await axios.post(`/api/v1/admin/ai/task-configs/${selectedTaskConfig.id}/rollback`, { targetVersion });
      message.success(`Đã khôi phục về phiên bản v${targetVersion}`);
      fetchTaskConfigs();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi khôi phục');
    }
  };

  // Conversation Detail View with Purpose Audit
  const handleOpenConversationDetail = (conv: any) => {
    setSelectedConversation(conv);
    setAuditPurpose('');
    setConversationDetail(null);
    setIsViewContentModalOpen(true);
  };

  const handleConfirmViewContent = async () => {
    if (!auditPurpose.trim() || auditPurpose.trim().length < 5) {
      message.warning('Vui lòng nhập lý do kiểm tra / hỗ trợ (tối thiểu 5 ký tự)');
      return;
    }
    setIsLoadingDetail(true);
    try {
      const res = await axios.post(`/api/v1/admin/ai/conversations/${selectedConversation.id}/view-content`, {
        purpose: auditPurpose.trim(),
      });
      if (res.data.success) {
        setConversationDetail(res.data.data);
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi xem nội dung');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSendHumanReply = async () => {
    if (!humanReplyText.trim() || !conversationDetail) return;
    try {
      const res = await axios.post(`/api/v1/admin/ai/conversations/${conversationDetail.id}/reply-human`, {
        content: humanReplyText.trim(),
      });
      if (res.data.success) {
        message.success('Đã gửi tin nhắn hỗ trợ trực tiếp');
        setConversationDetail({
          ...conversationDetail,
          messages: [...conversationDetail.messages, res.data.data],
          status: 'HUMAN_ACTIVE',
        });
        setHumanReplyText('');
        fetchConversations();
      }
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi gửi tin nhắn');
    }
  };

  const handleReturnToAi = async () => {
    if (!conversationDetail) return;
    try {
      await axios.post(`/api/v1/admin/ai/conversations/${conversationDetail.id}/return-to-ai`);
      message.success('Đã chuyển hội thoại về Trợ lý AI');
      setConversationDetail({
        ...conversationDetail,
        status: 'AI_ACTIVE',
      });
      fetchConversations();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Lỗi chuyển chế độ');
    }
  };

  // Available models flat list
  const allAvailableModels = providers
    .filter((p) => p.isEnabled)
    .flatMap((p) =>
      p.models.map((m: any) => ({
        id: m.id,
        name: `${m.displayName} (${p.name})`,
      })),
    );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Trợ lý AI & nhà cung cấp
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Nhà cung cấp & model, ngắt mạch, phiên bản prompt và giám sát hội thoại.
          </Paragraph>
        </div>
      </div>

      {/* Trạng thái model đang phục vụ chat sinh viên — để admin biết ngay model nào đang chạy */}
      {(() => {
        const chatTask = taskConfigs.find((t) => t.taskType === 'STUDENT_CHAT') ?? taskConfigs[0];
        const findModel = (id?: string | null) => {
          for (const p of providers) {
            const m = p.models?.find((x: any) => x.id === id);
            if (m) return `${m.displayName} (${p.name})`;
          }
          return null;
        };
        const primary = chatTask ? findModel(chatTask.activeModelId) : null;
        const fallback = chatTask ? findModel(chatTask.fallbackModelId) : null;
        return (
          <Alert
            style={{ marginBottom: 16 }}
            type={primary ? 'success' : 'warning'}
            showIcon
            title={primary ? 'Model đang dùng cho chat sinh viên' : 'Chat sinh viên chưa được gắn model'}
            description={
              <div>
                {primary ? (
                  <div style={{ marginBottom: 6 }}>
                    <Tag color="green">Chính: {primary}</Tag>
                    {fallback ? <Tag>Dự phòng: {fallback}</Tag> : <Tag color="warning">Chưa có dự phòng</Tag>}
                  </div>
                ) : (
                  <div style={{ marginBottom: 6 }}>Thêm nhà cung cấp, đồng bộ model rồi chọn ở tab "Tác vụ & prompt".</div>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Đổi model: "Đồng bộ model" hoặc "Thêm model" ở bảng dưới, rồi chọn Model chính / dự phòng trong tab "Tác vụ & prompt" và Lưu.
                  Mỗi lần lưu tạo một phiên bản cấu hình mới.
                </Text>
                <div style={{ marginTop: 8 }}>
                  <Button size="small" type="primary" onClick={() => setActiveTab('task-configs')}>
                    Đổi model chat
                  </Button>
                </div>
              </div>
            }
          />
        );
      })()}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'providers',
            label: (
              <span>
                <Plug size="1em" /> Nhà cung cấp & ngắt mạch
              </span>
            ),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                  <Button type="primary" icon={<Plus size="1em" />} onClick={handleOpenCreateProvider}>
                    Thêm Nhà Cung Cấp AI
                  </Button>
                </div>

                <Table
                  dataSource={providers}
                  rowKey="id"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  columns={[
                    {
                      title: 'Nhà cung cấp',
                      width: 220,
                      dataIndex: 'name',
                      key: 'name',
                      render: (text, record) => (
                        <div style={{ whiteSpace: 'nowrap' }}>
                          <div>
                            <Text strong>{text}</Text>
                            {record.isDefault && (
                              <Tag color="green" style={{ marginLeft: 6 }}>
                                Mặc định
                              </Tag>
                            )}
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.adapterType}
                          </Text>
                        </div>
                      ),
                    },
                    {
                      title: 'Base URL & API Key',
                      width: 260,
                      key: 'endpoint',
                      render: (_, record) => (
                        <Space orientation="vertical" size={2}>
                          <Text code style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                            {record.baseUrl || 'Mặc định nhà cung cấp'}
                          </Text>
                          <Space size={4}>
                            <ShieldCheck size="1em" style={{ color: '#52c41a' }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Key: {record.maskedApiKey}
                            </Text>
                          </Space>
                        </Space>
                      ),
                    },
                    {
                      title: 'Ngắt mạch',
                      width: 140,
                      key: 'circuit',
                      render: (_, record) => {
                        const state = record.circuitStatus?.state || 'CLOSED';
                        const failures = record.circuitStatus?.consecutiveFailures || 0;
                        let color = 'success';
                        let label = 'Hoạt động (CLOSED)';

                        if (state === 'OPEN') {
                          color = 'error';
                          label = 'Ngắt mạch (OPEN)';
                        } else if (state === 'HALF_OPEN') {
                          color = 'warning';
                          label = 'Đang thử nghiệm (HALF_OPEN)';
                        }

                        return (
                          <Space orientation="vertical" size={2}>
                            <Badge status={color as any} text={label} />
                            {failures > 0 && (
                              <Text type="danger" style={{ fontSize: 11 }}>
                                Lỗi liên tiếp: {failures}/3
                              </Text>
                            )}
                          </Space>
                        );
                      },
                    },
                    {
                      title: 'Models',
                      width: 300,
                      dataIndex: 'models',
                      key: 'models',
                      render: (models, record) => (
                        <Space wrap size={[4, 4]}>
                          {models.length === 0 && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Chưa có model — bấm "Đồng bộ model" hoặc "Thêm model"
                            </Text>
                          )}
                          {models.map((m: any) => {
                            // Đánh dấu model đang được tác vụ chat dùng để admin biết model nào đang chạy
                            const asPrimary = taskConfigs
                              .filter((t) => t.activeModelId === m.id)
                              .map((t) => t.taskType);
                            const asFallback = taskConfigs
                              .filter((t) => t.fallbackModelId === m.id)
                              .map((t) => t.taskType);
                            const inUse = asPrimary.length > 0 || asFallback.length > 0;
                            const tagTitle =
                              asPrimary.length > 0
                                ? `Model CHÍNH của tác vụ: ${asPrimary.join(', ')}`
                                : asFallback.length > 0
                                  ? `Model DỰ PHÒNG của tác vụ: ${asFallback.join(', ')}`
                                  : 'Chưa gắn cho tác vụ nào — đổi ở tab "Cấu Hình Tác Vụ"';
                            return (
                              <Popconfirm
                                key={m.id}
                                title={`Xóa model "${m.displayName}"?`}
                                onConfirm={() => handleDeleteModel(record.id, m.id)}
                                okText="Xóa"
                                cancelText="Hủy"
                                disabled={inUse}
                              >
                                <Tag
                                  color={asPrimary.length > 0 ? 'green' : asFallback.length > 0 ? 'gold' : 'geekblue'}
                                  closable={!inUse}
                                  onClose={(e) => e.preventDefault()}
                                  title={tagTitle}
                                >
                                  {asPrimary.length > 0 ? '★ ' : ''}
                                  {m.displayName}
                                  {asPrimary.length > 0
                                    ? '· đang dùng cho Chat'
                                    : asFallback.length > 0
                                      ? '· dự phòng'
                                      : ''}
                                </Tag>
                              </Popconfirm>
                            );
                          })}
                        </Space>
                      ),
                    },
                    {
                      title: 'Bật/Tắt',
                      width: 90,
                      dataIndex: 'isEnabled',
                      key: 'isEnabled',
                      render: (enabled) => (
                        <Tag color={enabled ? 'green' : 'default'}>{enabled ? 'Kích hoạt' : 'Tạm tắt'}</Tag>
                      ),
                    },
                    {
                      title: 'Thao Tác',
                      key: 'actions',
                      render: (_, record) => (
                        <Space>
                          <Button size="small" icon={<Pencil size="1em" />} onClick={() => handleOpenEditProvider(record)}>
                            Sửa
                          </Button>
                          <Button
                            size="small"
                            icon={<RefreshCw size="1em" />}
                            loading={syncingProviderId === record.id}
                            disabled={record.adapterType === 'MOCK'}
                            title={
                              record.adapterType === 'MOCK'
                                ? 'Adapter mock không có endpoint liệt kê model'
                                : 'Lấy danh sách model từ API của nhà cung cấp (dùng API key đã lưu)'
                            }
                            onClick={() => handleSyncModels(record.id)}
                          >
                            Đồng bộ model
                          </Button>
                          <Button
                            size="small"
                            icon={<Plus size="1em" />}
                            onClick={() => {
                              setAddModelProviderId(record.id);
                              addModelForm.resetFields();
                            }}
                          >
                            Thêm model
                          </Button>
                          <Popconfirm
                            title="Xác nhận xóa nhà cung cấp này?"
                            onConfirm={() => handleDeleteProvider(record.id)}
                            okText="Xóa"
                            cancelText="Hủy"
                          >
                            <Button size="small" danger icon={<Trash2 size="1em" />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'task-configs',
            label: (
              <span>
                <History size="1em" /> Tác vụ & prompt
              </span>
            ),
            children: (
              <div>
                <Card title="Cấu hình Tác vụ: Tư vấn Sinh viên (STUDENT_CHAT)" style={{ marginBottom: 24 }}>
                  <Form form={taskConfigForm} layout="vertical" onFinish={handleSaveTaskConfig}>
                    <Space style={{ display: 'flex', width: '100%' }} size={16}>
                      <Form.Item
                        name="activeModelId"
                        label="Model Chính (Primary Model)"
                        rules={[{ required: true, message: 'Chọn model chính' }]}
                        style={{ flex: 1 }}
                      >
                        <Select placeholder="Chọn model chính">
                          {allAvailableModels.map((m) => (
                            <Option key={m.id} value={m.id}>
                              {m.name}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>

                      <Form.Item name="fallbackModelId" label="Model Dự Phòng (Fallback Model)" style={{ flex: 1 }}>
                        <Select placeholder="Chọn model dự phòng" allowClear>
                          {allAvailableModels.map((m) => (
                            <Option key={m.id} value={m.id}>
                              {m.name}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>

                      <Form.Item
                        name="maxPlacesInAnswer"
                        label="Số quán tối đa trong câu trả lời"
                        style={{ width: 220 }}
                      >
                        <InputNumber min={1} max={10} style={{ width: '100%' }} />
                      </Form.Item>
                    </Space>

                    <Form.Item
                      name="systemPrompt"
                      label="System Prompt (Lời nhắc chỉ dẫn cho AI)"
                      rules={[{ required: true, min: 10, message: 'System prompt tối thiểu 10 ký tự' }]}
                    >
                      <TextArea rows={5} placeholder="Nhập system prompt..." />
                    </Form.Item>

                    <Button type="primary" htmlType="submit">
                      Lưu & Xuất Bản Phiên Bản Mới
                    </Button>
                  </Form>
                </Card>

                {selectedTaskConfig && (
                  <Card title={`Lịch sử các phiên bản Prompt (${selectedTaskConfig.versions?.length || 0} phiên bản)`}>
                    <Table
                      dataSource={selectedTaskConfig.versions}
                      rowKey="id"
                      columns={[
                        {
                          title: 'Phiên bản',
                          dataIndex: 'version',
                          key: 'version',
                          render: (v) => (
                            <Tag color={v === selectedTaskConfig.promptVersion ? 'green' : 'default'}>v{v}</Tag>
                          ),
                        },
                        {
                          title: 'Nội dung System Prompt',
                          dataIndex: 'systemPrompt',
                          key: 'systemPrompt',
                          ellipsis: true,
                        },
                        {
                          title: 'Ngày tạo',
                          dataIndex: 'createdAt',
                          key: 'createdAt',
                          render: (d) => new Date(d).toLocaleString('vi-VN'),
                        },
                        {
                          title: 'Thao tác',
                          key: 'actions',
                          render: (_: any, record: any) =>
                            record.version !== selectedTaskConfig.promptVersion && (
                              <Button
                                size="small"
                                icon={<Undo2 size="1em" />}
                                onClick={() => handleRollbackVersion(record.version)}
                              >
                                Khôi phục v{record.version}
                              </Button>
                            ),
                        },
                      ]} scroll={{ x: 'max-content' }} />
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: 'conversations',
            label: (
              <span>
                <Headphones size="1em" /> Giám sát hội thoại
              </span>
            ),
            children: (
              <div>
                <Table
                  dataSource={conversations}
                  rowKey="id"
                  columns={[
                    {
                      title: 'Tiêu Đề & Người Dùng',
                      key: 'user',
                      render: (_, record) => (
                        <Space orientation="vertical" size={2}>
                          <Text strong>{record.title || 'Hội thoại không tên'}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.user?.username || 'Ẩn danh'} ({record.user?.email || 'N/A'})
                          </Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Trạng Thái',
                      dataIndex: 'status',
                      key: 'status',
                      render: (status) => {
                        let color = 'blue';
                        let text = 'Trợ lý AI';
                        if (status === 'HUMAN_WAITING') {
                          color = 'orange';
                          text = 'Chờ tiếp nhận';
                        } else if (status === 'HUMAN_ACTIVE') {
                          color = 'green';
                          text = 'Đang hỗ trợ trực tiếp';
                        }
                        return <Tag color={color}>{text}</Tag>;
                      },
                    },
                    {
                      title: 'Model & Token',
                      key: 'model',
                      render: (_, record) => (
                        <Space orientation="vertical" size={2}>
                          <Text>{record.lastModelUsed}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.totalTokens} tokens
                          </Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Đánh Giá',
                      dataIndex: 'feedback',
                      key: 'feedback',
                      render: (f) =>
                        f === 'HELPFUL' ? (
                          <Tag color="green">Hữu ích</Tag>
                        ) : f === 'UNHELPFUL' ? (
                          <Tag color="red">Chưa tốt</Tag>
                        ) : (
                          <Text type="secondary">-</Text>
                        ),
                    },
                    {
                      title: 'Thời Gian',
                      dataIndex: 'updatedAt',
                      key: 'updatedAt',
                      render: (d) => new Date(d).toLocaleString('vi-VN'),
                    },
                    {
                      title: 'Thao Tác',
                      key: 'actions',
                      render: (_, record) => (
                        <Button
                          type="primary"
                          size="small"
                          icon={<Eye size="1em" />}
                          onClick={() => handleOpenConversationDetail(record)}
                        >
                          Mở Chi Tiết
                        </Button>
                      ),
                    },
                  ]} scroll={{ x: 'max-content' }} />
              </div>
            ),
          },
        ]}
      />

      {/* Modal Thêm model thủ công cho một nhà cung cấp */}
      <Modal
        title="Thêm model thủ công"
        open={addModelProviderId !== null}
        onCancel={() => setAddModelProviderId(null)}
        footer={null}
        width={480}
      >
        <Form form={addModelForm} layout="vertical" onFinish={handleAddModel}>
          <Form.Item
            name="modelId"
            label="Model ID (đúng tên nhà cung cấp dùng, ví dụ deepseek-chat, gpt-4o-mini, gemini-2.5-flash)"
            rules={[{ required: true, message: 'Nhập model ID' }]}
          >
            <Input placeholder="deepseek-chat" />
          </Form.Item>
          <Form.Item name="displayName" label="Tên hiển thị (tuỳ chọn)">
            <Input placeholder="DeepSeek Chat" />
          </Form.Item>
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setAddModelProviderId(null)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              Thêm
            </Button>
          </Space>
        </Form>
      </Modal>

      {/* Modal Thêm / Sửa Nhà Cung Cấp */}
      <Modal
        title={editingProvider ? 'Sửa Nhà Cung Cấp AI' : 'Thêm Nhà Cung Cấp AI'}
        open={isProviderModalOpen}
        onCancel={() => setIsProviderModalOpen(false)}
        footer={null}
        width={650}
      >
        <Form form={providerForm} layout="vertical" onFinish={handleSaveProvider}>
          <Form.Item
            name="name"
            label="Tên Nhà Cung Cấp"
            rules={[{ required: true, message: 'Nhập tên nhà cung cấp' }]}
          >
            <Input placeholder="Ví dụ: OpenAI Production, Anthropic Claude..." />
          </Form.Item>

          <Space orientation="horizontal" style={{ width: '100%' }} size={16}>
            <Form.Item
              name="adapterType"
              label="Loại Adapter"
              rules={[{ required: true, message: 'Chọn loại adapter' }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="Chọn Adapter">
                <Option value="OPENAI">OpenAI</Option>
                <Option value="ANTHROPIC">Anthropic Claude</Option>
                <Option value="GOOGLE">Google Gemini</Option>
                <Option value="OPENAI_COMPATIBLE">OpenAI Compatible (Groq, vLLM, DeepSeek...)</Option>
                <Option value="MOCK">Mock Local (Kiểm thử)</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="apiKey"
              label={editingProvider ? 'Đổi API Key (Key Rotation)' : 'API Key'}
              rules={editingProvider ? [] : [{ required: true, message: 'Nhập API key' }]}
              style={{ flex: 1 }}
            >
              <Input.Password placeholder={editingProvider ? 'Để trống nếu không đổi' : 'sk-...'} />
            </Form.Item>
          </Space>

          <Form.Item
            name="baseUrl"
            label="Base URL (Chống SSRF, yêu cầu HTTPS)"
            extra="Hệ thống tự động ngăn chặn kết nối tới mạng nội bộ, localhost và cloud metadata."
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Space size={24} style={{ marginBottom: 16 }}>
            <Space>
              <Form.Item name="isEnabled" valuePropName="checked" initialValue={true} noStyle>
                <Switch />
              </Form.Item>
              <span>Kích hoạt</span>
            </Space>

            <Space>
              <Form.Item name="isDefault" valuePropName="checked" initialValue={false} noStyle>
                <Switch />
              </Form.Item>
              <span>Đặt làm mặc định</span>
            </Space>
          </Space>

          {/* Test Connection Button */}
          <div style={{ marginBottom: 20, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Button icon={<Zap size="1em" />} onClick={handleTestConnection} loading={isTesting}>
                Kiểm Tra Kết Nối (Ping Endpoint)
              </Button>

              {testResult && (
                <div style={{ marginTop: 8 }}>
                  {testResult.success ? (
                    <Tag color="success" icon={<CircleCheck size="1em" />}>
                      {testResult.message}
                    </Tag>
                  ) : (
                    <Tag color="error" icon={<CircleX size="1em" />}>
                      {testResult.message}
                    </Tag>
                  )}
                </div>
              )}
            </Space>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsProviderModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              Lưu Cấu Hình
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Xem Nội Dung Hội Thoại (Audit Log Purpose Enforced) */}
      <Modal
        title="Chi Tiết Hội Thoại & Hỗ Trợ Trực Tiếp"
        open={isViewContentModalOpen}
        onCancel={() => setIsViewContentModalOpen(false)}
        footer={null}
        width={750}
      >
        {!conversationDetail ? (
          <div>
            <Paragraph>
              <strong>Chính sách Bảo mật Quyền Riêng Tư:</strong> Nội dung hội thoại của sinh viên được bảo vệ. Để xem
              toàn bộ tin nhắn, quản trị viên bắt buộc phải nhập lý do kiểm toán.
            </Paragraph>
            <Form.Item label="Lý do kiểm tra / xử lý vé hỗ trợ (Audit Purpose)">
              <Input
                placeholder="Ví dụ: Xử lý khiếu nại báo lỗi sinh viên..."
                value={auditPurpose}
                onChange={(e) => setAuditPurpose(e.target.value)}
              />
            </Form.Item>
            <Button
              type="primary"
              onClick={handleConfirmViewContent}
              loading={isLoadingDetail}
              disabled={!auditPurpose.trim()}
            >
              Xác Nhận & Mở Nội Dung
            </Button>
          </div>
        ) : (
          <div>
            <Descriptions size="small" bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Người dùng">
                {conversationDetail.user.username} ({conversationDetail.user.email})
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={conversationDetail.status === 'HUMAN_ACTIVE' ? 'green' : 'blue'}>
                  {conversationDetail.status}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {/* Messages Thread */}
            <div
              style={{
                maxHeight: 360,
                overflowY: 'auto',
                padding: 12,
                background: '#fafafa',
                borderRadius: 8,
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {conversationDetail.messages.map((m: any) => (
                <div
                  key={m.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: m.role === 'USER' ? '#e6f4ff' : m.role === 'ADMIN' ? '#fff7e6' : '#fff',
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 12 }}>
                      {m.role === 'USER' ? 'Sinh viên' : m.role === 'ADMIN' ? 'Quản trị viên' : 'Trợ lý AI'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(m.createdAt).toLocaleTimeString('vi-VN')}
                    </Text>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{m.content}</div>
                </div>
              ))}
            </div>

            {/* Human Take-over Input */}
            <Space orientation="vertical" style={{ width: '100%' }}>
              <TextArea
                rows={2}
                placeholder="Nhập nội dung phản hồi trực tiếp cho sinh viên..."
                value={humanReplyText}
                onChange={(e) => setHumanReplyText(e.target.value)}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button onClick={handleReturnToAi}>Chuyển Lại Về Trợ Lý AI</Button>
                <Button type="primary" icon={<Headphones size="1em" />} onClick={handleSendHumanReply}>
                  Gửi Phản Hồi Trực Tiếp
                </Button>
              </div>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminAiPage;
