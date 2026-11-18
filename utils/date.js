// utils/date.js —— 日期工具
// 统一约定：日期字符串 'YYYY-MM-DD'，月份键 'YYYY-MM'

const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/** Date -> 'YYYY-MM-DD' */
function toDateStr(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate())
}

/** 'YYYY-MM-DD' 或 Date -> 'YYYY-MM' */
function toMonthKey(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}$/.test(d)) return d
  const s = typeof d === 'string' ? d : toDateStr(d)
  return s.slice(0, 7)
}

/** 今天 'YYYY-MM-DD' */
function today() {
  return toDateStr(new Date())
}

/** 当前月 'YYYY-MM' */
function thisMonth() {
  return today().slice(0, 7)
}

/** yyyy-mm -> {y, m} */
function parseMonth(ym) {
  const p = String(ym).split('-')
  return { y: Number(p[0]), m: Number(p[1]) }
}

/** 某月天数 */
function daysInMonth(ym) {
  const { y, m } = parseMonth(ym)
  return new Date(y, m, 0).getDate()
}

/** 月份偏移：shiftMonth('2026-09', -1) -> '2026-08' */
function shiftMonth(ym, delta) {
  const { y, m } = parseMonth(ym)
  const d = new Date(y, m - 1 + delta, 1)
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1)
}

/** 月份中文显示：'2026-09' -> '2026年9月'；当月 -> '本月' */
function monthLabel(ym, opts) {
  const o = opts || {}
  const cur = thisMonth()
  if (o.relative !== false) {
    if (ym === cur) return '本月'
    if (ym === shiftMonth(cur, -1)) return '上月'
  }
  const { y, m } = parseMonth(ym)
  return y + '年' + m + '月'
}

/** 该月剩余天数（含今天）；非当月返回 0 */
function daysLeftInMonth(ym) {
  if (ym !== thisMonth()) return 0
  const total = daysInMonth(ym)
  const d = new Date().getDate()
  return Math.max(0, total - d + 1)
}

/** 该月已过天数；非当月返回该月总天数 */
function daysPassedInMonth(ym) {
  const total = daysInMonth(ym)
  if (ym !== thisMonth()) return total
  return Math.min(total, new Date().getDate())
}

/** '2026-09-28' -> '9月28日' */
function fmtMD(dateStr) {
  const p = String(dateStr).split('-')
  if (p.length < 3) return dateStr
  return Number(p[1]) + '月' + Number(p[2]) + '日'
}

/** '2026-09-28' -> '周日' */
function weekday(dateStr) {
  const d = new Date(dateStr.replace(/-/g, '/'))
  return WEEK_CN[d.getDay()] || ''
}

/** 人性化日期：今天 / 昨天 / 9月28日 周日 */
function human(dateStr) {
  const t = today()
  if (dateStr === t) return '今天 ' + weekday(dateStr)
  if (dateStr === toDateStr(new Date(Date.now() - 86400000))) return '昨天 ' + weekday(dateStr)
  return fmtMD(dateStr) + ' ' + weekday(dateStr)
}

/** 月内某天 -> 日号 */
function dayOf(dateStr) {
  return Number(String(dateStr).slice(8, 10)) || 0
}

/** 距目标日期还有多少天（负数表示已过期） */
function daysUntil(dateStr) {
  if (!dateStr) return null
  const target = new Date(String(dateStr).replace(/-/g, '/') + ' 23:59:59').getTime()
  const now = Date.now()
  return Math.ceil((target - now) / 86400000)
}

module.exports = {
  WEEK_CN,
  pad2,
  toDateStr,
  toMonthKey,
  today,
  thisMonth,
  parseMonth,
  daysInMonth,
  shiftMonth,
  monthLabel,
  daysLeftInMonth,
  daysPassedInMonth,
  fmtMD,
  weekday,
  human,
  dayOf,
  daysUntil
}
