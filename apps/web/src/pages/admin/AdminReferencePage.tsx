import React, { useEffect, useState } from 'react';
import { Typography, Card, Tabs, Table, Button, Space, Modal, Form, Input, InputNumber, Switch, Tag, Popconfirm, message } from 'antd';
import axios from 'axios';
import { LocationPickerMap } from '../../components/map/LocationPickerMap';
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';

const { Title, Paragraph, Text } = Typography;

interface Campus {
  id: string;
  name: string;
  universityName: string;
  address: string;
  latitude: number;
  longitude: number;
  placeCount?: number;
}
interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  placeCount?: number;
}

/** Quản lý dữ liệu tham chiếu: cơ sở trường (dùng cho bộ lọc, AI, form quán) và danh mục quán. */
export const AdminReferencePage: React.FC = () => {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [campusModal, setCampusModal] = useState<{ open: boolean; editing?: Campus | null }>({ open: false });
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; editing?: Category | null }>({ open: false });
  const [campusForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, k] = await Promise.all([axios.get('/api/v1/admin/reference/campuses'), axios.get('/api/v1/admin/reference/categories')]);
      setCampuses(c.data?.data || []);
      setCategories(k.data?.data || []);
    } catch {
      message.error('Không tải được dữ liệu tham chiếu');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openCampus = (editing?: Campus) => {
    campusForm.resetFields();
    if (editing) campusForm.setFieldsValue(editing);
    setCampusModal({ open: true, editing: editing || null });
  };
  const saveCampus = async () => {
    let values: any;
    try {
      values = await campusForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (campusModal.editing) await axios.put(`/api/v1/admin/reference/campuses/${campusModal.editing.id}`, values);
      else await axios.post('/api/v1/admin/reference/campuses', values);
      message.success('Đã lưu cơ sở trường');
      setCampusModal({ open: false });
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };
  const deleteCampus = async (id: string) => {
    try {
      await axios.delete(`/api/v1/admin/reference/campuses/${id}`);
      message.success('Đã xoá');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Không xoá được');
    }
  };

  const openCategory = (editing?: Category) => {
    categoryForm.resetFields();
    if (editing) categoryForm.setFieldsValue(editing);
    else categoryForm.setFieldsValue({ isActive: true, sortOrder: categories.length });
    setCategoryModal({ open: true, editing: editing || null });
  };
  const saveCategory = async () => {
    let values: any;
    try {
      values = await categoryForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (categoryModal.editing) await axios.put(`/api/v1/admin/reference/categories/${categoryModal.editing.id}`, values);
      else await axios.post('/api/v1/admin/reference/categories', values);
      message.success('Đã lưu danh mục');
      setCategoryModal({ open: false });
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };
  const deleteCategory = async (id: string) => {
    try {
      await axios.delete(`/api/v1/admin/reference/categories/${id}`);
      message.success('Đã xoá');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Không xoá được');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          Cơ sở trường & danh mục quán
        </Title>
        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
          Dữ liệu dùng cho bộ lọc, form thêm quán, gợi ý của sinh viên và trợ lý AI. Không có giá trị nào được cài cứng trong mã.
        </Paragraph>
      </div>

      <Tabs
        items={[
          {
            key: 'campuses',
            label: `Cơ sở trường (${campuses.length})`,
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
                  <Button type="primary" icon={<Plus size="1em" />} onClick={() => openCampus()}>
                    Thêm cơ sở
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={campuses}
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: 'Cơ sở', dataIndex: 'name', render: (t: string, r: Campus) => (<div><Text strong>{t}</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>{r.universityName}</Text></div>) },
                    { title: 'Địa chỉ', dataIndex: 'address', ellipsis: true, width: 320 },
                    { title: 'Toạ độ', render: (_: unknown, r: Campus) => <Text code style={{ fontSize: 12 }}>{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</Text> },
                    { title: 'Quán', dataIndex: 'placeCount', width: 70, render: (n: number) => n || 0 },
                    {
                      title: '',
                      width: 110,
                      render: (_: unknown, r: Campus) => (
                        <Space>
                          <Button size="small" icon={<Pencil size="1em" />} onClick={() => openCampus(r)} />
                          <Popconfirm title="Xoá cơ sở này?" onConfirm={() => deleteCampus(r.id)} okText="Xoá" cancelText="Hủy">
                            <Button size="small" danger icon={<Trash2 size="1em" />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'categories',
            label: `Danh mục quán (${categories.length})`,
            children: (
              <Card styles={{ body: { padding: 0 } }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
                  <Button type="primary" icon={<Plus size="1em" />} onClick={() => openCategory()}>
                    Thêm danh mục
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  loading={loading}
                  dataSource={categories}
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  columns={[
                    { title: 'Tên', dataIndex: 'name', render: (t: string, r: Category) => (<div><Text strong>{t}</Text><br /><Text type="secondary" style={{ fontSize: 12 }}>/{r.slug}</Text></div>) },
                    { title: 'Mô tả', dataIndex: 'description', ellipsis: true, width: 300, render: (t: string) => t || <Text type="secondary">—</Text> },
                    { title: 'Thứ tự', dataIndex: 'sortOrder', width: 80 },
                    { title: 'Trạng thái', dataIndex: 'isActive', width: 110, render: (v: boolean) => (v ? <Tag color="green">Đang dùng</Tag> : <Tag>Đã ẩn</Tag>) },
                    { title: 'Quán', dataIndex: 'placeCount', width: 70, render: (n: number) => n || 0 },
                    {
                      title: '',
                      width: 110,
                      render: (_: unknown, r: Category) => (
                        <Space>
                          <Button size="small" icon={<Pencil size="1em" />} onClick={() => openCategory(r)} />
                          <Popconfirm title="Xoá danh mục này?" onConfirm={() => deleteCategory(r.id)} okText="Xoá" cancelText="Hủy">
                            <Button size="small" danger icon={<Trash2 size="1em" />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Modal cơ sở trường */}
      <Modal
        open={campusModal.open}
        title={campusModal.editing ? 'Sửa cơ sở trường' : 'Thêm cơ sở trường'}
        onCancel={() => setCampusModal({ open: false })}
        onOk={saveCampus}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={campusForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="Vị trí trên bản đồ" required extra="Tìm tên trường / KTX (hoặc dán link Google Maps), rồi kéo ghim nếu cần. Không phải gõ kinh độ/vĩ độ.">
            <Form.Item noStyle shouldUpdate={(a, b) => a.latitude !== b.latitude || a.longitude !== b.longitude}>
              {({ getFieldValue, setFieldsValue }) => {
                const lat = Number(getFieldValue('latitude'));
                const lng = Number(getFieldValue('longitude'));
                const has = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
                return (
                  <LocationPickerMap
                    value={has ? { latitude: lat, longitude: lng } : null}
                    height={220}
                    searchPlaceholder="Ví dụ: Đại học Bách Khoa, KTX Khu A…"
                    onChange={(pos, meta) => {
                      const patch: Record<string, unknown> = { latitude: pos.latitude, longitude: pos.longitude };
                      if (meta.address && (meta.source === 'search' || !getFieldValue('address'))) patch.address = meta.address;
                      if (meta.name && meta.source === 'search' && !getFieldValue('name')) patch.name = meta.name;
                      setFieldsValue(patch);
                    }}
                  />
                );
              }}
            </Form.Item>
          </Form.Item>
          <Form.Item name="name" label="Tên cơ sở" rules={[{ required: true, min: 2, message: 'Nhập tên cơ sở' }]}>
            <Input placeholder="ĐH Bách Khoa - Cơ sở 1" />
          </Form.Item>
          <Form.Item name="universityName" label="Trường / hệ thống" rules={[{ required: true, min: 2, message: 'Nhập tên trường' }]}>
            <Input placeholder="ĐHQG-HCM" />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ" rules={[{ required: true, min: 3, message: 'Nhập địa chỉ' }]}>
            <Input prefix={<MapPin size="1em" />} />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="latitude" label="Vĩ độ" rules={[{ required: true, message: 'Chọn vị trí trên bản đồ' }]} style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber style={{ width: '100%' }} step={0.0001} size="small" />
            </Form.Item>
            <Form.Item name="longitude" label="Kinh độ" rules={[{ required: true, message: 'Chọn vị trí trên bản đồ' }]} style={{ flex: 1, marginBottom: 0 }}>
              <InputNumber style={{ width: '100%' }} step={0.0001} size="small" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Modal danh mục */}
      <Modal
        open={categoryModal.open}
        title={categoryModal.editing ? 'Sửa danh mục' : 'Thêm danh mục'}
        onCancel={() => setCategoryModal({ open: false })}
        onOk={saveCategory}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={categoryForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="name" label="Tên danh mục" rules={[{ required: true, min: 2, message: 'Nhập tên' }]}>
            <Input placeholder="Ví dụ: Trà sữa & ăn vặt" />
          </Form.Item>
          <Form.Item name="slug" label="Slug (tự sinh nếu để trống)" rules={[{ pattern: /^[a-z0-9-]*$/, message: 'Chỉ chữ thường, số, dấu gạch ngang' }]}>
            <Input placeholder="tra-sua-an-vat" disabled={Boolean(categoryModal.editing)} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả ngắn">
            <Input.TextArea rows={2} maxLength={300} />
          </Form.Item>
          <Space size={16}>
            <Form.Item name="sortOrder" label="Thứ tự">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="isActive" label="Đang dùng" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminReferencePage;
