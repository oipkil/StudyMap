import React, { useState, useEffect, useMemo } from 'react';
import { Table, Typography, Button, Tag, Space, Modal, Form, Input, Select, Switch, message, Card, Divider, Popconfirm, Segmented, Tooltip } from 'antd';
import { DataType } from '@ssg/shared';
import { Plus, History, Trash2, EyeOff } from 'lucide-react';

const { Title, Text } = Typography;

interface DynamicFieldVersion {
  id: string;
  version: number;
  label: string;
  dataType: string;
  unit?: string;
  options: string[];
  createdAt: string;
}

interface DynamicField {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  dataType: string;
  currentVersion: number;
  isRequired: boolean;
  isFilterable: boolean;
  isComparable: boolean;
  isPublic: boolean;
  fieldGroup?: { id: string; key: string; label: string; sortOrder: number } | null;
  categoryBindings?: Array<{ category: { id: string; name: string } }>;
  versions: DynamicFieldVersion[];
  createdAt: string;
}

interface FieldGroup {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
  fieldCount?: number;
}

/** Tên tiếng Việt cho kiểu dữ liệu (chỉ hiển thị; giá trị vẫn là enum). */
const TYPE_LABEL: Record<string, string> = {
  TEXT: 'Chữ ngắn',
  LONG_TEXT: 'Đoạn văn',
  RICH_TEXT: 'Văn bản định dạng',
  NUMBER: 'Số',
  NUMBER_WITH_UNIT: 'Số có đơn vị',
  CURRENCY: 'Tiền (VND)',
  RANGE: 'Khoảng (từ – đến)',
  SELECT_ONE: 'Chọn một',
  SELECT_MANY: 'Chọn nhiều',
  BOOLEAN_TRI_STATE: 'Có / Không / Chưa rõ',
  DATE: 'Ngày',
  TIME: 'Giờ',
  SAFE_LINK: 'Đường dẫn',
  IMAGE: 'Ảnh',
  GALLERY: 'Bộ ảnh',
  TABLE: 'Bảng',
  REPEATER: 'Danh sách mục (repeater)',
};

const slugKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

/**
 * Quản lý trường động: mọi thông tin một quán có thể có (Wi-Fi, ổ cắm, thanh toán, liên hệ...).
 * Trường được nhóm (Không gian, Học tập, Đồ uống...) và hiện ở tab "Tiện ích chi tiết" của form quán + trang công khai.
 */
