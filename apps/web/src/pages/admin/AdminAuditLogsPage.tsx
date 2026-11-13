import React, { useState, useEffect } from 'react';
import { Table, Tag, Typography, Card, Input } from 'antd';
import axios from 'axios';
import { Search } from 'lucide-react';

const { Title, Paragraph, Text } = Typography;

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorType: string;
  actorId?: string;
  actor?: {
    username: string;
    displayName?: string;
    role: string;
  };
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export const AdminAuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchLogs = async (currentPage = 1, currentSearch = '') => {
    try {
      setLoading(true);
      const url = `/api/v1/admin/audit-logs?page=${currentPage}&limit=15${
        currentSearch ? `&search=${encodeURIComponent(currentSearch)}` : ''
      }`;
      const res = await axios.get(url);
      if (res.data.success && res.data.data) {
        setLogs(res.data.data.logs || []);
        setTotal(res.data.data.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page, search);
  }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs(1, search);
  };

  const getActionColor = (action: string) => {
    if (action.includes('APPROVE') || action.includes('CREATE')) return 'green';
    if (action.includes('REJECT') || action.includes('DELETE')) return 'red';
    if (action.includes('UPDATE') || action.includes('MODIFY')) return 'blue';
    return 'default';
  };

  const columns = [
    {
      title: 'Thời Gian',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (t: string) => (
        <Text style={{ fontSize: 13 }}>{new Date(t).toLocaleString('vi-VN')}</Text>
      ),
      width: 170,
    },
    {
      title: 'Hành Động',
      dataIndex: 'action',
      key: 'action',
      render: (action: string) => <Tag color={getActionColor(action)}>{action}</Tag>,
      width: 180,
    },
    {
      title: 'Đối Tượng',
      key: 'entity',
      render: (_: unknown, r: AuditLogItem) => (
        <div>
          <Tag color="green">{r.entityType}</Tag>
          {r.entityId && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
              ID: {r.entityId}
            </Text>
          )}
        </div>
      ),
      width: 180,
    },
    {
      title: 'Người Thực Hiện',
      key: 'actor',
      render: (_: unknown, r: AuditLogItem) => (
        <div>
          <Text strong>{r.actor?.displayName || r.actor?.username || r.actorId || 'Hệ thống'}</Text>
          {r.actor?.role && (
            <Tag color={r.actor.role === 'ADMIN' ? 'gold' : 'blue'} style={{ marginLeft: 4 }}>
              {r.actor.role}
            </Tag>
          )}
        </div>
      ),
      width: 180,
    },
    {
      title: 'Chi Tiết / Metadata',
      key: 'metadata',
      render: (_: unknown, r: AuditLogItem) => (
        <div>
          {r.ipAddress && (
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>
              IP: {r.ipAddress}
            </div>
          )}
          {r.metadata && Object.keys(r.metadata).length > 0 && (
            <pre
              style={{
                fontSize: 11,
                background: '#fafafa',
                padding: 4,
                borderRadius: 4,
                maxHeight: 80,
                maxWidth: 420,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                overflow: 'auto',
                margin: '4px 0 0 0',
              }}
            >
              {JSON.stringify(r.metadata, null, 2)}
            </pre>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Nhật ký hệ thống
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0 0' }}>
            Lưu vết toàn bộ thao tác quản trị, thay đổi dữ liệu và quyết định kiểm duyệt để đảm bảo tính minh bạch.
          </Paragraph>
        </div>
        <Input.Search
          placeholder="Tìm kiếm nhật ký..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={handleSearch}
          style={{ width: 280 }}
          enterButton={<Search size="1em" />}
        />
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={logs}
          columns={columns}
          loading={loading}
          pagination={{
            current: page,
            pageSize: 15,
            total,
            onChange: (p) => setPage(p),
          }} scroll={{ x: 'max-content' }} />
      </Card>
    </div>
  );
};
export default AdminAuditLogsPage;
