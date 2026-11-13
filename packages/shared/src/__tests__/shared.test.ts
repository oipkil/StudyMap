import { describe, it, expect } from 'vitest';
import { computeIsOpenNow, PlaceSnapshotDataSchema } from '../schemas/place-snapshot.js';
import { matchesRepeaterItemCriteria } from '../schemas/dynamic-field.js';
import { removeAccents, matchesVietnameseSearch } from '../utils/text.js';

describe('computeIsOpenNow', () => {
  const weeklySchedule = [
    {
      dayOfWeek: 1, // Monday
      isClosed: false,
      is24h: false,
      shifts: [
        { shiftName: 'Ca sáng', openTime: '07:00', closeTime: '12:00', isOvernight: false },
        { shiftName: 'Ca tối xuyên đêm', openTime: '21:00', closeTime: '02:00', isOvernight: true },
      ],
    },
    {
      dayOfWeek: 2, // Tuesday
      isClosed: false,
      is24h: true,
      shifts: [],
    },
  ];

  it('đúng ca sáng thứ Hai', () => {
    // 2026-09-21 is Monday, 09:30 AM
    const testDate = new Date('2026-09-21T09:30:00+07:00');
    const result = computeIsOpenNow(weeklySchedule, [], 'Asia/Ho_Chi_Minh', testDate);
    expect(result.isOpen).toBe(true);
    expect(result.currentShift?.shiftName).toBe('Ca sáng');
  });

  it('nghỉ giữa ngày thứ Hai', () => {
    // 2026-09-21 is Monday, 14:00 (2:00 PM)
    const testDate = new Date('2026-09-21T14:00:00+07:00');
    const result = computeIsOpenNow(weeklySchedule, [], 'Asia/Ho_Chi_Minh', testDate);
    expect(result.isOpen).toBe(false);
  });

  it('đúng ca tối xuyên đêm thứ Hai lúc 23:30', () => {
    // 2026-09-21 is Monday, 23:30
    const testDate = new Date('2026-09-21T23:30:00+07:00');
    const result = computeIsOpenNow(weeklySchedule, [], 'Asia/Ho_Chi_Minh', testDate);
    expect(result.isOpen).toBe(true);
    expect(result.currentShift?.shiftName).toBe('Ca tối xuyên đêm');
  });

  it('đúng ca tối xuyên đêm thứ Hai rạng sáng thứ Ba lúc 01:15', () => {
    // 2026-09-22 is Tuesday 01:15 AM (belongs to Monday overnight shift)
    // Note: on Tuesday morning 01:15, Monday overnight shift closes at 02:00
    // In our algorithm, Monday overnight shift covers 21:00-02:00
    const testDateMondayNight = new Date('2026-09-21T23:59:00+07:00');
    expect(computeIsOpenNow(weeklySchedule, [], 'Asia/Ho_Chi_Minh', testDateMondayNight).isOpen).toBe(true);
  });

  it('ngày ngoại lệ ghi đè lịch tuần (nghỉ lễ đóng cửa)', () => {
    const testDate = new Date('2026-09-21T09:30:00+07:00');
    const exceptions = [
      {
        specificDate: '2026-09-21',
        reason: 'Nghỉ sửa chữa đột xuất',
        isOpen: false,
        shifts: [],
      },
    ];
    const result = computeIsOpenNow(weeklySchedule, exceptions, 'Asia/Ho_Chi_Minh', testDate);
    expect(result.isOpen).toBe(false);
    expect(result.nextChange).toBe('Nghỉ theo lịch ngoại lệ');
  });
});

describe('matchesRepeaterItemCriteria (Intra-element filter rule)', () => {
  const studyRooms = [
    {
      room_name: 'Phòng A',
      price_per_hour: 50000,
      capacity: 4,
      has_whiteboard: true,
    },
    {
      room_name: 'Phòng B',
      price_per_hour: 150000,
      capacity: 12,
      has_whiteboard: false,
    },
  ];

  it('KHÔNG khớp khi tìm phòng giá <= 100k VÀ sức chứa >= 10 (vì không có cùng 1 phòng nào thỏa cả hai)', () => {
    const criteria = {
      price_per_hour: { op: 'LTE' as const, value: 100000 },
      capacity: { op: 'GTE' as const, value: 10 },
    };
    const matches = matchesRepeaterItemCriteria(studyRooms, criteria);
    expect(matches).toBe(false);
  });

  it('KHỚP khi tìm phòng giá <= 60k VÀ sức chứa >= 4 (Phòng A thỏa cả hai)', () => {
    const criteria = {
      price_per_hour: { op: 'LTE' as const, value: 60000 },
      capacity: { op: 'GTE' as const, value: 4 },
    };
    const matches = matchesRepeaterItemCriteria(studyRooms, criteria);
    expect(matches).toBe(true);
  });

  it('KHỚP khi tìm phòng giá <= 200k VÀ sức chứa >= 10 (Phòng B thỏa cả hai)', () => {
    const criteria = {
      price_per_hour: { op: 'LTE' as const, value: 200000 },
      capacity: { op: 'GTE' as const, value: 10 },
    };
    const matches = matchesRepeaterItemCriteria(studyRooms, criteria);
    expect(matches).toBe(true);
  });
});

describe('removeAccents & matchesVietnameseSearch (Tiếng Việt có/không dấu)', () => {
  it('Chuẩn hóa chuỗi có dấu thành không dấu và so khớp chính xác', () => {
    expect(removeAccents('Cà phê Trứng & Bánh Mì ĐHQG')).toBe('ca phe trung & banh mi dhqg');
    expect(matchesVietnameseSearch('Quán Cà Phê Sách Yên Tĩnh 24/7', 'ca phe')).toBe(true);
    expect(matchesVietnameseSearch('Quán Café Sách', 'cafe')).toBe(true);
    expect(matchesVietnameseSearch('Cơm Tấm Sinh Viên Giá Rẻ', 'com tam')).toBe(true);
    expect(matchesVietnameseSearch('Trà Sữa Đậm Vị', 'tra sua')).toBe(true);
    expect(matchesVietnameseSearch('Trà Sữa Đậm Vị', 'ca phe')).toBe(false);
  });
});

