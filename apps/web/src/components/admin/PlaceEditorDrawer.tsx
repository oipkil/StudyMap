import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Tabs,
  Space,
  Card,
  Typography,
  Divider,
  message,
  Tag,
  Alert,
  Grid,
  Collapse,
  Row,
  Col,
} from 'antd';
import { DataType, OperationalStatus } from '@ssg/shared';
import { PhotoUploadModal } from '../media/PhotoUploadModal';
import { ImageCropModal } from '../media/ImageCropModal';
import { UserMediaLibraryModal } from '../media/UserMediaLibraryModal';
import { PlaceSearchInput } from '../map/PlaceSearchInput';
import { LocationPickerMap } from '../map/LocationPickerMap';
import { DynamicFieldsForm } from './DynamicFieldsForm';
import { normalizeFieldDef, appliesToCategory, isEmptyValue, SIMPLE_DATA_TYPES } from '../../utils/dynamicFields';
import { Plus, Trash2, Clock, Coffee, LayoutGrid, Info, FileImage, Scissors, Upload, Image, ArrowUp, ArrowDown } from 'lucide-react';

const { Text } = Typography;

interface PlaceEditorDrawerProps {
  open: boolean;
  onClose: () => void;
  place?: any; // If set, we are editing and creating a new revision
  onSuccess: () => void;
}

