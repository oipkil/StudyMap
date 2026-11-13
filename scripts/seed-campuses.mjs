// Thêm các cơ sở trường ĐHQG-HCM thường gặp vào bảng campuses qua API admin (idempotent — bỏ qua tên đã có).
//   node scripts/seed-campuses.mjs                    -> máy dev (http://localhost:4000)
//   BASE=https://studymap.online ADMIN_ID=... ADMIN_PW=... node scripts/seed-campuses.mjs
const BASE = process.env.BASE || 'http://localhost:4000';
const ADMIN_ID = process.env.ADMIN_ID || 'admin@ssg.edu.vn';
const ADMIN_PW = process.env.ADMIN_PW || 'Admin@123456';

const CAMPUSES = [
  { name: 'ĐH Khoa học Tự nhiên - Cơ sở 1', universityName: 'ĐHQG-HCM', address: '227 Nguyễn Văn Cừ, Phường 4, Quận 5, TP.HCM', latitude: 10.762622, longitude: 106.682331 },
  { name: 'ĐH Khoa học Tự nhiên - Cơ sở 2', universityName: 'ĐHQG-HCM', address: 'Khu phố 6, Phường Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.875635, longitude: 106.799738 },
  { name: 'ĐH Bách Khoa - Cơ sở 1', universityName: 'ĐHQG-HCM', address: '268 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM', latitude: 10.772535, longitude: 106.657924 },
  { name: 'ĐH Bách Khoa - Cơ sở 2', universityName: 'ĐHQG-HCM', address: 'Khu phố Tân Lập, Phường Đông Hòa, TP. Dĩ An, Bình Dương', latitude: 10.880838, longitude: 106.805562 },
  { name: 'ĐH Khoa học Xã hội & Nhân văn - Cơ sở 1', universityName: 'ĐHQG-HCM', address: '10-12 Đinh Tiên Hoàng, Phường Bến Nghé, Quận 1, TP.HCM', latitude: 10.787625, longitude: 106.701142 },
  { name: 'ĐH Khoa học Xã hội & Nhân văn - Cơ sở 2', universityName: 'ĐHQG-HCM', address: 'Khu phố 6, Phường Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.871583, longitude: 106.80206 },
  { name: 'ĐH Quốc tế', universityName: 'ĐHQG-HCM', address: 'Khu phố 6, Phường Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.877684, longitude: 106.803055 },
  { name: 'ĐH Công nghệ Thông tin', universityName: 'ĐHQG-HCM', address: 'Khu phố 6, Phường Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.870014, longitude: 106.803076 },
  { name: 'ĐH Kinh tế - Luật', universityName: 'ĐHQG-HCM', address: '669 Quốc lộ 1, Phường Linh Xuân, TP. Thủ Đức, TP.HCM', latitude: 10.87031, longitude: 106.78591 },
  { name: 'KTX Khu A ĐHQG-HCM', universityName: 'ĐHQG-HCM', address: 'Phường Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.878954, longitude: 106.804561 },
  { name: 'KTX Khu B ĐHQG-HCM', universityName: 'ĐHQG-HCM', address: 'Phường Đông Hòa, TP. Dĩ An, Bình Dương', latitude: 10.883452, longitude: 106.807895 },
  // Khu vực nhóm khảo sát chính: ĐH FPT TP.HCM (Khu Công nghệ cao) và Làng đại học Thủ Đức
  { name: 'ĐH FPT TP.HCM', universityName: 'ĐH FPT', address: 'Lô E2a-7, Đường D1, Khu Công nghệ cao, P. Long Thạnh Mỹ, TP. Thủ Đức, TP.HCM', latitude: 10.841127, longitude: 106.809883 },
  { name: 'Nhà Văn hóa Sinh viên TP.HCM (Làng đại học)', universityName: 'ĐHQG-HCM', address: 'Đường Lưu Hữu Phước, KP6, P. Đông Hòa, TP. Dĩ An, Bình Dương', latitude: 10.875222, longitude: 106.801389 },
  { name: 'Thư viện Trung tâm ĐHQG-HCM', universityName: 'ĐHQG-HCM', address: 'Khu phố 6, P. Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.875361, longitude: 106.804306 },
  { name: 'ĐH Nông Lâm TP.HCM', universityName: 'ĐH Nông Lâm', address: 'Khu phố 6, P. Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.871583, longitude: 106.791806 },
  { name: 'ĐH Sư phạm Kỹ thuật TP.HCM', universityName: 'ĐH SPKT', address: '1 Võ Văn Ngân, P. Linh Chiểu, TP. Thủ Đức, TP.HCM', latitude: 10.850611, longitude: 106.771889 },
  { name: 'ĐH An ninh Nhân dân', universityName: 'ĐH ANND', address: 'Km 18 Xa lộ Hà Nội, P. Linh Trung, TP. Thủ Đức, TP.HCM', latitude: 10.867333, longitude: 106.784167 },
];

const jar = {};
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const remember = (res) => {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
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
const csrf = jar.ssg_csrf;

const existing = await fetch(`${BASE}/api/v1/admin/reference/campuses`, { headers: { Cookie: cookieHeader() } }).then((r) => r.json());
const have = new Set((existing.data || []).map((c) => c.name.trim().toLowerCase()));
let added = 0;
for (const c of CAMPUSES) {
  if (have.has(c.name.toLowerCase())) continue;
  const r = await fetch(`${BASE}/api/v1/admin/reference/campuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(), 'x-csrf-token': csrf },
    body: JSON.stringify(c),
  });
  console.log(r.status, c.name);
  if (r.ok) added++;
}
console.log(`Đã thêm ${added} cơ sở (đã có ${have.size}).`);
