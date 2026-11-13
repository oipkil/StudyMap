// Nạp thêm bộ trường động cho khối "Dữ liệu học bài & công thái học" trên trang quán (idempotent — bỏ qua key đã có).
// Các trường này để admin / sinh viên nhập thật, thay cho chữ cứng trong giao diện.
//   node scripts/seed-study-comfort-fields.mjs
//   BASE=https://studymap.online ADMIN_ID=... ADMIN_PW=... node scripts/seed-study-comfort-fields.mjs
const BASE = process.env.BASE || 'http://localhost:4000';
const ADMIN_ID = process.env.ADMIN_ID || 'admin@ssg.edu.vn';
const ADMIN_PW = process.env.ADMIN_PW || 'Admin@123456';

const YES_NO = 'BOOLEAN_TRI_STATE';
const CROWD = ['Vắng', 'Vừa phải', 'Đông', 'Rất đông', 'Đóng cửa'];

// [groupKey, groupLabel, sortOrder, fields[]]
const GROUPS = [
  [
    'ergonomics',
    'Bàn ghế & công thái học',
    8,
    [
      { key: 'desk_height_cm', label: 'Chiều cao bàn', dataType: 'NUMBER', unit: 'cm', isComparable: true, description: 'Bàn 72–76 cm là chuẩn ngồi làm laptop' },
      { key: 'desk_laptop_friendly', label: 'Bàn phù hợp dùng laptop', dataType: YES_NO, isFilterable: true, isComparable: true },
      { key: 'chair_back_support', label: 'Ghế có tựa lưng êm', dataType: YES_NO, isFilterable: true, isComparable: true },
      { key: 'desk_lamp_available', label: 'Có đèn bàn / ánh sáng riêng cho bàn', dataType: YES_NO },
      { key: 'table_spacing', label: 'Khoảng cách giữa các bàn', dataType: 'SELECT_ONE', options: ['Sát nhau', 'Vừa phải', 'Rộng rãi, riêng tư'], isComparable: true },
      { key: 'max_comfortable_hours', label: 'Ngồi thoải mái liên tục khoảng', dataType: 'NUMBER', unit: 'giờ', isComparable: true },
    ],
  ],
  [
    'peak_crowd',
    'Giờ đông khách theo khung',
    9,
    [
      { key: 'crowd_morning', label: 'Sáng (07–11h)', dataType: 'SELECT_ONE', options: CROWD },
      { key: 'crowd_noon', label: 'Trưa (11–14h)', dataType: 'SELECT_ONE', options: CROWD },
      { key: 'crowd_afternoon', label: 'Chiều (14–18h)', dataType: 'SELECT_ONE', options: CROWD },
      { key: 'crowd_evening', label: 'Tối (18–22h)', dataType: 'SELECT_ONE', options: CROWD },
      { key: 'crowd_latenight', label: 'Khuya (22–04h)', dataType: 'SELECT_ONE', options: CROWD },
    ],
  ],
  [
    'connectivity',
    'Wi-Fi & ổ cắm',
    3,
    [
      { key: 'wifi_password', label: 'Mật khẩu Wi-Fi quán', dataType: 'TEXT', description: 'Chỉ điền khi quán công khai cho khách; để trống nếu phải hỏi nhân viên' },
    ],
  ],
];

const jar = [];
const setCookies = (res) => {
  const list = res.headers.getSetCookie?.() || [];
  for (const c of list) {
    const [pair] = c.split(';');
    const name = pair.split('=')[0];
    const idx = jar.findIndex((x) => x.startsWith(`${name}=`));
    if (idx >= 0) jar[idx] = pair;
    else jar.push(pair);
  }
};
const cookie = () => jar.join('; ');
const csrf = () => (jar.find((c) => c.startsWith('ssg_csrf=')) || '').replace('ssg_csrf=', '');

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', cookie: cookie(), 'x-csrf-token': csrf() },
    body: body ? JSON.stringify(body) : undefined,
  });
  setCookies(res);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

const login = await api('POST', '/api/v1/auth/login', { identifier: ADMIN_ID, password: ADMIN_PW });
if (login.status !== 200) {
  console.error('Đăng nhập admin thất bại:', login.status, login.body?.message);
  process.exit(1);
}

const cats = await api('GET', '/api/v1/places/meta');
const categoryIds = (cats.body?.data?.categories || []).map((c) => c.id);

const existing = await api('GET', '/api/v1/admin/field-definitions?limit=200');
const existingKeys = new Set((existing.body?.data || []).map((d) => d.key));

let created = 0;
let skipped = 0;
for (const [groupKey, groupLabel, groupSort, fields] of GROUPS) {
  for (const f of fields) {
    if (existingKeys.has(f.key)) {
      skipped += 1;
      continue;
    }
    const res = await api('POST', '/api/v1/admin/field-definitions', {
      ...f,
      isPublic: true,
      categoryIds,
      fieldGroupKey: groupKey,
      fieldGroupLabel: groupLabel,
      fieldGroupSortOrder: groupSort,
    });
    if (res.status === 201) {
      created += 1;
      console.log('+', f.key, '—', f.label);
    } else {
      console.error('!', f.key, res.status, JSON.stringify(res.body).slice(0, 160));
    }
  }
}
console.log(`\nXong: tạo mới ${created}, bỏ qua ${skipped} (đã có).`);