export const PlaceEditorDrawer: React.FC<PlaceEditorDrawerProps> = ({
  open,
  onClose,
  place,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [dynamicFieldDefs, setDynamicFieldDefs] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [mediaUploadOpen, setMediaUploadOpen] = useState(false);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedMediaForCrop, setSelectedMediaForCrop] = useState<any | null>(null);
  const [placeImages, setPlaceImages] = useState<any[]>([]);
  // Bản revision mới nhất (có thể đang PENDING) — editor nạp từ bản này để sửa tiếp, không mất dữ liệu đã lưu
  const [latestRevision, setLatestRevision] = useState<any | null>(null);
  const [baseSnapshot, setBaseSnapshot] = useState<any>({});
  const [campuses, setCampuses] = useState<Array<{ id: string; name: string; universityName?: string; latitude?: number; longitude?: number }>>([]);
  // Giá trị giờ mở cửa lúc nạp form — để biết admin có sửa giờ hay không (giữ nguyên lịch 7 ngày nếu không sửa)
  const scheduleBaseline = React.useRef<string>('');
  const [publishNow, setPublishNow] = useState(false);
  // Màn hình hẹp (điện thoại): nút lưu xuống footer, lưới toạ độ 2 cột
  const screens = Grid.useBreakpoint();
  const isNarrow = !screens.md;

  // Nạp danh mục và định nghĩa trường động
  useEffect(() => {
    if (open) {
      fetch('/api/v1/admin/field-definitions', { credentials: 'include' })
        .then((res) => res.json())
        .then((json) => {
          if (json.success) setDynamicFieldDefs(json.data);
        })
        .catch(() => {});

      // Lấy danh mục thật (loại quán) cho ô chọn
      fetch('/api/v1/places/meta', { credentials: 'include' })
        .then((res) => res.json())
        .then((json) => {
          if (json.success) {
            setCategories(json.data.categories || []);
            setCampuses(json.data.campuses || []);
          }
        })
        .catch(() => {});
    }
  }, [open, place]);

  // Khởi tạo giá trị form khi mở
  useEffect(() => {
    if (open) {
      if (place) {
        // Đang sửa: nạp từ revision MỚI NHẤT (kể cả bản đang chờ duyệt) để người sửa không mất những gì đã lưu
        const applySnapshot = (snap: any) => {
        setBaseSnapshot(snap || {});
        if (snap.gallery && Array.isArray(snap.gallery)) {
          setPlaceImages(snap.gallery);
        } else {
          setPlaceImages([]);
        }
        form.setFieldsValue({
          defaultName: snap.name || place.defaultName,
          slug: place.slug,
          categoryId: place.categoryId,
          operationalStatus: place.operationalStatus || OperationalStatus.OPERATING,
          address: snap.address || '',
          nearestCampusId: snap.nearestCampusId || snap.nearbyCampusId || undefined,
          latitude: snap.latitude ?? snap.coordinates?.latitude ?? 10.7628,
          longitude: snap.longitude ?? snap.coordinates?.longitude ?? 106.6825,
          is24h: snap.weeklySchedule?.[0]?.is24h || false,
          openTime: snap.weeklySchedule?.[0]?.shifts?.[0]?.openTime || '07:00',
          closeTime: snap.weeklySchedule?.[0]?.shifts?.[0]?.closeTime || '22:00',
          isOvernight: snap.weeklySchedule?.[0]?.shifts?.[0]?.isOvernight || false,
          menuGroupName: snap.menuGroups?.[0]?.name || 'Thực đơn',
          menuItems: snap.menuGroups?.[0]?.items || [],
          // Dynamic fields
          repeaterItems: snap.dynamicFieldValues?.find((d: any) => d.dataType === DataType.REPEATER)?.value || [],
          dyn: Object.fromEntries(
            (Array.isArray(snap.dynamicFieldValues) ? snap.dynamicFieldValues : [])
              .filter((d: any) => d && d.dataType !== DataType.REPEATER && d.fieldKey)
              .map((d: any) => [d.fieldKey, d.value]),
          ),
          // Tiện ích học tập
          am_wifiQuality: snap.amenities?.wifiQuality || 'UNKNOWN',
          am_socketDensity: snap.amenities?.socketDensity || 'UNKNOWN',
          am_noiseLevel: snap.amenities?.noiseLevel || 'UNKNOWN',
          am_studySuitability: snap.amenities?.studySuitability || 'UNKNOWN',
          am_groupStudyAllowed: snap.amenities?.groupStudyAllowed ?? null,
          am_airConditioned: snap.amenities?.airConditioned ?? null,
          am_motorcycleParking: snap.amenities?.motorcycleParking || 'UNKNOWN',
          am_privateRoomsCount: snap.amenities?.privateRoomsCount ?? 0,
          studentDiscountDetails: snap.studentDiscountDetails || '',
          priceMin: snap.priceMin ?? undefined,
          priceMax: snap.priceMax ?? undefined,
        });
        scheduleBaseline.current = JSON.stringify({
          is24h: snap.weeklySchedule?.[0]?.is24h || false,
          openTime: snap.weeklySchedule?.[0]?.shifts?.[0]?.openTime || '07:00',
          closeTime: snap.weeklySchedule?.[0]?.shifts?.[0]?.closeTime || '22:00',
          isOvernight: snap.weeklySchedule?.[0]?.shifts?.[0]?.isOvernight || false,
        });
        };

        const publishedSnap = place.currentPublishedRevision?.snapshotData || {};
        applySnapshot(publishedSnap);
        setLatestRevision(null);
        fetch(`/api/v1/admin/places/${place.id}/revisions`, { credentials: 'include' })
          .then((r) => r.json())
          .then((json) => {
            const revs: any[] = json?.data || [];
            const newest = revs[0];
            // Luôn nạp snapshot mới nhất từ API: danh sách quán ở trang admin KHÔNG kèm snapshotData,
            // nên place.currentPublishedRevision.snapshotData thường rỗng -> form trống dù đã lưu.
            if (newest && newest.snapshotData) {
              applySnapshot(newest.snapshotData);
              setLatestRevision(newest.id !== place.currentPublishedRevision?.id ? newest : null);
            }
          })
          .catch(() => {});
      } else {
        // Tạo mới
        form.resetFields();
        form.setFieldsValue({
          operationalStatus: OperationalStatus.OPERATING,
          is24h: false,
          openTime: '07:00',
          closeTime: '22:00',
          menuGroupName: 'Thực đơn',
          menuItems: [],
          repeaterItems: [],
        });
      }
    }
  }, [open, place, form]);

  const handleSubmit = async (publish: boolean = false) => {
    try {
      await form.validateFields();
      // Lấy TOÀN BỘ giá trị trong store (kể cả trường ở tab chưa mở): validateFields() chỉ trả trường đã mount,
      // khiến tiện ích / thực đơn / trường động bị mất khi admin lưu mà chưa mở tab đó.
      const values = form.getFieldsValue(true);
      setSubmitting(true);

      // Xây dựng snapshotData chuẩn schema Zod
      const weekShift = values.is24h
        ? []
        : [{ openTime: values.openTime || '07:00', closeTime: values.closeTime || '22:00', isOvernight: Boolean(values.isOvernight) }];
      const snapshotData = {
        ...baseSnapshot, // giữ nguyên các trường form không sửa (tiện ích, tên phụ, ngoại lệ lịch, ưu đãi...)
        name: values.defaultName,
        alternateNames: Array.isArray(baseSnapshot.alternateNames) ? baseSnapshot.alternateNames : [],
        slug: values.slug,
        categoryId: values.categoryId || (place ? place.categoryId : '00000000-0000-0000-0000-000000000000'),
        operationalStatus: values.operationalStatus,
        address: values.address,
        nearestCampusId: values.nearestCampusId || baseSnapshot.nearestCampusId || undefined,
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        timezone: 'Asia/Ho_Chi_Minh',
        priceMin: values.priceMin != null && values.priceMin !== '' ? Number(values.priceMin) : baseSnapshot.priceMin ?? null,
        priceMax: values.priceMax != null && values.priceMax !== '' ? Number(values.priceMax) : baseSnapshot.priceMax ?? null,
        studentDiscountDetails: values.studentDiscountDetails ?? baseSnapshot.studentDiscountDetails ?? '',
        amenities: {
          ...(baseSnapshot.amenities || {}),
          wifiQuality: values.am_wifiQuality || 'UNKNOWN',
          socketDensity: values.am_socketDensity || 'UNKNOWN',
          noiseLevel: values.am_noiseLevel || 'UNKNOWN',
          studySuitability: values.am_studySuitability || 'UNKNOWN',
          groupStudyAllowed: values.am_groupStudyAllowed ?? null,
          airConditioned: values.am_airConditioned ?? null,
          motorcycleParking: values.am_motorcycleParking || 'UNKNOWN',
          privateRoomsCount: Number(values.am_privateRoomsCount ?? 0),
        },
        // Lịch 7 ngày: nếu admin KHÔNG chạm vào các ô giờ thì giữ nguyên lịch chi tiết theo ngày đang có
        // (ví dụ cuối tuần 24/24, ngày thường ca đêm). Chỉ khi sửa giờ mới áp khung giờ chung cho cả 7 ngày (0 = CN).
        weeklySchedule:
          JSON.stringify({
            is24h: Boolean(values.is24h),
            openTime: values.openTime || '07:00',
            closeTime: values.closeTime || '22:00',
            isOvernight: Boolean(values.isOvernight),
          }) === scheduleBaseline.current &&
          Array.isArray(baseSnapshot.weeklySchedule) &&
          baseSnapshot.weeklySchedule.length === 7
            ? baseSnapshot.weeklySchedule
            : [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => ({
                dayOfWeek,
                isClosed: false,
                is24h: Boolean(values.is24h),
                shifts: weekShift,
              })),
        // Chỉ lưu thực đơn khi admin nhập món thật (không tạo món mặc định)
        menuGroups:
          (values.menuItems || []).filter((it: any) => it && it.name).length > 0
            ? [
                {
                  name: values.menuGroupName || 'Thực đơn',
                  items: (values.menuItems || [])
                    .filter((it: any) => it && it.name)
                    .map((item: any) => ({
                      name: item.name,
                      basePrice: Number(item.basePrice),
                      unit: 'VND',
                      variants: [],
                    })),
                },
              ]
            : [],
        gallery: placeImages.map((img, idx) => ({
          assetId: img.assetId || img.id,
          assetRevisionId: img.assetRevisionId || img.currentRevisionId || img.revisions?.[0]?.id || img.id,
          isCover: Boolean(img.isCover ?? idx === 0),
          caption: img.caption || '',
          displayOrder: idx,
        })),
        dynamicFieldValues: [] as any[],
      };

      // Schema không nhận null cho giá: bỏ khoá khi không có giá trị
      for (const k of ['priceMin', 'priceMax'] as const) {
        if ((snapshotData as any)[k] == null || Number.isNaN((snapshotData as any)[k])) delete (snapshotData as any)[k];
      }

      // Xử lý repeater dynamic fields nếu có
      const repeaterDef = dynamicFieldDefs.find((d) => d.dataType === DataType.REPEATER);
      if (repeaterDef && values.repeaterItems && values.repeaterItems.length > 0) {
        snapshotData.dynamicFieldValues.push({
          fieldDefinitionId: repeaterDef.id,
          fieldDefinitionVersionId: repeaterDef.versions?.[0]?.id || repeaterDef.id,
          fieldKey: repeaterDef.key,
          dataType: DataType.REPEATER,
          value: values.repeaterItems,
        });
      }

      // Trường động đơn giản (tiện ích, dịch vụ, liên hệ...): chỉ lưu ô có giá trị
      const dyn: Record<string, unknown> = values.dyn || {};
      for (const raw of dynamicFieldDefs) {
        const def = normalizeFieldDef(raw);
        if (!SIMPLE_DATA_TYPES.has(def.dataType)) continue;
        const v = dyn[def.key];
        if (isEmptyValue(v)) continue;
        snapshotData.dynamicFieldValues.push({
          fieldDefinitionId: def.id,
          fieldDefinitionVersionId: def.versionId || def.id,
          fieldKey: def.key,
          dataType: def.dataType,
          value: v,
        });
      }

      // Tự sinh slug từ tên nếu để trống (bỏ dấu tiếng Việt, kebab-case)
      if (!place && !values.slug && values.defaultName) {
        values.slug = String(values.defaultName)
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
        form.setFieldsValue({ slug: values.slug });
      }

      if (place) {
        // TẠO PHIÊN BẢN MỚI (REVISION PENDING)
        const res = await fetch(`/api/v1/admin/places/${place.id}/revisions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] ?? '' },
          credentials: 'include',
          body: JSON.stringify({
            baseRevisionId: place.currentPublishedRevision?.id,
            snapshotData,
            reasonForChange: 'Cập nhật từ giao diện quản trị',
          }),
        });

        const json = await res.json();
        if (json.success) {
          const newRevId = json.data?.revision?.id;
          if (publish && newRevId) {
            // Admin tự sửa và xuất bản luôn: duyệt revision vừa tạo (vẫn qua đúng command kiểm duyệt + audit)
            const modRes = await fetch(`/api/v1/admin/places/${place.id}/revisions/${newRevId}/moderate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-csrf-token': document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] ?? '' },
              credentials: 'include',
              body: JSON.stringify({ action: 'APPROVE', reviewerNote: 'Admin sửa và xuất bản trực tiếp', forceOverride: true }),
            });
            const modJson = await modRes.json();
            if (modJson.success) {
              message.success('Đã lưu và xuất bản. Trang công khai hiển thị bản mới ngay.');
            } else {
              message.warning(modJson.message || 'Đã lưu bản sửa nhưng chưa xuất bản được — duyệt lại trong danh sách phiên bản.');
            }
          } else {
            message.success('Đã lưu bản sửa (đang chờ duyệt). Trang công khai vẫn giữ bản cũ tới khi duyệt.');
          }
          onSuccess();
          onClose();
        } else {
          message.error(json.message || 'Lỗi khi tạo bản cập nhật');
        }
      } else {
        // TẠO QUÁN MỚI
        const res = await fetch('/api/v1/admin/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': document.cookie.match(/ssg_csrf=([^;]+)/)?.[1] ?? '' },
          credentials: 'include',
          body: JSON.stringify({
            slug: values.slug,
            defaultName: values.defaultName,
            categoryId: values.categoryId || '00000000-0000-0000-0000-000000000000',
            operationalStatus: values.operationalStatus,
            snapshotData,
            initialStatus: 'APPROVED',
          }),
        });

        const json = await res.json();
        if (json.success) {
          message.success('Đã tạo quán mới và xuất bản thành công');
          onSuccess();
          onClose();
        } else {
          message.error(json.message || 'Lỗi khi tạo địa điểm');
        }
      }
    } catch {
      message.error('Vui lòng kiểm tra lại các trường bắt buộc trong form');
    } finally {
      setSubmitting(false);
    }
  };

  const repeaterField = dynamicFieldDefs.find((d) => d.dataType === DataType.REPEATER);

  return (
    <Drawer
      title={
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {place ? `Sửa quán: ${place.defaultName}` : 'Thêm quán mới'}
        </span>
      }
      size={Math.min(960, typeof window !== 'undefined' ? window.innerWidth : 960)}
      open={open}
      onClose={onClose}
      styles={{ body: { overflowX: 'hidden', paddingBottom: isNarrow ? 88 : undefined } }}
      footer={
        isNarrow ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>Hủy</Button>
            {place && (
              <Button
                type="primary"
                loading={submitting && publishNow}
                onClick={() => {
                  setPublishNow(true);
                  handleSubmit(true);
                }}
              >
                Lưu & xuất bản
              </Button>
            )}
            <Button
              type={place ? 'default' : 'primary'}
              onClick={() => {
                setPublishNow(false);
                handleSubmit(false);
              }}
              loading={submitting && !publishNow}
            >
              {place ? 'Gửi duyệt' : 'Tạo & xuất bản'}
            </Button>
          </div>
        ) : undefined
      }
      extra={
        isNarrow ? null : (
        <Space>
          <Button onClick={onClose}>Hủy</Button>
          {place && (
            <Button
              type="primary"
              loading={submitting && publishNow}
              onClick={() => {
                setPublishNow(true);
                handleSubmit(true);
              }}
            >
              Lưu & Xuất Bản Ngay
            </Button>
          )}
          <Button type={place ? 'default' : 'primary'} onClick={() => { setPublishNow(false); handleSubmit(false); }} loading={submitting && !publishNow}>
            {place ? 'Lưu & Gửi Hàng Đợi Duyệt' : 'Tạo & Xuất Bản Ngay'}
          </Button>
        </Space>
        )
      }
    >
      <Form form={form} layout="vertical" size="large">
        {place && latestRevision && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            title={`Bạn đang sửa tiếp trên bản v${latestRevision.revisionNumber} (${latestRevision.moderationStatus === 'PENDING' ? 'đang chờ duyệt' : latestRevision.moderationStatus}) — chưa công khai.`}
            description="Trang công khai vẫn hiển thị bản đã duyệt trước đó. Bấm 'Lưu & Xuất Bản Ngay' để công khai luôn, hoặc 'Lưu & Gửi Hàng Đợi Duyệt' để duyệt sau."
          />
        )}
        <Tabs
          defaultActiveKey="basic"
          items={[
            {
              key: 'basic',
              forceRender: true,
              label: (
                <span>
                  <Info size="1em" /> Thông tin
                </span>
              ),
              children: (
                <div>
                  {/* Thứ tự như form sinh viên: tên -> địa chỉ (tìm bản đồ) -> ghim -> phân loại. Slug + toạ độ tay gập vào "Nâng cao". */}
                  <Form.Item name="defaultName" label="Tên quán / Địa điểm" rules={[{ required: true, message: 'Nhập tên quán' }]}>
                    <Input
                      placeholder="Ví dụ: The Coffee House Nguyễn Văn Cừ"
                      maxLength={150}
                      onChange={(e) => {
                        // Quán mới: slug tự sinh theo tên
                        if (!place) {
                          form.setFieldsValue({
                            slug: String(e.target.value)
                              .normalize('NFD')
                              .replace(/[\u0300-\u036f]/g, '')
                              .replace(/đ/g, 'd')
                              .replace(/Đ/g, 'D')
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/^-+|-+$/g, '')
                              .slice(0, 80),
                          });
                        }
                      }}
                    />
                  </Form.Item>

                  <Form.Item
                    name="address"
                    label="Địa chỉ"
                    rules={[{ required: true, message: 'Nhập địa chỉ rồi chọn từ gợi ý bản đồ' }]}
                    extra="Gõ số nhà + tên đường (hoặc dán link Google Maps / toạ độ) rồi chọn đúng dòng gợi ý — ghim, toạ độ và cơ sở trường gần nhất tự điền."
                  >
                    <PlaceSearchInput
                      placeholder="Ví dụ: 227 Nguyễn Văn Cừ, Phường 4, Quận 5"
                      searchIcon
                      onPick={(hit) => {
                        const patch: Record<string, unknown> = { address: hit.address || hit.name, latitude: hit.latitude, longitude: hit.longitude };
                        ((lat: number, lng: number, patch: Record<string, unknown>) => {
                    if (!form.getFieldValue('nearestCampusId') && campuses.length) {
                      const d = (c: any) => Math.hypot((c.latitude - lat) * 111, (c.longitude - lng) * 111 * Math.cos((lat * Math.PI) / 180));
                      const nearest = [...campuses].sort((x: any, y: any) => d(x) - d(y))[0] as any;
                      if (nearest && d(nearest) <= 5) patch.nearestCampusId = nearest.id;
                    }
                  })(hit.latitude, hit.longitude, patch);
                        form.setFieldsValue(patch);
                      }}
                    />
                  </Form.Item>

                  <Form.Item
                    label="Vị trí trên bản đồ"
                    required
                    tooltip="Chọn địa chỉ ở ô trên là ghim tự nhảy tới. Kéo ghim hoặc bấm lên bản đồ để chỉnh — địa chỉ đổi theo; không cần gõ kinh độ/vĩ độ."
                  >
                    <Form.Item noStyle shouldUpdate={(a, b) => a.latitude !== b.latitude || a.longitude !== b.longitude}>
                      {({ getFieldValue, setFieldsValue }) => {
                        const lat = Number(getFieldValue('latitude'));
                        const lng = Number(getFieldValue('longitude'));
                        const has = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
                        return (
                          <LocationPickerMap
                            value={has ? { latitude: lat, longitude: lng } : null}
                            height={isNarrow ? 240 : 320}
                            showSearch={false}
                            onChange={(pos, meta) => {
                              const patch: Record<string, unknown> = { latitude: pos.latitude, longitude: pos.longitude };
                              // Kéo ghim / bấm bản đồ / GPS -> ô địa chỉ đổi theo vị trí mới
                              if (meta.address) patch.address = meta.address;
                              ((lat: number, lng: number, patch: Record<string, unknown>) => {
                    if (!form.getFieldValue('nearestCampusId') && campuses.length) {
                      const d = (c: any) => Math.hypot((c.latitude - lat) * 111, (c.longitude - lng) * 111 * Math.cos((lat * Math.PI) / 180));
                      const nearest = [...campuses].sort((x: any, y: any) => d(x) - d(y))[0] as any;
                      if (nearest && d(nearest) <= 5) patch.nearestCampusId = nearest.id;
                    }
                  })(pos.latitude, pos.longitude, patch);
                              setFieldsValue(patch);
                            }}
                          />
                        );
                      }}
                    </Form.Item>
                  </Form.Item>

                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item name="categoryId" label="Danh mục quán" rules={[{ required: true, message: 'Chọn danh mục' }]}>
                        <Select placeholder="Chọn danh mục quán" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="nearestCampusId" label="Cơ sở trường gần nhất" tooltip="Tự gợi ý theo vị trí; dùng để lọc theo trường và cho trợ lý AI">
                        <Select placeholder="Chọn cơ sở trường" allowClear showSearch optionFilterProp="label" options={campuses.map((c) => ({ value: c.id, label: c.universityName ? `${c.name} — ${c.universityName}` : c.name }))} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Collapse
                    ghost
                    size="small"
                    style={{ marginBottom: 8 }}
                    items={[
                      {
                        key: 'advanced',
                        label: <Text type="secondary" style={{ fontSize: 12 }}>Nâng cao: đường dẫn (slug), toạ độ tay</Text>,
                        children: (
                          <Row gutter={12}>
                            <Col xs={24}>
                              <Form.Item name="slug" label="Đường dẫn tĩnh (slug) — tự sinh theo tên" rules={[{ required: true, message: 'Nhập slug duy nhất' }]}>
                                <Input placeholder="Ví dụ: the-study-hub-khtn" disabled={Boolean(place)} />
                              </Form.Item>
                            </Col>
                            <Col xs={12}>
                              <Form.Item name="latitude" label="Vĩ độ" rules={[{ required: true, message: 'Chọn vị trí trên bản đồ' }]} style={{ marginBottom: 0 }}>
                                <InputNumber style={{ width: '100%' }} step={0.0001} placeholder="10.7628" />
                              </Form.Item>
                            </Col>
                            <Col xs={12}>
                              <Form.Item name="longitude" label="Kinh độ" rules={[{ required: true, message: 'Chọn vị trí trên bản đồ' }]} style={{ marginBottom: 0 }}>
                                <InputNumber style={{ width: '100%' }} step={0.0001} placeholder="106.6825" />
                              </Form.Item>
                            </Col>
                          </Row>
                        ),
                      },
                    ]}
                  />
                  <Form.Item name="operationalStatus" label="Trạng thái hoạt động">
                    <Select style={{ width: '100%' }}>
                      <Select.Option value={OperationalStatus.OPERATING}>Đang hoạt động</Select.Option>
                      <Select.Option value={OperationalStatus.TEMPORARILY_CLOSED}>Tạm nghỉ</Select.Option>
                      <Select.Option value={OperationalStatus.PERMANENTLY_CLOSED}>Đã đóng cửa vĩnh viễn</Select.Option>
                    </Select>
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'schedule',
              forceRender: true,
              label: (
                <span>
                  <Clock size="1em" /> Giờ mở cửa
                </span>
              ),
              children: (
                <div>
                  {Array.isArray(baseSnapshot.weeklySchedule) &&
                    new Set(baseSnapshot.weeklySchedule.map((d: any) => JSON.stringify([d.is24h, d.isClosed, d.shifts]))).size > 1 && (
                      <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        title="Quán này có lịch khác nhau theo ngày"
                        description={
                          <div style={{ fontSize: 12 }}>
                            {baseSnapshot.weeklySchedule.map((d: any) => (
                              <div key={d.dayOfWeek}>
                                <strong>{d.dayOfWeek === 0 ? 'CN' : `Thứ ${d.dayOfWeek + 1}`}:</strong>{' '}
                                {d.isClosed
                                  ? 'Đóng cửa'
                                  : d.is24h
                                    ? 'Mở 24/24'
                                    : (d.shifts || []).map((sh: any) => `${sh.openTime} - ${sh.closeTime}${sh.isOvernight ? ' (qua đêm)' : ''}`).join(', ') ||
                                      'Chưa có thông tin'}
                              </div>
                            ))}
                            <div style={{ marginTop: 6 }}>Lịch này được giữ nguyên nếu bạn không sửa các ô giờ bên dưới. Sửa giờ sẽ áp một khung giờ chung cho cả 7 ngày.</div>
                          </div>
                        }
                      />
                    )}
                  <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <Text strong>Chế độ mở cửa 24/24</Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Phục vụ sinh viên xuyên đêm liên tục không ngắt quãng
                          </Text>
                        </div>
                      </div>
                      <Form.Item name="is24h" valuePropName="checked" noStyle>
                        <Switch />
                      </Form.Item>
                    </div>
                  </Card>

                  <Form.Item noStyle dependencies={['is24h']}>
                    {({ getFieldValue }) =>
                      !getFieldValue('is24h') ? (
                        <Space size={16}>
                          <Form.Item name="openTime" label="Giờ mở cửa (HH:mm)">
                            <Input placeholder="07:00" style={{ width: 140 }} />
                          </Form.Item>
                          <Form.Item name="closeTime" label="Giờ đóng cửa (HH:mm)">
                            <Input placeholder="22:00" style={{ width: 140 }} />
                          </Form.Item>
                          <Form.Item name="isOvernight" label="Ca xuyên đêm (hôm sau)" valuePropName="checked">
                            <Switch />
                          </Form.Item>
                        </Space>
                      ) : (
                        <Tag color="green">Đang kích hoạt phục vụ 24/24</Tag>
                      )
                    }
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'amenities',
              forceRender: true,
              label: (
                <span>
                  <Info size="1em" /> Tiện ích & giá
                </span>
              ),
              children: (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    Thông tin sinh viên dùng để lọc và so sánh quán. Để "Chưa rõ" nếu không chắc — không đoán.
                  </Text>
                  <Space style={{ display: 'flex', width: '100%' }} size={16} wrap>
                    <Form.Item name="am_wifiQuality" label="Wi-Fi" style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Select
                        options={[
                          { value: 'UNKNOWN', label: 'Chưa rõ' },
                          { value: 'NONE', label: 'Không có' },
                          { value: 'WEAK', label: 'Yếu' },
                          { value: 'MODERATE', label: 'Ổn' },
                          { value: 'STRONG', label: 'Mạnh' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="am_socketDensity" label="Ổ cắm điện" style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Select
                        options={[
                          { value: 'UNKNOWN', label: 'Chưa rõ' },
                          { value: 'NONE', label: 'Không có' },
                          { value: 'SPARSE', label: 'Ít' },
                          { value: 'MANY', label: 'Nhiều' },
                          { value: 'EVERY_TABLE', label: 'Mỗi bàn đều có' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="am_noiseLevel" label="Độ ồn" style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Select
                        options={[
                          { value: 'UNKNOWN', label: 'Chưa rõ' },
                          { value: 'SILENT', label: 'Rất yên tĩnh' },
                          { value: 'QUIET', label: 'Yên tĩnh' },
                          { value: 'MODERATE', label: 'Vừa phải' },
                          { value: 'LOUD', label: 'Ồn' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="am_studySuitability" label="Phù hợp học bài" style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Select
                        options={[
                          { value: 'UNKNOWN', label: 'Chưa rõ' },
                          { value: 'POOR', label: 'Kém' },
                          { value: 'FAIR', label: 'Tạm' },
                          { value: 'GOOD', label: 'Tốt' },
                          { value: 'EXCELLENT', label: 'Rất tốt' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="am_motorcycleParking" label="Gửi xe máy" style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <Select
                        options={[
                          { value: 'UNKNOWN', label: 'Chưa rõ' },
                          { value: 'FREE', label: 'Miễn phí' },
                          { value: 'PAID', label: 'Có phí' },
                          { value: 'NONE', label: 'Không có chỗ' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="am_privateRoomsCount" label="Số phòng riêng" style={{ flex: '1 1 140px', minWidth: 0 }}>
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                  </Space>
                  <Space size={24} wrap>
                    <Form.Item name="am_groupStudyAllowed" label="Cho học nhóm" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="am_airConditioned" label="Máy lạnh" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </Space>
                  <Divider />
                  <Space style={{ display: 'flex', width: '100%' }} size={16} wrap>
                    <Form.Item name="priceMin" label="Giá thấp nhất (VNĐ)" style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <InputNumber min={0} step={1000} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="priceMax" label="Giá cao nhất (VNĐ)" style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <InputNumber min={0} step={1000} style={{ width: '100%' }} />
                    </Form.Item>
                  </Space>
                  <Form.Item name="studentDiscountDetails" label="Ưu đãi sinh viên (nếu có)">
                    <Input placeholder="Ví dụ: Giảm 10% khi xuất trình thẻ sinh viên" />
                  </Form.Item>
                </div>
              ),
            },
            {
              key: 'menu',
              forceRender: true,
              label: (
                <span>
                  <Coffee size="1em" /> Thực đơn
                </span>
              ),
              children: (
                <div>
                  <Form.Item name="menuGroupName" label="Tên nhóm thực đơn">
                    <Input placeholder="Ví dụ: Cà Phê Truyền Thống, Trà Trái Cây..." />
                  </Form.Item>

                  <Text strong>Danh sách món ăn / thức uống:</Text>
                  <Divider style={{ margin: '8px 0 16px 0' }} />

                  <Form.List name="menuItems">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map(({ key, name, ...restField }) => (
                          <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                            <Form.Item
                              {...restField}
                              name={[name, 'name']}
                              rules={[{ required: true, message: 'Nhập tên món' }]}
                            >
                              <Input placeholder="Tên món (Trà Đào...)" style={{ width: 260 }} />
                            </Form.Item>
                            <Form.Item
                              {...restField}
                              name={[name, 'basePrice']}
                              rules={[{ required: true, message: 'Nhập giá' }]}
                            >
                              <InputNumber placeholder="Giá (VND)" style={{ width: 160 }} />
                            </Form.Item>
                            <Button
                              type="text"
                              danger
                              icon={<Trash2 size="1em" />}
                              onClick={() => remove(name)}
                            />
                          </Space>
                        ))}
                        <Button
                          type="dashed"
                          onClick={() => add()}
                          block
                          icon={<Plus size="1em" />}
                          style={{ marginTop: 8 }}
                        >
                          Thêm món mới vào thực đơn
                        </Button>
                      </>
                    )}
                  </Form.List>
                </div>
              ),
            },
            {
              key: 'dynamic',
              forceRender: true,
              label: (
                <span>
                  <LayoutGrid size="1em" /> Tiện ích chi tiết
                </span>
              ),
              children: (
                <div>
                  <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    Mọi thứ một quán có thể có — chỉ điền ô bạn biết chắc, ô trống sẽ không hiển thị. Danh sách này do admin quản lý ở mục Trường động.
                  </Text>
                  <Form.Item noStyle shouldUpdate={(a, b) => a.categoryId !== b.categoryId}>
                    {({ getFieldValue }) => (
                      <DynamicFieldsForm
                        compact={isNarrow}
                        defs={[...dynamicFieldDefs]
                          .reverse()
                          .map(normalizeFieldDef)
                          .filter((d) => SIMPLE_DATA_TYPES.has(d.dataType) && appliesToCategory(d, getFieldValue('categoryId')))}
                      />
                    )}
                  </Form.Item>
                  <Divider style={{ margin: '16px 0' }} />
                  {repeaterField ? (
                    <div>
                      <div style={{ marginBottom: 12 }}>
                        <Tag color="purple">{repeaterField.label}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          (Trường động kiểu REPEATER cấu hình động từ Admin, lưu trữ trong Snapshot)
                        </Text>
                      </div>

                      <Form.List name="repeaterItems">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map(({ key, name, ...restField }) => (
                              <Card key={key} size="small" style={{ marginBottom: 12, background: '#fcfcfc' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <Text strong>Phòng #{name + 1}</Text>
                                  <Button
                                    type="text"
                                    danger
                                    size="small"
                                    icon={<Trash2 size="1em" />}
                                    onClick={() => remove(name)}
                                  />
                                </div>
                                <Space size={16} wrap>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'room_name']}
                                    label="Tên phòng"
                                    rules={[{ required: true, message: 'Nhập tên phòng' }]}
                                  >
                                    <Input placeholder="Ví dụ: Phòng Einstein" style={{ width: 180 }} />
                                  </Form.Item>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'capacity']}
                                    label="Sức chứa (người)"
                                    rules={[{ required: true, message: 'Nhập sức chứa' }]}
                                  >
                                    <InputNumber min={1} max={100} style={{ width: 140 }} />
                                  </Form.Item>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'has_ac']}
                                    label="Máy lạnh"
                                    valuePropName="checked"
                                  >
                                    <Switch />
                                  </Form.Item>
                                </Space>
                              </Card>
                            ))}
                            <Button
                              type="dashed"
                              onClick={() => add({ room_name: '', capacity: 6, has_ac: true })}
                              block
                              icon={<Plus size="1em" />}
                            >
                              Thêm phòng tự học mới
                            </Button>
                          </>
                        )}
                      </Form.List>
                    </div>
                  ) : (
                    <Text type="secondary">Chưa có trường "Danh sách phòng học" (REPEATER) trong hệ thống.</Text>
                  )}
                </div>
              ),
            },
            {
              key: 'media',
              forceRender: true,
              label: (
                <span>
                  <FileImage size="1em" /> Hình ảnh ({placeImages.length})
                </span>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <Text strong>Kho hình ảnh quán & Menu</Text>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Ảnh phục vụ qua Media Gateway với revision cố định, hỗ trợ ảnh bìa, chú thích và sắp xếp gallery.
                        </Text>
                      </div>
                    </div>
                    <Space>
                      <Button
                        icon={<Image size="1em" />}
                        onClick={() => setLibraryModalOpen(true)}
                      >
                        Chọn từ kho ảnh
                      </Button>
                      <Button
                        type="primary"
                        icon={<Upload size="1em" />}
                        onClick={() => setMediaUploadOpen(true)}
                      >
                        Tải ảnh mới lên
                      </Button>
                    </Space>
                  </div>

                  {placeImages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 0', background: '#fafafa', borderRadius: 8 }}>
                      <FileImage size="1em" style={{ fontSize: 40, color: '#bfbfbf', marginBottom: 8 }} />
                      <div>
                        <Text type="secondary">Chưa có ảnh nào được gắn với địa điểm này</Text>
                      </div>
                      <Space style={{ marginTop: 12 }}>
                        <Button
                          icon={<Image size="1em" />}
                          onClick={() => setLibraryModalOpen(true)}
                        >
                          Chọn từ kho ảnh của tôi
                        </Button>
                        <Button
                          type="dashed"
                          icon={<Upload size="1em" />}
                          onClick={() => setMediaUploadOpen(true)}
                        >
                          Tải ảnh đầu tiên
                        </Button>
                      </Space>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                      {placeImages.map((img, idx) => {
                        const assetId = img.assetId || img.id;
                        const revisionId = img.assetRevisionId || img.currentRevisionId || img.revisions?.[0]?.id || img.id;

                        return (
                          <Card
                            key={assetId || idx}
                            size="small"
                            cover={
                              <div style={{ height: 130, overflow: 'hidden', background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                <img
                                  src={`/api/v1/media/${assetId}?variant=thumb&preview=true`}
                                  alt={img.originalName || img.caption || 'Place Image'}
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                                {img.isCover && (
                                  <div style={{ position: 'absolute', top: 6, left: 6 }}>
                                    <Tag color="gold" style={{ fontWeight: 600 }}>ẢNH BÌA</Tag>
                                  </div>
                                )}
                              </div>
                            }
                            actions={[
                              <Button
                                type="text"
                                size="small"
                                disabled={idx === 0}
                                icon={<ArrowUp size="1em" />}
                                onClick={() => {
                                  const updated = [...placeImages];
                                  const temp = updated[idx];
                                  updated[idx] = updated[idx - 1];
                                  updated[idx - 1] = temp;
                                  setPlaceImages(updated);
                                }}
                              />,
                              <Button
                                type="text"
                                size="small"
                                disabled={idx === placeImages.length - 1}
                                icon={<ArrowDown size="1em" />}
                                onClick={() => {
                                  const updated = [...placeImages];
                                  const temp = updated[idx];
                                  updated[idx] = updated[idx + 1];
                                  updated[idx + 1] = temp;
                                  setPlaceImages(updated);
                                }}
                              />,
                              <Button
                                type="text"
                                size="small"
                                icon={<Scissors size="1em" style={{ color: '#fa8c16' }} />}
                                onClick={() => {
                                  setSelectedMediaForCrop(img);
                                  setCropModalOpen(true);
                                }}
                              >
                                Cắt
                              </Button>,
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<Trash2 size="1em" />}
                                onClick={() => {
                                  setPlaceImages((prev) => prev.filter((_, i) => i !== idx));
                                }}
                              >
                                Xóa
                              </Button>,
                            ]}
                          >
                            <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text ellipsis style={{ maxWidth: 130, fontSize: 11 }} strong>
                                {img.originalName || `Ảnh #${idx + 1}`}
                              </Text>
                              {!img.isCover && (
                                <Button
                                  type="link"
                                  size="small"
                                  style={{ padding: 0, fontSize: 11 }}
                                  onClick={() => {
                                    setPlaceImages((prev) =>
                                      prev.map((item, i) => ({ ...item, isCover: i === idx }))
                                    );
                                  }}
                                >
                                  Đặt làm bìa
                                </Button>
                              )}
                            </div>

                            <Input
                              size="small"
                              placeholder="Nhập chú thích ảnh..."
                              value={img.caption || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPlaceImages((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, caption: val } : item))
                                );
                              }}
                              style={{ fontSize: 11 }}
                            />

                            <div style={{ marginTop: 6 }}>
                              <Text type="secondary" style={{ fontSize: 10 }}>
                                Revision: <code>{revisionId?.slice(0, 8)}...</code>
                              </Text>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Form>

      {/* Tải ảnh mới: chọn nhiều ảnh, cắt kéo–thả trước khi tải */}
      <PhotoUploadModal
        open={mediaUploadOpen}
        onClose={() => setMediaUploadOpen(false)}
        title="Tải ảnh quán lên"
        onDone={(assets) => {
          setPlaceImages((prev) => [...prev, ...assets.map((a, i) => ({ ...a, isCover: prev.length === 0 && i === 0, caption: '' }))]);
        }}
      />

      {/* User Media Library Modal */}
      <UserMediaLibraryModal
        visible={libraryModalOpen}
        onClose={() => setLibraryModalOpen(false)}
        onSelectAsset={(selectedAsset) => {
          setPlaceImages((prev) => [...prev, { ...selectedAsset, isCover: prev.length === 0, caption: '' }]);
        }}
        onOpenUpload={() => setMediaUploadOpen(true)}
      />

      {/* Crop Modal */}
      <ImageCropModal
        visible={cropModalOpen}
        asset={selectedMediaForCrop}
        onClose={() => {
          setCropModalOpen(false);
          setSelectedMediaForCrop(null);
        }}
        onSuccess={(cropResult) => {
          // Cập nhật lại asset với thông tin revision mới
          if (selectedMediaForCrop) {
            setPlaceImages((prev) =>
              prev.map((item) =>
                item.id === selectedMediaForCrop.id || item.assetId === selectedMediaForCrop.id
                  ? { ...item, ...cropResult.revision, assetRevisionId: cropResult.revision.id }
                  : item
              )
            );
          }
        }}
      />
    </Drawer>
  );
};

export default PlaceEditorDrawer;
