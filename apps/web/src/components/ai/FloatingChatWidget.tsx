import { LiteMarkdown } from './LiteMarkdown';
import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  Input,
  Card,
  Typography,
  Space,
  Tag,
  Avatar,
  message as antMessage,
  Modal,
  Tooltip,
  Badge,
  Popconfirm,
} from 'antd';
import { motion } from 'framer-motion';
import { Bot, BotMessageSquare, X, Send, Ban, ThumbsUp, ThumbsDown, Headphones, Plus, TriangleAlert, Lock, RefreshCw, History, Trash2 } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { io } from 'socket.io-client';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

interface MessageItem {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'ADMIN';
  content: string;
  sequenceNumber: number;
  status: 'STREAMING' | 'COMPLETED' | 'INTERRUPTED' | 'FAILED';
  modelName?: string;
  feedback?: 'HELPFUL' | 'UNHELPFUL' | null;
  errorMessage?: string;
  sources?: Array<{
    id?: string;
    slug?: string;
    name?: string;
    address?: string | null;
    ratingOverall?: number | null;
    coverUrl?: string | null;
  }> | null;
  createdAt: string;
}

interface ConversationItem {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  lastMessage?: string;
}

export const FloatingChatWidget: React.FC = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsSmallScreen(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  // Danh sách hội thoại cũ: chọn lại hoặc xoá (trước đây chỉ tự động mở hội thoại mới nhất, không xoá được)
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [aiReadyStatus, setAiReadyStatus] = useState<{ ready: boolean; reason?: string }>({ ready: true });
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [activeMode, setActiveMode] = useState<string>('AI_ACTIVE');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Kiểm tra trạng thái AI readiness
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await axios.get('/api/v1/ai/status');
        if (res.data.success) {
          setAiReadyStatus(res.data.data);
        }
      } catch {
        setAiReadyStatus({ ready: false, reason: 'Không thể kết nối máy chủ AI' });
      }
    };
    checkStatus();
  }, []);

  // Khởi tạo Socket.IO cho user
  useEffect(() => {
    if (!user) return;

    const s = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    s.on('chat.message.started', (data: any) => {
      if (data.conversationId === activeConversationId) {
        setIsGenerating(true);
        setCurrentAttemptId(data.attemptId);
      }
    });

    s.on('chat.message.delta', (data: any) => {
      if (data.conversationId === activeConversationId) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === data.messageId);
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              content: updated[idx].content + data.textDelta,
              status: 'STREAMING',
            };
            return updated;
          } else {
            return [
              ...prev,
              {
                id: data.messageId,
                role: 'ASSISTANT',
                content: data.textDelta,
                sequenceNumber: 999,
                status: 'STREAMING',
                createdAt: new Date().toISOString(),
              },
            ];
          }
        });
      }
    });

    s.on('chat.message.completed', (data: any) => {
      if (data.conversationId === activeConversationId) {
        setIsGenerating(false);
        setCurrentAttemptId(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? { ...m, content: data.content, status: 'COMPLETED', sources: data.sources ?? m.sources }
              : m,
          ),
        );
      }
    });

    s.on('chat.message.interrupted', (data: any) => {
      if (data.conversationId === activeConversationId) {
        setIsGenerating(false);
        setCurrentAttemptId(null);
        setMessages((prev) =>
          prev.map((m) => (m.id === data.messageId ? { ...m, content: data.content, status: 'INTERRUPTED' } : m)),
        );
      }
    });

    s.on('chat.message.failed', (data: any) => {
      if (data.conversationId === activeConversationId) {
        setIsGenerating(false);
        setCurrentAttemptId(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? {
                  ...m,
                  content: m.content || '',
                  status: 'FAILED',
                  errorMessage: data.message || data.error || 'Trợ lý AI gặp lỗi, hãy thử lại.',
                }
              : m,
          ),
        );
      }
    });

    s.on('chat.message.human', (data: any) => {
      if (data.conversationId === activeConversationId) {
        setMessages((prev) => [...prev, data.message]);
        setActiveMode('HUMAN_ACTIVE');
      }
    });

    s.on('chat.mode.changed', (data: any) => {
      if (data.conversationId === activeConversationId) {
        setActiveMode(data.status);
      }
    });

    return () => {
      s.disconnect();
    };
  }, [user, activeConversationId]);

  // Lấy danh sách hội thoại
  const loadConversations = async () => {
    if (!user) return;
    try {
      const res = await axios.get('/api/v1/ai/conversations');
      if (res.data.success) {
        setConversations(res.data.data);
        if (res.data.data.length > 0 && !activeConversationId) {
          setActiveMode(res.data.data[0].status || 'AI_ACTIVE');
          selectConversation(res.data.data[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      loadConversations();
    }
  }, [isOpen, user]);

  const selectConversation = async (convId: string) => {
    setActiveConversationId(convId);
    // Chế độ (AI / người thật) lấy từ trạng thái hội thoại đã lưu, không mặc định AI_ACTIVE
    const conv = conversations.find((c) => c.id === convId);
    setActiveMode((conv as any)?.status || 'AI_ACTIVE');
    try {
      const res = await axios.get(`/api/v1/ai/conversations/${convId}/messages`);
      if (res.data.success) {
        setMessages(res.data.data);
      }
    } catch (err: any) {
      antMessage.error(err.response?.data?.message || 'Không thể tải tin nhắn');
    }
  };

  /** Xoá một hội thoại cũ (kèm toàn bộ tin nhắn). */
  const deleteConversation = async (convId: string) => {
    try {
      await axios.delete(`/api/v1/ai/conversations/${convId}`);
      const rest = conversations.filter((c) => c.id !== convId);
      setConversations(rest);
      antMessage.success('Đã xoá hội thoại');
      if (activeConversationId === convId) {
        setActiveConversationId(null);
        setMessages([]);
        if (rest.length > 0) selectConversation(rest[0].id);
      }
    } catch (err: any) {
      antMessage.error(err.response?.data?.message || 'Không xoá được hội thoại');
    }
  };

  /** Xoá toàn bộ lịch sử chat của mình. */
  const deleteAllConversations = async () => {
    try {
      await Promise.all(conversations.map((c) => axios.delete(`/api/v1/ai/conversations/${c.id}`)));
      setConversations([]);
      setActiveConversationId(null);
      setMessages([]);
      antMessage.success('Đã xoá toàn bộ lịch sử chat');
    } catch (err: any) {
      antMessage.error(err.response?.data?.message || 'Không xoá được lịch sử');
    }
  };

  const createNewConversation = async () => {
    if (!user) return;
    try {
      const res = await axios.post('/api/v1/ai/conversations', { title: 'Tư vấn không gian học tập mới' });
      if (res.data.success) {
        const newConv = res.data.data;
        setConversations([newConv, ...conversations]);
        setActiveConversationId(newConv.id);
        setMessages([]);
        setActiveMode('AI_ACTIVE');
      }
    } catch (err: any) {
      antMessage.error(err.response?.data?.message || 'Không thể tạo hội thoại');
    }
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputText.trim();
    if (!textToSend || isGenerating) return;

    if (!user) {
      antMessage.warning('Vui lòng đăng nhập để trò chuyện cùng Trợ lý AI');
      return;
    }

    if (!(user as any).aiPrivacyConsentAccepted) {
      setPrivacyModalVisible(true);
      return;
    }

    let convId = activeConversationId;
    if (!convId) {
      try {
        const createRes = await axios.post('/api/v1/ai/conversations', { title: textToSend.slice(0, 30) });
        convId = createRes.data.data.id;
        setActiveConversationId(convId);
        setConversations([createRes.data.data, ...conversations]);
      } catch {
        antMessage.error('Không thể tạo hội thoại');
        return;
      }
    }

    const tempUserMsg: MessageItem = {
      id: 'temp-user-' + Date.now(),
      role: 'USER',
      content: textToSend,
      sequenceNumber: messages.length + 1,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setInputText('');
    setIsGenerating(true);

    const idempotencyKey = `user-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await axios.post(`/api/v1/ai/conversations/${convId}/messages`, {
        content: textToSend,
        idempotencyKey,
      });

      if (res.data.success && res.data.data.attempt) {
        setCurrentAttemptId(res.data.data.attempt.id);
      } else {
        // Không có attempt AI (đang ở chế độ người thật hỗ trợ): tin đã lưu, không hiển thị trạng thái 'đang trả lời'
        setIsGenerating(false);
        if (res.data.data?.userMessage)
          setMessages((prev) => prev.map((m) => (m.id === tempUserMsg.id ? { ...res.data.data.userMessage } : m)));
      }
    } catch (err: any) {
      setIsGenerating(false);
      const errMsg = err.response?.data?.message || 'Lỗi gửi tin nhắn';
      antMessage.error(errMsg);
    }
  };

  const handleStopStream = async () => {
    if (!currentAttemptId) return;
    try {
      await axios.post(`/api/v1/ai/attempts/${currentAttemptId}/stop`);
      setIsGenerating(false);
      antMessage.info('Đã dừng tạo phản hồi');
    } catch {
      // ignore
    }
  };

  const handleRetry = async (messageId: string) => {
    if (isGenerating || !user) return;
    setIsGenerating(true);
    const idempotencyKey = `retry-${messageId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    try {
      const res = await axios.post(`/api/v1/ai/messages/${messageId}/retry`, {
        idempotencyKey,
      });
      if (res.data.success && res.data.data.attempt) {
        setCurrentAttemptId(res.data.data.attempt.id);
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content: '', status: 'STREAMING' } : m)));
      }
    } catch (err: any) {
      setIsGenerating(false);
      const errMsg = err.response?.data?.message || 'Lỗi khi thử lại';
      antMessage.error(errMsg);
    }
  };

  const handleFeedback = async (messageId: string, feedback: 'HELPFUL' | 'UNHELPFUL') => {
    try {
      await axios.post(`/api/v1/ai/messages/${messageId}/feedback`, { feedback });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
      antMessage.success('Cảm ơn đánh giá của bạn!');
    } catch {
      antMessage.error('Không thể gửi đánh giá');
    }
  };

  const handleRequestHuman = async () => {
    if (!activeConversationId) return;
    try {
      await axios.post(`/api/v1/ai/conversations/${activeConversationId}/request-human`);
      setActiveMode('HUMAN_WAITING');
      antMessage.success('Đã gửi yêu cầu kết nối quản trị viên. Chúng tôi sẽ phản hồi sớm!');
    } catch (err: any) {
      antMessage.error(err.response?.data?.message || 'Không thể yêu cầu hỗ trợ');
    }
  };

  const acceptPrivacyConsent = async () => {
    try {
      await axios.post('/api/v1/ai/consent');
      if (user) {
        (user as any).aiPrivacyConsentAccepted = true;
      }
      setPrivacyModalVisible(false);
      antMessage.success('Đã xác nhận điều khoản quyền riêng tư');
      if (inputText.trim()) {
        handleSend();
      }
    } catch {
      antMessage.error('Không thể xác nhận điều khoản');
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <motion.div
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}
      >
        <Badge dot={!aiReadyStatus.ready} status={aiReadyStatus.ready ? 'processing' : 'error'}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            data-testid="btn-open-chat"
            aria-label="Trợ lý AI"
            style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6F4E37 0%, #4A2E18 100%)',
              border: '2px solid #FFFDF9',
              boxShadow: '0 8px 24px rgba(74, 46, 24, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
            }}
          >
            {isOpen ? <X size={24} /> : <BotMessageSquare size={26} strokeWidth={2} />}
          </button>
        </Badge>
      </motion.div>

      {/* Floating Chat Drawer / Panel */}
      {isOpen && (
        <Card
          style={{
            position: 'fixed',
            // Mobile: chiếm toàn màn hình (nút nổi vẫn ở dưới để đóng). Desktop: panel góc phải.
            bottom: isSmallScreen ? 0 : 90,
            right: isSmallScreen ? 0 : 24,
            left: isSmallScreen ? 0 : undefined,
            top: isSmallScreen ? 0 : undefined,
            width: isSmallScreen ? '100vw' : 'min(440px, 92vw)',
            height: isSmallScreen ? '100dvh' : 'min(640px, 80vh)',
            zIndex: 1000,
            borderRadius: isSmallScreen ? 0 : 16,
            boxShadow: '0 12px 36px rgba(74, 46, 24, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #EAE3D9',
          }}
          styles={{
            body: {
              padding: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
            },
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 18px',
              background: 'linear-gradient(135deg, #4A2E18 0%, #6F4E37 100%)',
              color: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space direction="horizontal" size={10}>
              <Avatar style={{ backgroundColor: '#FAF7F2', color: '#6F4E37' }} icon={<Bot size={18} />} />
              <div>
                <Title level={5} style={{ color: '#fff', margin: 0, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Trợ Lý StudyMap
                </Title>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>
                  {activeMode === 'HUMAN_ACTIVE'
                    ? 'Quản trị viên đang hỗ trợ'
                    : activeMode === 'HUMAN_WAITING'
                      ? 'Đang chờ quản trị viên tiếp nhận'
                      : aiReadyStatus.ready
                        ? 'Tư vấn không gian học bài & cà phê'
                        : 'Hệ thống đang bảo trì'}
                </Text>
              </div>
            </Space>

            <Space>
              <Tooltip title="Hội thoại cũ">
                <Button
                  type="text"
                  shape="circle"
                  icon={<History size="1em" style={{ color: '#fff' }} />}
                  onClick={() => {
                    loadConversations();
                    setHistoryOpen((v) => !v);
                  }}
                  data-testid="btn-chat-history"
                />
              </Tooltip>
              <Tooltip title="Tạo hội thoại mới">
                <Button
                  type="text"
                  shape="circle"
                  icon={<Plus size="1em" style={{ color: '#fff' }} />}
                  onClick={createNewConversation}
                />
              </Tooltip>
              <Tooltip title="Cần hỗ trợ từ quản trị viên">
                <Button
                  type="text"
                  shape="circle"
                  icon={<Headphones size="1em" style={{ color: '#fff' }} />}
                  onClick={handleRequestHuman}
                />
              </Tooltip>
              <Button
                type="text"
                shape="circle"
                icon={<X size={18} style={{ color: '#fff' }} />}
                onClick={() => setIsOpen(false)}
              />
            </Space>
          </div>

          {/* Danh sách hội thoại cũ: chọn lại / xoá từng cái / xoá tất cả */}
          {historyOpen && (
            <div style={{ borderBottom: '1px solid #E8E6E1', background: '#FAF9F6', maxHeight: 220, overflowY: 'auto' }} data-testid="chat-history-list">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
                <Text strong style={{ fontSize: 13 }}>
                  Hội thoại của bạn ({conversations.length})
                </Text>
                {conversations.length > 0 && (
                  <Popconfirm title="Xoá toàn bộ lịch sử chat?" okText="Xoá hết" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={deleteAllConversations}>
                    <Button size="small" type="text" danger data-testid="btn-chat-clear-all">
                      Xoá tất cả
                    </Button>
                  </Popconfirm>
                )}
              </div>
              {conversations.length === 0 ? (
                <div style={{ padding: '4px 12px 12px' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Chưa có hội thoại nào.
                  </Text>
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      background: c.id === activeConversationId ? '#EEF6F1' : 'transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      selectConversation(c.id);
                      setHistoryOpen(false);
                    }}
                    data-testid="chat-history-item"
                  >
                    <Text ellipsis style={{ flex: 1, fontSize: 13 }}>
                      {c.title || 'Hội thoại'}
                    </Text>
                    <Popconfirm
                      title="Xoá hội thoại này?"
                      okText="Xoá"
                      cancelText="Huỷ"
                      okButtonProps={{ danger: true }}
                      onConfirm={(e) => {
                        (e as any)?.stopPropagation?.();
                        deleteConversation(c.id);
                      }}
                    >
                      <Button size="small" type="text" danger icon={<Trash2 size="1em" />} data-testid="btn-chat-delete" onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Banner cảnh báo readiness */}
          {!aiReadyStatus.ready && (
            <div
              style={{
                padding: '8px 16px',
                background: '#fff2f0',
                borderBottom: '1px solid #ffccc7',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <TriangleAlert size="1em" style={{ color: '#B5484D' }} />
              <Text type="danger" style={{ fontSize: 12 }}>
                {aiReadyStatus.reason || 'Trợ lý AI đang tạm dừng.'}
              </Text>
            </div>
          )}

          {/* Danh sách tin nhắn */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              background: '#F7F6F3',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 32, padding: '0 8px' }}>
                <Bot size={44} color="#6F4E37" />
                <Title level={5} style={{ marginTop: 12, color: '#4A2E18' }}>
                  Chào bạn! Cần tìm góc học bài hay cà phê nào?
                </Title>
                <Paragraph type="secondary" style={{ fontSize: 13, maxWidth: 320, margin: '0 auto', color: '#7A6C60' }}>
                  Hỏi mình về các quán cà phê có ổ cắm, Wi-Fi mạnh, mở cửa 24/7 hoặc có phòng học nhóm quanh trường nhé!
                </Paragraph>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
                  {[
                    'Quán cà phê mở 24/7 học bài đêm gần KHTN',
                    'Quán có nhiều ổ cắm sạc laptop và Wi-Fi mạnh',
                    'Quán cà phê có bàn lớn hoặc phòng riêng học nhóm',
                    'Quán cà phê nào có giảm giá cho sinh viên?',
                    'So sánh The Coffee House và Cà phê Cú Đêm',
                  ].map((s, idx) => (
                    <Button
                      key={idx}
                      size="small"
                      style={{ textAlign: 'left', borderRadius: 20, borderColor: '#EAE3D9', color: '#4A2E18' }}
                      onClick={() => handleSend(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isUser = m.role === 'USER';
                const isAdmin = m.role === 'ADMIN';

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    {!isUser && (
                      <Avatar
                        size="small"
                        icon={isAdmin ? <Headphones size="1em" /> : <Bot size={14} />}
                        style={{
                          backgroundColor: isAdmin ? '#C67D34' : '#6F4E37',
                          marginTop: 4,
                        }}
                      />
                    )}

                    <div
                      style={{
                        maxWidth: '82%',
                        padding: '10px 14px',
                        borderRadius: 14,
                        background: isUser ? '#6F4E37' : isAdmin ? '#FFF9F2' : '#FFFFFF',
                        color: isUser ? '#fff' : '#261C14',
                        boxShadow: '0 1px 4px rgba(74,46,24,0.06)',
                        border: isAdmin ? '1px solid #FFD591' : '1px solid #EAE3D9',
                        wordBreak: 'break-word',
                      }}
                    >
                      {isAdmin && (
                        <div style={{ marginBottom: 4 }}>
                          <Tag color="orange">Quản trị viên SSG</Tag>
                        </div>
                      )}

                      <div style={{ whiteSpace: isUser ? 'pre-wrap' : 'normal', fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>
                        {isUser ? m.content : <LiteMarkdown text={m.content} />}
                        {m.status === 'STREAMING' && (
                          <span style={{ display: 'inline-block', marginLeft: 4, animation: 'blink 1s infinite' }}>
                            ▋
                          </span>
                        )}
                      </div>

                      {/* Footer tin nhắn AI */}
                      {!isUser && !isAdmin && m.status === 'COMPLETED' && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: 8,
                            paddingTop: 6,
                            borderTop: '1px solid #EEECE7',
                            fontSize: 11,
                          }}
                        >
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {m.modelName || 'Trợ lý AI SSG'}
                          </Text>

                          <Space size={4}>
                            <Button
                              type="text"
                              size="small"
                              icon={
                                <ThumbsUp size="1em" style={{ color: m.feedback === 'HELPFUL' ? '#3B7D5C' : undefined }} />
                              }
                              onClick={() => handleFeedback(m.id, 'HELPFUL')}
                            />
                            <Button
                              type="text"
                              size="small"
                              icon={
                                <ThumbsDown size="1em"
                                  style={{ color: m.feedback === 'UNHELPFUL' ? '#B5484D' : undefined }}
                                />
                              }
                              onClick={() => handleFeedback(m.id, 'UNHELPFUL')}
                            />
                          </Space>
                        </div>
                      )}

                      {/* Thẻ quán trích từ kết quả tool (nguồn) — bấm mở hồ sơ quán */}
                      {!isUser && !isAdmin && Array.isArray(m.sources) && m.sources.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Nguồn: {m.sources.length} quán đã kiểm duyệt
                          </Text>
                          {m.sources.slice(0, 3).map((src, i) => (
                            <a
                              key={src.slug || src.id || i}
                              href={src.slug ? '/places/' + src.slug : '#'}
                              style={{
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                                border: '1px solid #E8E6E1',
                                borderRadius: 8,
                                padding: 6,
                                background: '#FFFFFF',
                                color: '#1F2421',
                                textDecoration: 'none',
                              }}
                            >
                              {src.coverUrl ? (
                                <img
                                  src={src.coverUrl}
                                  alt=""
                                  style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }}
                                />
                              ) : (
                                <div style={{ width: 40, height: 40, borderRadius: 6, background: '#EEECE7' }} />
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 13,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {src.name || src.slug}
                                </div>
                                <div style={{ fontSize: 11, color: '#6F6B66' }}>
                                  {src.address || 'Chưa có địa chỉ'}
                                  {typeof src.ratingOverall === 'number' && src.ratingOverall > 0
                                    ? ' · ★ ' + src.ratingOverall
                                    : ''}
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Footer tin nhắn AI khi bị ngắt hoặc lỗi -> Nút Thử lại */}
                      {!isUser && !isAdmin && (m.status === 'INTERRUPTED' || m.status === 'FAILED') && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: 8,
                            paddingTop: 6,
                            borderTop: '1px solid #ffccc7',
                            fontSize: 11,
                          }}
                        >
                          <Text type="danger" style={{ fontSize: 11 }}>
                            {m.status === 'INTERRUPTED'
                              ? 'Đã dừng phản hồi'
                              : `${m.errorMessage || 'Lỗi tạo phản hồi'}`}
                          </Text>
                          <Button
                            size="small"
                            type="primary"
                            ghost
                            icon={<RefreshCw size="1em" />}
                            onClick={() => handleRetry(m.id)}
                            disabled={isGenerating}
                            style={{ borderRadius: 12, fontSize: 11, height: 24, padding: '0 8px' }}
                          >
                            Thử lại
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input */}
          <div style={{ padding: '12px 16px', background: '#fff', borderTop: '1px solid #EEECE7' }}>
            {isGenerating && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                <Button
                  size="small"
                  danger
                  icon={<Ban size="1em" />}
                  onClick={handleStopStream}
                  style={{ borderRadius: 16 }}
                >
                  Dừng phản hồi
                </Button>
              </div>
            )}

            <Space.Compact style={{ width: '100%' }}>
              <TextArea
                rows={1}
                autoSize={{ minRows: 1, maxRows: 3 }}
                placeholder={
                  activeMode === 'HUMAN_ACTIVE'
                    ? 'Bạn đang trong phiên trao đổi với quản trị viên...'
                    : 'Hỏi về quán café, chỗ học bài quanh trường...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isGenerating || !aiReadyStatus.ready}
              />
              <Button
                type="primary"
                icon={<Send size={15} />}
                onClick={() => handleSend()}
                loading={isGenerating}
                disabled={!inputText.trim() || !aiReadyStatus.ready}
                style={{ height: 'auto', background: '#6F4E37', borderColor: '#6F4E37' }}
              />
            </Space.Compact>
          </div>
        </Card>
      )}

      {/* Modal Privacy Consent */}
      <Modal
        title={
          <Space>
            <Lock size="1em" style={{ color: '#2F6B4F' }} />
            <span>Điều Khoản Quyền Riêng Tư & An Toàn AI</span>
          </Space>
        }
        open={privacyModalVisible}
        onCancel={() => setPrivacyModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setPrivacyModalVisible(false)}>
            Để sau
          </Button>,
          <Button key="accept" type="primary" onClick={acceptPrivacyConsent}>
            Tôi đồng ý và tiếp tục
          </Button>,
        ]}
      >
        <Paragraph>
          Hệ thống <strong>Trợ lý AI StudyMap</strong> sử dụng dữ liệu quán thực tế đã được kiểm duyệt công khai để hỗ trợ
          bạn tìm không gian học bài tốt nhất.
        </Paragraph>
        <Paragraph>
          <strong>Cam kết quyền riêng tư:</strong>
          <ul>
            <li>Không lưu trữ mật khẩu, mã xác thực hay dữ liệu nhạy cảm vào ngữ cảnh AI.</li>
            <li>Nội dung hội thoại chỉ được lưu trữ nhằm phục vụ phiên hỏi đáp cá nhân và xử lý khiếu nại (nếu có).</li>
            <li>
              Mọi truy cập kiểm tra của quản trị viên đều bắt buộc nhập mục đích và ghi vết nhật ký kiểm toán (Audit
              Log).
            </li>
          </ul>
        </Paragraph>
      </Modal>
    </>
  );
};

export default FloatingChatWidget;
