// Nhãn tiếng Việt cho các enum tiện ích học tập (dùng chung Chi tiết quán / So sánh / Khám phá).
export const WIFI_LABEL: Record<string, string> = {
  NONE: 'Không có',
  WEAK: 'Yếu',
  MODERATE: 'Ổn',
  STRONG: 'Mạnh',
  UNKNOWN: 'Chưa có thông tin',
};

export const SOCKET_LABEL: Record<string, string> = {
  NONE: 'Không có',
  SPARSE: 'Ít',
  MANY: 'Nhiều',
  EVERY_TABLE: 'Mỗi bàn đều có',
  UNKNOWN: 'Chưa có thông tin',
};

export const NOISE_LABEL: Record<string, string> = {
  SILENT: 'Rất yên tĩnh',
  QUIET: 'Yên tĩnh',
  MODERATE: 'Vừa phải',
  LOUD: 'Ồn',
  UNKNOWN: 'Chưa có thông tin',
};

export const STUDY_LABEL: Record<string, string> = {
  POOR: 'Kém',
  FAIR: 'Tạm',
  GOOD: 'Tốt',
  EXCELLENT: 'Rất tốt',
  UNKNOWN: 'Chưa có thông tin',
};

export const PARKING_LABEL: Record<string, string> = {
  FREE: 'Miễn phí',
  PAID: 'Có phí',
  NONE: 'Không có chỗ',
  UNKNOWN: 'Chưa có thông tin',
};

/** Trả nhãn tiếng Việt; nếu không có trong bảng thì trả nguyên giá trị (không đoán). */
export const labelOf = (map: Record<string, string>, value?: string | null) =>
  value ? map[value] ?? value : 'Chưa có thông tin';
