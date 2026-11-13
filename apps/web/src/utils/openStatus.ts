export interface OpenStatusInfo {
  isOpen: boolean;
  text: string;
  badgeType: 'open' | 'closing_soon' | 'closed' | 'open_24h';
  bg: string;
  color: string;
  border: string;
}

/**
 * Trả về trạng thái mở cửa chi tiết cho sinh viên:
 * - "Mở cửa 24/24" (ấm cúng)
 * - "Đang mở • Đóng lúc 22:30" (biết còn bao lâu)
 * - "Sắp đóng cửa (còn 25p)" (cảnh báo không nên gọi nước to)
 * - "Đã đóng • Mở lúc 07:00" (biết khi nào quay lại)
 * - "Đã đóng cửa"
 */
export function getDetailedOpenStatus(place: any): OpenStatusInfo {
  if (!place) {
    return {
      isOpen: false,
      text: 'Chưa có lịch mở cửa',
      badgeType: 'closed',
      bg: '#F5EFEB',
      color: '#7A6C60',
      border: '#EAE3D9',
    };
  }

  // 1. Quán mở 24/7 xuyên đêm
  const is24h = place.is24h || place.snapshot?.weeklySchedule?.some((s: any) => s?.is24h);
  if (is24h) {
    return {
      isOpen: true,
      text: 'Mở cửa 24/24',
      badgeType: 'open_24h',
      bg: '#F5EFEB',
      color: '#4A2E18',
      border: '#E4D5CA',
    };
  }

  const openStatus = place.openStatus;
  const currentShift = openStatus?.currentShift;
  const weeklySchedule = place.snapshot?.weeklySchedule || place.weeklySchedule || [];

  // 2. Quán đang mở cửa
  if (openStatus?.isOpen) {
    if (currentShift?.closeTime) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [ch, cm] = currentShift.closeTime.split(':').map(Number);
      let closeMinutes = (ch || 0) * 60 + (cm || 0);

      // Nếu ca qua đêm (ví dụ đóng lúc 02:00 sáng hôm sau)
      if (currentShift.isOvernight && closeMinutes < currentMinutes) {
        closeMinutes += 24 * 60;
      }

      const diff = closeMinutes - currentMinutes;

      // Cảnh báo nếu sắp đóng cửa trong vòng 45 phút
      if (diff > 0 && diff <= 45) {
        return {
          isOpen: true,
          text: `Sắp đóng (còn ${diff}p)`,
          badgeType: 'closing_soon',
          bg: '#FFF7E6',
          color: '#C67D34',
          border: '#FFD591',
        };
      }

      return {
        isOpen: true,
        text: `Đang mở • Đóng ${currentShift.closeTime}`,
        badgeType: 'open',
        bg: '#EDF4F0',
        color: '#2D5A43',
        border: '#CADDCF',
      };
    }

    return {
      isOpen: true,
      text: 'Đang mở cửa',
      badgeType: 'open',
      bg: '#EDF4F0',
      color: '#2D5A43',
      border: '#CADDCF',
    };
  }

  // 3. Quán đang đóng cửa: Kiểm tra xem hôm nay còn ca mở tiếp theo không
  const dow = new Date().getDay();
  const todaySchedule = weeklySchedule.find((x: any) => x?.dayOfWeek === dow);
  if (todaySchedule?.shifts?.length) {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const upcomingShift = todaySchedule.shifts.find((s: any) => {
      const [oh, om] = (s.openTime || '').split(':').map(Number);
      return (oh || 0) * 60 + (om || 0) > currentMinutes;
    });

    if (upcomingShift?.openTime) {
      return {
        isOpen: false,
        text: `Đã đóng • Mở lúc ${upcomingShift.openTime}`,
        badgeType: 'closed',
        bg: '#F5EFEB',
        color: '#7A6C60',
        border: '#EAE3D9',
      };
    }
  }

  return {
    isOpen: false,
    text: 'Đã đóng cửa',
    badgeType: 'closed',
    bg: '#F5EFEB',
    color: '#7A6C60',
    border: '#EAE3D9',
  };
}
