/**
 * 日期边界单测（阶段 0 §3.3 / §8.4）：跨月、跨年、闰年、月末、东八区跨日。
 */

import {
  UTC8_OFFSET_MS,
  clampSelectableDate,
  dateToISO8,
  daysInMonth,
  endOfDayMs,
  isLeapYear,
  isValidDate,
  monthOfDate,
  shiftMonth,
  startOfDayMs,
} from '../date';

describe('东八区日期', () => {
  it('UTC 16:00 对应东八区次日 00:00（跨日边界）', () => {
    const utcMs = Date.UTC(2026, 0, 1, 16, 0, 0, 0);
    expect(dateToISO8(utcMs)).toBe('2026-01-02');
  });

  it('UTC 15:59 仍为东八区当日 23:59', () => {
    const utcMs = Date.UTC(2026, 0, 1, 15, 59, 0, 0);
    expect(dateToISO8(utcMs)).toBe('2026-01-01');
  });

  it('东八区当天 00:00 的 UTC 毫秒 = UTC 前一日 16:00', () => {
    expect(startOfDayMs('2026-01-02')).toBe(Date.UTC(2026, 0, 1, 16, 0, 0, 0));
    expect(endOfDayMs('2026-01-01')).toBe(startOfDayMs('2026-01-02'));
  });
});

describe('跨月与跨年', () => {
  it('1/31 -> 2/1 不串月', () => {
    expect(monthOfDate('2026-01-31')).toBe('2026-01');
    expect(monthOfDate('2026-02-01')).toBe('2026-02');
  });

  it('12/31 -> 1/1 跨年', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('连续月份切换不丢失月份', () => {
    expect(shiftMonth('2024-02', 12)).toBe('2025-02');
  });
});

describe('闰年与月末', () => {
  it('闰年 2 月 29 日合法', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(isValidDate('2024-02-29')).toBe(true);
  });

  it('平年 2 月 29 日非法', () => {
    expect(isLeapYear(2025)).toBe(false);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(isValidDate('2025-02-29')).toBe(false);
  });

  it('世纪年非 400 倍数为平年', () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('31 日与 30 日月份天数正确', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe('偏移常量', () => {
  it('东八区偏移为 8 小时', () => {
    expect(UTC8_OFFSET_MS).toBe(28_800_000);
  });
});

describe('clampSelectableDate（第四阶段：日期滚轮边界）', () => {
  const max = { year: 2026, month: 11, day: 26 };

  it.each([
    [2010, 5, 3, { year: 2015, month: 1, day: 1 }],
    [2020, 2, 29, { year: 2020, month: 2, day: 29 }],
    [2025, 2, 29, { year: 2025, month: 2, day: 28 }],
    [2025, 4, 31, { year: 2025, month: 4, day: 30 }],
    [2026, 11, 30, { year: 2026, month: 11, day: 26 }],
    [2026, 12, 1, { year: 2026, month: 11, day: 26 }],
    [2027, 1, 1, { year: 2026, month: 11, day: 26 }],
    [2026, 11, 3, { year: 2026, month: 11, day: 3 }],
  ])('夹取 %i-%i-%i -> %j', (y, m, d, expected) => {
    expect(clampSelectableDate(y, m, d, 2015, max)).toEqual(expected);
  });

  it('2015-01-01 恰好可选（下限包含）', () => {
    expect(clampSelectableDate(2015, 1, 1, 2015, max)).toEqual({ year: 2015, month: 1, day: 1 });
  });

  it('今天恰好可选（上限包含）', () => {
    expect(clampSelectableDate(2026, 11, 26, 2015, max)).toEqual(max);
  });
});
