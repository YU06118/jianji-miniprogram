/**
 * 日期工具：统一存 ISO 8601 字符串 + 毫秒时间戳双字段；展示按东八区（UTC+8）。
 * 跨月/跨年/闰年/月末边界由单测覆盖。所有计算基于 UTC 快照，不依赖设备时区。
 */

/** 东八区相对 UTC 的偏移毫秒数 */
export const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 一天的毫秒数 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 把任意时间点转换为「东八区 Date 快照」。
 * 做法：把毫秒加上 8 小时后，用 getUTC* 系列读取，得到东八区的年月日。
 */
export function toUTC8Date(input: number | string | Date): Date {
  let ms: number;
  if (input instanceof Date) {
    ms = input.getTime();
  } else if (typeof input === 'number') {
    ms = input;
  } else {
    ms = Date.parse(input);
  }
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid date input: ${String(input)}`);
  }
  return new Date(ms + UTC8_OFFSET_MS);
}

/** 取东八区当前的 YYYY-MM-DD */
export function todayISO8(nowMs: number = Date.now()): string {
  return dateToISO8(nowMs);
}

/** 把毫秒时间戳格式化为东八区 YYYY-MM-DD */
export function dateToISO8(ms: number): string {
  const d = toUTC8Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 取东八区当前月份 YYYY-MM */
export function monthOf(ms: number = Date.now()): string {
  return dateToISO8(ms).slice(0, 7);
}

/** 从 YYYY-MM-DD 提取月份 YYYY-MM */
export function monthOfDate(date: string): string {
  return date.slice(0, 7);
}

/** 从 YYYY-MM-DD 解析为东八区当天 00:00:00 的 UTC 毫秒时间戳 */
export function startOfDayMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  // 东八区 00:00 等价于 UTC 前一天 16:00
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0) - UTC8_OFFSET_MS;
}

/** 从 YYYY-MM-DD 解析为东八区次日 00:00:00 的 UTC 毫秒时间戳 */
export function endOfDayMs(date: string): number {
  return startOfDayMs(date) + DAY_MS;
}

/** 月份加减，返回 YYYY-MM；支持跨年 */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}`;
}

/** 是否为闰年 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 某年某月的天数 */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 把「日」夹到该月最后一天（处理 31 日 -> 2 月等边界） */
export function clampDayToMonth(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month));
}

/** 年月日三元组（日期滚轮等组件共用） */
export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/**
 * 把日期夹到 [minYear-01-01, max] 区间，并收拢越界的日（大小月/闰年）。
 * 供日期滚轮在初始化与滚动吸附时共用，保证「可回溯到 2015、不可晚于今天」。
 */
export function clampSelectableDate(
  year: number,
  month: number,
  day: number,
  minYear: number,
  max: DateParts,
): DateParts {
  if (year < minYear) return { year: minYear, month: 1, day: 1 };
  if (year > max.year) return { ...max };
  if (year === max.year) {
    if (month > max.month) return { ...max };
    if (month === max.month && day > max.day) {
      return { year, month, day: max.day };
    }
  }
  const safeMonth = Math.min(12, Math.max(1, month));
  return { year, month: safeMonth, day: Math.min(Math.max(1, day), daysInMonth(year, safeMonth)) };
}

/**
 * 生成 ISO 8601 字符串（UTC，带 Z），同时给出毫秒数值。
 * 采用 UTC 存储，展示时才转东八区。
 */
export function nowISOWithMs(nowMs: number = Date.now()): { iso: string; ms: number } {
  return { iso: new Date(nowMs).toISOString(), ms: nowMs };
}

/** 校验 YYYY-MM-DD 是否为合法日历日期（含闰年 2/29） */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

/** 校验 YYYY-MM 是否合法 */
export function isValidMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const m = Number(month.slice(5, 7));
  return m >= 1 && m <= 12;
}