export const AdminDynamicFieldsPage: React.FC = () => {
  const [fields, setFields] = useState<DynamicField[]>([]);
  const [groups, setGroups] = useState<FieldGroup[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<DynamicField | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [createForm] = Form.useForm();
  const dataType = Form.useWatch('dataType', createForm);
  const groupMode = Form.useWatch('groupMode', createForm);

  const csrf = () => document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] ?? '';

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [f, g, c] = await Promise.all([
        fetch('/api/v1/admin/field-definitions', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/v1/admin/field-definitions/groups', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/v1/admin/reference/categories', { credentials: 'include' }).then((r) => r.json()),
      ]);
      if (f.success) setFields([...f.data].reverse()); // API trả mới nhất trước -> hiện theo thứ tự tạo
      if (g.success) setGroups(g.data);
      if (c.success) setCategories((c.data || []).filter((x: any) => x.isActive));
      return f.success ? (f.data as DynamicField[]).length : 0;
    } catch {
      message.error('Không thể tải danh sách trường động');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCreate = async (values: any) => {
    const body: Record<string, unknown> = {
      key: values.key,
      label: values.label,
      description: values.description || undefined,
      dataType: values.dataType,
      unit: values.unit || undefined,
      options: values.options || [],
      isFilterable: Boolean(values.isFilterable),
      isComparable: Boolean(values.isComparable),
      isRequired: Boolean(values.isRequired),
      isPublic: values.isPublic !== false,
      categoryIds: values.categoryIds && values.categoryIds.length ? values.categoryIds : categories.map((c) => c.id),
    };
    if (values.groupMode === 'new' && values.newGroupLabel) {
      body.fieldGroupKey = slugKey(values.newGroupLabel);
      body.fieldGroupLabel = values.newGroupLabel;
      body.fieldGroupSortOrder = groups.length + 1;
    } else if (values.fieldGroupId) {
      body.fieldGroupId = values.fieldGroupId;
    }
    try {
      const res = await fetch('/api/v1/admin/field-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf() },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        message.success(`Đã tạo trường '${values.label}' (phiên bản 1)`);
        setIsCreateModalOpen(false);
        createForm.resetFields();
        // Trường mới nằm cuối danh sách (thứ tự tạo) -> nhảy tới trang cuối để thấy ngay
        setGroupFilter('all');
        const total = await fetchAll();
        setPage(Math.max(1, Math.ceil((total || 1) / PAGE_SIZE)));
      } else {
        message.error(json.message || 'Lỗi khi tạo trường động');
      }
    } catch {
      message.error('Lỗi kết nối máy chủ');
    }
  };

  const archive = async (id: string) => {
    const res = await fetch(`/api/v1/admin/field-definitions/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf() }, credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) {
      message.success('Đã lưu trữ trường (dữ liệu cũ của quán vẫn giữ nguyên)');
      fetchAll();
    } else message.error(json.message || 'Không lưu trữ được');
  };

  const shown = useMemo(() => (groupFilter === 'all' ? fields : fields.filter((f) => (f.fieldGroup?.key || '_other') === groupFilter)), [fields, groupFilter]);
  const groupOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fields) counts.set(f.fieldGroup?.key || '_other', (counts.get(f.fieldGroup?.key || '_other') || 0) + 1);
    const opts = [{ label: `Tất cả (${fields.length})`, value: 'all' }];
    for (const g of [...groups].sort((a, b) => a.sortOrder - b.sortOrder)) if (counts.get(g.key)) opts.push({ label: `${g.label} (${counts.get(g.key)})`, value: g.key });
    if (counts.get('_other')) opts.push({ label: `Chưa có nhóm (${counts.get('_other')})`, value: '_other' });
    return opts;
  }, [fields, groups]);

  const columns = [
    {
      title: 'Trường',
      key: 'label',
      render: (_: any, record: DynamicField) => (
        <div style={{ minWidth: 200 }}>
          <Space size={6} wrap>
            <Text strong>{record.label}</Text>
            {!record.isPublic && (
              <Tooltip title="Chỉ admin thấy — không hiện trên trang công khai">
                <Tag icon={<EyeOff size="1em" />} color="default">
                  Nội bộ
                </Tag>
              </Tooltip>
            )}
          </Space>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <code>{record.key}</code> · v{record.currentVersion}
            </Text>
          </div>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {record.description}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: 'Nhóm',
      key: 'group',
      width: 180,
      render: (_: any, record: DynamicField) => (record.fieldGroup ? <Tag color="green">{record.fieldGroup.label}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: 'Kiểu dữ liệu',
      dataIndex: 'dataType',
      key: 'dataType',
      width: 200,
      render: (type: string, record: DynamicField) => {
        const v = record.versions?.[0];
        return (
          <div>
            <Tag color={type === DataType.REPEATER ? 'purple' : type === DataType.TABLE ? 'magenta' : 'cyan'}>{TYPE_LABEL[type] || type}</Tag>
            {v?.unit && <Text type="secondary" style={{ fontSize: 12 }}>đơn vị: {v.unit}</Text>}
            {v?.options?.length ? (
              <div style={{ marginTop: 4, maxWidth: 260 }}>
                {v.options.slice(0, 5).map((o) => (
                  <Tag key={o} style={{ marginBottom: 2 }}>
                    {o}
                  </Tag>
                ))}
                {v.options.length > 5 && <Text type="secondary">+{v.options.length - 5}</Text>}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: 'Thuộc tính',
      key: 'attributes',
      width: 200,
      render: (_: any, record: DynamicField) => (
        <Space wrap size={4}>
          {record.isFilterable && <Tag color="green">Lọc</Tag>}
          {record.isComparable && <Tag color="gold">So sánh</Tag>}
          {record.isRequired && <Tag color="red">Bắt buộc</Tag>}
          {record.categoryBindings && record.categoryBindings.length > 0 && record.categoryBindings.length < categories.length && (
            <Tooltip title={record.categoryBindings.map((b) => b.category.name).join(', ')}>
              <Tag>{record.categoryBindings.length} danh mục</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 150,
      render: (_: any, record: DynamicField) => (
        <Space>
          <Button
            size="small"
            icon={<History size="1em" />}
            onClick={() => {
              setSelectedField(record);
              setIsVersionModalOpen(true);
            }}
          >
            v{record.versions?.length || 1}
          </Button>
          <Popconfirm title="Lưu trữ trường này? Quán đã nhập vẫn giữ dữ liệu, chỉ không nhập mới." onConfirm={() => archive(record.id)} okText="Lưu trữ" cancelText="Hủy">
            <Button size="small" danger icon={<Trash2 size="1em" />} aria-label="Lưu trữ" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const needsOptions = dataType === DataType.SELECT_ONE || dataType === DataType.SELECT_MANY;
  const needsUnit = dataType === DataType.NUMBER || dataType === DataType.NUMBER_WITH_UNIT || dataType === DataType.CURRENCY || dataType === DataType.RANGE;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Trường thông tin động
          </Title>
          <Text type="secondary">Mọi thông tin một quán có thể có. Admin thêm/ẩn trường ở đây — form sửa quán (tab "Tiện ích chi tiết") và trang công khai tự cập nhật.</Text>
        </div>
        <Button type="primary" icon={<Plus size="1em" />} onClick={() => setIsCreateModalOpen(true)}>
          Thêm trường
        </Button>
      </div>

      <div style={{ marginBottom: 12, overflowX: 'auto' }}>
        <Segmented size="small" options={groupOptions} value={groupFilter} onChange={(v) => { setGroupFilter(String(v)); setPage(1); }} />
      </div>

      <Table dataSource={shown} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: PAGE_SIZE, size: 'small', current: page, onChange: setPage }} scroll={{ x: 'max-content' }} size="small" />

      {/* Modal tạo trường động mới */}
      <Modal
        title="Thêm trường thông tin"
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        okText="Tạo trường"
        cancelText="Hủy"
        width={640}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} initialValues={{ dataType: DataType.BOOLEAN_TRI_STATE, isFilterable: false, isPublic: true, groupMode: 'existing' }}>
          <Form.Item name="label" label="Tên hiển thị" rules={[{ required: true, message: 'Nhập tên trường' }]}>
            <Input
              placeholder="Ví dụ: Có bàn cờ / board game"
              onChange={(e) => {
                if (!createForm.isFieldTouched('key')) createForm.setFieldValue('key', slugKey(e.target.value));
              }}
            />
          </Form.Item>
          <Form.Item name="key" label="Mã trường (tự sinh, chữ thường + gạch dưới)" rules={[{ required: true, pattern: /^[a-z0-9_]{2,50}$/, message: 'Chỉ chữ thường, số, gạch dưới' }]}>
            <Input placeholder="has_board_games" />
          </Form.Item>
          <Form.Item name="description" label="Gợi ý cho người nhập (không bắt buộc)">
            <Input placeholder="Ví dụ: Để trống nếu không chắc" maxLength={255} />
          </Form.Item>

          <Form.Item name="dataType" label="Kiểu dữ liệu" rules={[{ required: true }]}>
            <Select options={Object.values(DataType).map((t) => ({ value: t, label: `${TYPE_LABEL[t] || t} (${t})` }))} showSearch optionFilterProp="label" />
          </Form.Item>
          {needsOptions && (
            <Form.Item name="options" label="Các lựa chọn" rules={[{ required: true, message: 'Nhập ít nhất một lựa chọn' }]} extra="Gõ rồi Enter để thêm từng lựa chọn">
              <Select mode="tags" tokenSeparators={[',']} placeholder="Ví dụ: Tiền mặt, Momo, Chuyển khoản" open={false} />
            </Form.Item>
          )}
          {needsUnit && (
            <Form.Item name="unit" label="Đơn vị tính">
              <Input placeholder="Ví dụ: Mbps, chỗ, giờ, %, VND" />
            </Form.Item>
          )}

          <Form.Item label="Nhóm hiển thị">
            <Form.Item name="groupMode" noStyle>
              <Segmented
                size="small"
                options={[
                  { label: 'Nhóm có sẵn', value: 'existing' },
                  { label: 'Tạo nhóm mới', value: 'new' },
                ]}
              />
            </Form.Item>
            <div style={{ marginTop: 8 }}>
              {groupMode === 'new' ? (
                <Form.Item name="newGroupLabel" noStyle rules={[{ required: true, message: 'Nhập tên nhóm' }]}>
                  <Input placeholder="Tên nhóm mới, ví dụ: Giải trí & sự kiện" />
                </Form.Item>
              ) : (
                <Form.Item name="fieldGroupId" noStyle>
                  <Select allowClear placeholder="Chọn nhóm" options={[...groups].sort((a, b) => a.sortOrder - b.sortOrder).map((g) => ({ value: g.id, label: g.label }))} />
                </Form.Item>
              )}
            </div>
          </Form.Item>

          <Form.Item name="categoryIds" label="Áp dụng cho danh mục quán" extra="Để trống = mọi danh mục">
            <Select mode="multiple" allowClear placeholder="Tất cả danh mục" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>

          <Space size={24} wrap>
            <Form.Item name="isPublic" label="Hiện công khai" valuePropName="checked" tooltip="Tắt = chỉ admin thấy (ghi chú nội bộ của nhóm khảo sát)">
              <Switch />
            </Form.Item>
            <Form.Item name="isFilterable" label="Cho phép lọc" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isComparable" label="Cho phép so sánh" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isRequired" label="Bắt buộc nhập" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Modal xem lịch sử phiên bản trường */}
      <Modal
        title={`Lịch sử phiên bản: ${selectedField?.label} (${selectedField?.key})`}
        open={isVersionModalOpen}
        onCancel={() => setIsVersionModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsVersionModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={700}
      >
        <Text type="secondary">Mỗi lần đổi cấu hình / lựa chọn, một phiên bản mới được lưu để dữ liệu quán đã nhập theo phiên bản cũ không bị đổi nghĩa.</Text>
        <Divider />
        <Space orientation="vertical" style={{ width: '100%' }}>
          {selectedField?.versions.map((ver) => (
            <Card key={ver.id} size="small" style={{ marginBottom: 8, background: ver.version === selectedField.currentVersion ? '#f6ffed' : '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <Tag color={ver.version === selectedField.currentVersion ? 'green' : 'default'}>
                    v{ver.version} {ver.version === selectedField.currentVersion && '(hiện hành)'}
                  </Tag>
                  <Text strong>{ver.label}</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {new Date(ver.createdAt).toLocaleString('vi-VN')}
                </Text>
              </div>
              <div style={{ marginTop: 8 }}>
                <Tag>{TYPE_LABEL[ver.dataType] || ver.dataType}</Tag>
                {ver.unit && <Tag>đơn vị: {ver.unit}</Tag>}
                {ver.options?.length ? <Text type="secondary">Lựa chọn: {ver.options.join(', ')}</Text> : null}
              </div>
            </Card>
          ))}
        </Space>
      </Modal>
    </div>
  );
};

export default AdminDynamicFieldsPage;
