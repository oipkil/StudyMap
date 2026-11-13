// Nạp bộ trường động "tất tần tật những gì một quán có thể có" qua API admin (idempotent — bỏ qua key đã có).
// Mỗi trường gắn vào TẤT CẢ danh mục đang hoạt động; nhóm trường tự tạo nếu chưa có.
//   node scripts/seed-field-definitions.mjs                       -> máy dev (http://localhost:4000)
//   BASE=https://studymap.online ADMIN_ID=... ADMIN_PW=... node scripts/seed-field-definitions.mjs
const BASE = process.env.BASE || 'http://localhost:4000';
const ADMIN_ID = process.env.ADMIN_ID || 'admin@ssg.edu.vn';
const ADMIN_PW = process.env.ADMIN_PW || 'Admin@123456';

const YES_NO = 'BOOLEAN_TRI_STATE';

// [groupKey, groupLabel, sortOrder, fields[]]
const GROUPS = [
  [
    'space_seating',
    'Không gian & chỗ ngồi',
    1,
    [
      { key: 'seating_capacity', label: 'Sức chứa', dataType: 'NUMBER', unit: 'chỗ', isFilterable: true, isComparable: true, description: 'Tổng số chỗ ngồi ước tính' },
      { key: 'table_types', label: 'Loại bàn', dataType: 'SELECT_MANY', options: ['Bàn đơn', 'Bàn đôi', 'Bàn dài học nhóm', 'Bàn bar cao', 'Sofa', 'Ngồi bệt / sàn'], isFilterable: true },
      { key: 'has_outdoor_seating', label: 'Chỗ ngồi ngoài trời / sân vườn', dataType: YES_NO, isFilterable: true },
      { key: 'floors_count', label: 'Số tầng', dataType: 'NUMBER', unit: 'tầng' },
      { key: 'has_quiet_zone', label: 'Có khu vực yên tĩnh riêng', dataType: YES_NO, isFilterable: true, isComparable: true },
      { key: 'lighting_quality', label: 'Ánh sáng', dataType: 'SELECT_ONE', options: ['Tối', 'Vừa đủ', 'Sáng', 'Rất sáng'], isComparable: true },
      { key: 'music_volume', label: 'Nhạc trong quán', dataType: 'SELECT_ONE', options: ['Không mở nhạc', 'Nhẹ nền', 'Vừa', 'Ồn'], isFilterable: true, isComparable: true },
      { key: 'view_type', label: 'Tầm nhìn', dataType: 'SELECT_MANY', options: ['Mặt đường', 'Sân vườn', 'Hồ / sông', 'Thành phố', 'Trong nhà kín'] },
      { key: 'has_smoking_area', label: 'Khu vực hút thuốc riêng', dataType: YES_NO },
      { key: 'crowd_level_peak', label: 'Đông khách giờ cao điểm', dataType: 'SELECT_ONE', options: ['Thưa', 'Vừa', 'Đông', 'Rất đông - khó có chỗ'], isComparable: true },
      { key: 'peak_hours', label: 'Khung giờ đông nhất', dataType: 'TEXT', description: 'Ví dụ: 19:00-21:30 các ngày trong tuần' },
    ],
  ],
  [
    'study_facilities',
    'Học tập & làm việc',
    2,
    [
      { key: 'wifi_speed_mbps', label: 'Tốc độ Wi-Fi đo được', dataType: 'NUMBER_WITH_UNIT', unit: 'Mbps', isComparable: true, isFilterable: true },
      { key: 'wifi_access', label: 'Cách lấy Wi-Fi', dataType: 'SELECT_ONE', options: ['Miễn phí - không mật khẩu', 'Hỏi nhân viên', 'In trên hoá đơn', 'Wi-Fi trả phí', 'Không có Wi-Fi'] },
      { key: 'sockets_per_table', label: 'Ổ cắm mỗi bàn', dataType: 'SELECT_ONE', options: ['Không có', 'Vài bàn có', 'Hầu hết bàn', 'Mỗi bàn đều có'], isFilterable: true, isComparable: true },
      { key: 'max_sitting_hours', label: 'Giới hạn thời gian ngồi', dataType: 'NUMBER', unit: 'giờ', description: 'Để trống nếu không giới hạn', isComparable: true },
      { key: 'laptop_policy', label: 'Chính sách dùng laptop', dataType: 'SELECT_ONE', options: ['Thoải mái', 'Chỉ khu vực riêng', 'Hạn chế giờ cao điểm', 'Không khuyến khích'] },
      { key: 'has_whiteboard', label: 'Có bảng trắng / bút lông', dataType: YES_NO, isFilterable: true },
      { key: 'has_printer', label: 'Có máy in / photo', dataType: YES_NO, isFilterable: true },
      { key: 'has_projector', label: 'Có máy chiếu / TV trình chiếu', dataType: YES_NO },
      { key: 'has_lockers', label: 'Có tủ khoá đồ', dataType: YES_NO },
      { key: 'room_booking_link', label: 'Link đặt phòng / đặt bàn', dataType: 'SAFE_LINK' },
      { key: 'best_study_time', label: 'Thời điểm học tốt nhất', dataType: 'SELECT_MANY', options: ['Sáng sớm', 'Trưa', 'Chiều', 'Tối', 'Đêm khuya'] },
    ],
  ],
  [
    'food_drink',
    'Đồ uống & đồ ăn',
    3,
    [
      { key: 'avg_drink_price', label: 'Giá nước trung bình', dataType: 'CURRENCY', unit: 'VND', isComparable: true, isFilterable: true },
      { key: 'has_food', label: 'Có phục vụ đồ ăn', dataType: YES_NO, isFilterable: true },
      { key: 'serves_meals', label: 'Bữa ăn phục vụ', dataType: 'SELECT_MANY', options: ['Sáng', 'Trưa', 'Tối', 'Ăn vặt'] },
      { key: 'outside_food_allowed', label: 'Cho mang đồ ăn ngoài vào', dataType: YES_NO, isFilterable: true },
      { key: 'free_water_refill', label: 'Nước lọc miễn phí / refill', dataType: YES_NO, isComparable: true },
      { key: 'signature_items', label: 'Món đặc trưng nên thử', dataType: 'TEXT' },
      { key: 'vegetarian_options', label: 'Có món chay', dataType: YES_NO },
      { key: 'student_combo', label: 'Combo / giờ vàng cho sinh viên', dataType: 'TEXT' },
    ],
  ],
  [
    'service_payment',
    'Dịch vụ & thanh toán',
    4,
    [
      { key: 'payment_methods', label: 'Hình thức thanh toán', dataType: 'SELECT_MANY', options: ['Tiền mặt', 'Chuyển khoản', 'Momo', 'ZaloPay', 'VNPay', 'Thẻ ngân hàng'], isFilterable: true },
      { key: 'student_discount_percent', label: 'Giảm giá sinh viên', dataType: 'NUMBER', unit: '%', isComparable: true, isFilterable: true },
      { key: 'has_loyalty_program', label: 'Có tích điểm / thẻ thành viên', dataType: YES_NO },
      { key: 'delivery_available', label: 'Có giao hàng / đặt qua app', dataType: YES_NO },
      { key: 'reservation_available', label: 'Nhận đặt chỗ trước', dataType: YES_NO, isFilterable: true },
      { key: 'has_phone_charging', label: 'Có sạc điện thoại / sạc dự phòng', dataType: YES_NO },
      { key: 'min_spend_per_person', label: 'Chi tiêu tối thiểu mỗi người', dataType: 'CURRENCY', unit: 'VND', isComparable: true },
      { key: 'service_speed', label: 'Tốc độ phục vụ', dataType: 'SELECT_ONE', options: ['Nhanh', 'Bình thường', 'Chậm'], isComparable: true },
    ],
  ],
  [
    'facilities_access',
    'Tiện nghi & đi lại',
    5,
    [
      { key: 'restroom_quality', label: 'Nhà vệ sinh', dataType: 'SELECT_ONE', options: ['Sạch sẽ', 'Bình thường', 'Kém', 'Không có'], isComparable: true },
      { key: 'parking_fee', label: 'Phí gửi xe máy', dataType: 'CURRENCY', unit: 'VND', description: '0 = miễn phí', isComparable: true },
      { key: 'has_car_parking', label: 'Có chỗ đậu ô tô', dataType: YES_NO },
      { key: 'has_elevator', label: 'Có thang máy', dataType: YES_NO },
      { key: 'security_camera', label: 'Có camera an ninh', dataType: YES_NO },
      { key: 'has_backup_power', label: 'Có máy phát điện dự phòng', dataType: YES_NO },
      { key: 'distance_to_bus_stop_m', label: 'Cách trạm xe buýt', dataType: 'NUMBER', unit: 'm', isComparable: true },
      { key: 'bus_routes', label: 'Tuyến xe buýt đi qua', dataType: 'TEXT', description: 'Ví dụ: 08, 19, 53' },
      { key: 'nearby_landmarks', label: 'Mốc dễ nhận biết gần quán', dataType: 'TEXT' },
      { key: 'entrance_note', label: 'Hướng dẫn tìm lối vào', dataType: 'LONG_TEXT' },
    ],
  ],
  [
    'contact_social',
    'Liên hệ & mạng xã hội',
    6,
    [
      { key: 'facebook_page', label: 'Trang Facebook', dataType: 'SAFE_LINK' },
      { key: 'instagram', label: 'Instagram', dataType: 'SAFE_LINK' },
      { key: 'tiktok', label: 'TikTok', dataType: 'SAFE_LINK' },
      { key: 'zalo_contact', label: 'Zalo liên hệ', dataType: 'TEXT' },
      { key: 'online_menu_link', label: 'Link thực đơn online', dataType: 'SAFE_LINK' },
      { key: 'google_maps_link', label: 'Link Google Maps', dataType: 'SAFE_LINK' },
    ],
  ],
  [
    'survey_meta',
    'Khảo sát của nhóm (nội bộ)',
    9,
    [
      { key: 'last_survey_date', label: 'Ngày khảo sát gần nhất', dataType: 'DATE', isPublic: false },
      { key: 'surveyed_by', label: 'Thành viên khảo sát', dataType: 'TEXT', isPublic: false },
      { key: 'data_confidence', label: 'Độ tin cậy dữ liệu', dataType: 'SELECT_ONE', options: ['Đã đến khảo sát', 'Hỏi qua điện thoại', 'Tổng hợp từ mạng'], isPublic: false },
      { key: 'survey_notes', label: 'Ghi chú nội bộ của nhóm', dataType: 'LONG_TEXT', isPublic: false },
    ],
  ],
];

const jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const remember = (res) => {
  for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
    const [kv] = c.split(';');
    const [k, v] = kv.split('=');
    jar[k] = v;
  }
};

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier: ADMIN_ID, password: ADMIN_PW }),
});
remember(login);
if (!login.ok) throw new Error('Đăng nhập admin thất bại: ' + login.status);
const H = { 'Content-Type': 'application/json', Cookie: cookieHeader(), 'x-csrf-token': jar.ssg_csrf };

const cats = (await fetch(`${BASE}/api/v1/admin/reference/categories`, { headers: H }).then((r) => r.json())).data || [];
const categoryIds = cats.filter((c) => c.isActive).map((c) => c.id);
const existing = (await fetch(`${BASE}/api/v1/admin/field-definitions`, { headers: H }).then((r) => r.json())).data || [];
const have = new Set(existing.map((f) => f.key));

let added = 0;
for (const [groupKey, groupLabel, sortOrder, fields] of GROUPS) {
  for (const f of fields) {
    if (have.has(f.key)) continue;
    const body = {
      ...f,
      isPublic: f.isPublic ?? true,
      isRequired: false,
      isFilterable: f.isFilterable ?? false,
      isComparable: f.isComparable ?? false,
      options: f.options ?? [],
      categoryIds,
      fieldGroupKey: groupKey,
      fieldGroupLabel: groupLabel,
      fieldGroupSortOrder: sortOrder,
    };
    const r = await fetch(`${BASE}/api/v1/admin/field-definitions`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    console.log(r.status, groupKey, f.key);
    if (r.ok) added++;
    else console.log('   ', (await r.text()).slice(0, 200));
  }
}
console.log(`Đã thêm ${added} trường động (đã có ${have.size}), gắn vào ${categoryIds.length} danh mục.`);
