// Sinh lại mục "2. Bảng tính năng" của docs/bao-cao-tinh-nang.md từ docs/evidence/full-run/results.json
// để số thứ tự / tên ảnh luôn khớp lần chạy mới nhất. Cách chạy: node scripts/build-report-section.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const results = JSON.parse(readFileSync('docs/evidence/full-run/results.json', 'utf8'));
const report = 'docs/bao-cao-tinh-nang.md';
let md = readFileSync(report, 'utf8');

const groups = [];
for (const r of results) {
  let g = groups.find((x) => x.name === r.group);
  if (!g) { g = { name: r.group, rows: [] }; groups.push(g); }
  g.rows.push(r);
}

let out = '## 2. Bảng tính năng — đã kiểm bằng trình duyệt (ảnh trong `docs/evidence/full-run/`)\n\n';
out += `Tổng: **${results.filter((r) => r.ok).length}/${results.length} bước PASS** (lần chạy ${new Date().toLocaleString('vi-VN')}). Mỗi dòng là một bước kịch bản thật trên Chromium; cột "Bước" mô tả đúng thao tác và điều kiện kiểm tra.\n\n`;
let n = 0;
for (const g of groups) {
  out += `### ${g.name}\n\n| # | Bước (thao tác + điều kiện pass) | Kết quả | Lỗi API | Ảnh |\n|---|---|---|---|---|\n`;
  for (const r of g.rows) {
    n += 1;
    const api = (r.apiErrors || []).length ? r.apiErrors.join('; ') : '';
    out += `| ${n} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL: ' + (r.error || '')} | ${api} | \`${r.shot}\` |\n`;
  }
  out += '\n';
}

const start = md.indexOf('## 2. Bảng tính năng');
const end = md.indexOf('### Tính năng chỉ kiểm bằng test tự động');
if (start < 0 || end < 0) throw new Error('Không tìm thấy mốc mục 2 trong báo cáo');
md = md.slice(0, start) + out + md.slice(end).replace('### 2.7 Tính năng chỉ kiểm bằng test tự động', '### Tính năng chỉ kiểm bằng test tự động');
writeFileSync(report, md);
console.log(`Đã cập nhật mục 2: ${results.length} bước, ${groups.length} nhóm`);
