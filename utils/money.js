// utils/money.js —— 金额计算与格式化
// 所有求和一律换算成「分」再计算，避免浮点数误差（0.1 + 0.2 !== 0.3）

/** 元 -> 分（整数） */
function toCents(yuan) {
  const n = Number(yuan)
  if (!isFinite(n)) return 0
  return Math.round(n * 100)
}

/** 分 -> 元 */
function toYuan(cents) {
  return (Math.round(cents) / 100)
}

/** 精确求和：传入元数组，返回元 */
function sumYuan(list) {
  let c = 0
  for (let i = 0; i < list.length; i++) c += toCents(list[i])
  return toYuan(c)
}

/** 千分位格式化，digits: 0 表示不显示小数（但非整数时仍保留两位） */
function fmt(yuan, opts) {
  const o = opts || {}
  const forceDigits = o.digits === undefined ? null : o.digits
  const n = Number(yuan) || 0
  const neg = n < 0
  const abs = Math.abs(n)
  let intPart, decPart
  if (forceDigits === 0) {
    intPart = String(Math.round(abs))
    decPart = ''
  } else if (forceDigits === 2) {
    intPart = String(Math.floor(abs + 1e-9))
    decPart = String(Math.round((abs - Math.floor(abs + 1e-9)) * 100)).padStart(2, '0')
  } else {
    // 自适应：整数不显示小数，有角分则保留两位
    const rounded = Math.round(abs * 100) / 100
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
      intPart = String(Math.round(rounded))
      decPart = ''
    } else {
      intPart = String(Math.floor(rounded + 1e-9))
      decPart = String(Math.round((rounded - Math.floor(rounded + 1e-9)) * 100)).padStart(2, '0')
    }
  }
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (neg ? '-' : '') + intPart + (decPart ? '.' + decPart : '')
}

/** 带 ¥ 前缀 */
function yuan(yuanValue, opts) {
  return '¥' + fmt(yuanValue, opts)
}

/** 大额缩写：12345 -> 1.23万 */
function short(yuanValue) {
  const n = Number(yuanValue) || 0
  const abs = Math.abs(n)
  if (abs >= 100000000) return (n / 100000000).toFixed(2) + '亿'
  if (abs >= 10000) return (n / 10000).toFixed(abs >= 100000 ? 0 : 1) + '万'
  return fmt(n)
}

/** 百分比，返回整数 */
function pct(part, whole) {
  const w = Number(whole) || 0
  if (w <= 0) return 0
  return Math.round((Number(part) || 0) / w * 100)
}

/** 金额字符串 -> 元（解析用户输入，非法返回 0） */
function parse(str) {
  if (str === null || str === undefined) return 0
  const s = String(str).trim().replace(/[¥,，\s]/g, '')
  if (!s) return 0
  const n = Number(s)
  return isFinite(n) ? toYuan(toCents(n)) : 0
}

module.exports = {
  toCents,
  toYuan,
  sumYuan,
  fmt,
  yuan,
  short,
  pct,
  parse
}
