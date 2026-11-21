// utils/safe.js —— 输入校验与数据清洗层
// ---------------------------------------------------------------------------
// 对外开放后的第一条铁律：**任何来自外部的内容都不可信**。
// 外部内容 = 用户键盘输入、粘贴进来的备份文本、以后可能有的接口返回、二维码、
// 剪贴板……一律先过这一层，再进 store。
//
// 这一层的职责只有两件事：
//   1) 白名单重建 —— 不是"过滤掉坏的"，而是"只挑出认识的字段重新拼一个对象"。
//      黑名单永远漏，白名单不会漏。
//   2) 限额封顶 —— 任何能被外部撑大的东西（条数、月数、文本长度、金额）都要有上限，
//      否则一次恶意粘贴就能把本地存储撑爆、把渲染拖死。
// ---------------------------------------------------------------------------

const C = require('./categories.js')
const M = require('./money.js')
const D = require('./date.js')

const LIMITS = {
  NOTE: 30,               // 备注长度
  GOAL_NAME: 20,          // 目标名称长度
  MONTHS: 36,             // 备份最多接受多少个月
  RECORDS_PER_MONTH: 2000,// 单月最多多少笔
  RECORDS_TOTAL: 20000,   // 备份合计最多多少笔
  GOALS: 30,              // 攒钱目标最多个数
  CUSTOM_QUICK: 8,        // 首页自定义金额档位最多个数
  ID_LEN: 32,
  AMOUNT_MAX: 9999999.99, // 单笔金额上限（约一千万元）
  DELTA_MAX: 9999999.99,  // 目标存取单次变动上限
  IMPORT_TEXT: 2 * 1024 * 1024, // 备份文本上限 2MB
  YEAR_MIN: 2000,
  YEAR_MAX: 2100
}

/* ---------------- 基础类型 ---------------- */

/** 月份键：必须是 2000-2100 之间的 'YYYY-MM' */
function isMonthKey(v) {
  const s = String(v || '')
  if (!/^\d{4}-\d{2}$/.test(s)) return false
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  return y >= LIMITS.YEAR_MIN && y <= LIMITS.YEAR_MAX && m >= 1 && m <= 12
}

/** 日期串：'YYYY-MM-DD'，并且是真实存在的日期（挡住 2026-02-30） */
function isDateStr(v) {
  const s = String(v || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const y = Number(s.slice(0, 4))
  const m = Number(s.slice(5, 7))
  const d = Number(s.slice(8, 10))
  if (y < LIMITS.YEAR_MIN || y > LIMITS.YEAR_MAX) return false
  if (m < 1 || m > 12) return false
  if (d < 1 || d > new Date(y, m, 0).getDate()) return false
  return true
}

/**
 * 文本清洗：去控制字符 / 双向覆写字符 / 尖括号，trim 后截断。
 * 去尖括号是纵深防御：小程序 text 节点本身会转义，但备注会流向
 * 导出文件、分享图、以及网页版，任何一处拼进 HTML 都是注入点。
 */
function cleanText(v, max) {
  if (v === null || v === undefined) return ''
  let s = String(v)
  s = s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')       // 控制字符（含换行、制表）
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '') // 零宽 / 双向覆写
  s = s.replace(/[<>]/g, '')                                // 尖括号
  s = s.trim()
  const cap = max || LIMITS.NOTE
  if (s.length > cap) s = s.slice(0, cap)
  return s
}

/** 金额：非负数，两位小数，超限一律按 0 处理（宁可漏记，不可脏记） */
function cleanAmount(v) {
  const c = M.toCents(v)
  if (!isFinite(c) || c < 0) return 0
  if (c > M.toCents(LIMITS.AMOUNT_MAX)) return 0
  return M.toYuan(c)
}

/** 目标存取变动：允许负数（取出），同样封顶 */
function cleanDelta(v) {
  const c = M.toCents(v)
  if (!isFinite(c)) return 0
  const max = M.toCents(LIMITS.DELTA_MAX)
  if (c > max) return max
  if (c < -max) return -max
  return M.toYuan(c)
}

function cleanType(v) {
  return v === 'income' ? 'income' : 'expense'
}

/** 分类 key 必须在当前类型的白名单里，否则落到「其他」 */
function cleanCat(key, type) {
  const list = C.catsOf(cleanType(type))
  const k = String(key || '')
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === k) return k
  }
  return type === 'income' ? 'other_in' : 'other'
}

function cleanDate(v) {
  return isDateStr(v) ? String(v) : ''
}

function cleanId(v) {
  const s = String(v || '')
  if (/^[A-Za-z0-9_-]{1,32}$/.test(s)) return s
  return ''
}

/** 时间戳：必须是合理的数字（2000-01-01 ~ 明天），否则用日期推一个 */
function cleanTs(v, dateStr) {
  const n = Number(v)
  const min = new Date(LIMITS.YEAR_MIN + '-01-01').getTime()
  const max = Date.now() + 86400000
  if (isFinite(n) && n >= min && n <= max) return Math.round(n)
  const t = new Date(String(dateStr).replace(/-/g, '/') + ' 12:00:00').getTime()
  return isFinite(t) ? t : Date.now()
}

/* ---------------- 对象级：白名单重建 ---------------- */

/** 收入/支出记录 —— 只保留认识的 6 个字段，其余全部丢弃 */
function cleanRecord(r, uid) {
  if (!r || typeof r !== 'object') return null
  const type = cleanType(r.type)
  const date = cleanDate(r.date)
  if (!date) return null                       // 日期不合法 → 整条丢弃
  const amount = cleanAmount(r.amount)
  if (!(amount > 0)) return null               // 金额为 0 / 非法 → 整条丢弃
  return {
    id: cleanId(r.id) || uid('r'),
    type: type,
    amount: amount,
    cat: cleanCat(r.cat, type),
    note: cleanText(r.note, LIMITS.NOTE),
    date: date,
    ts: cleanTs(r.ts, date)
  }
}

/** 攒钱目标 */
function cleanGoal(g, uid) {
  if (!g || typeof g !== 'object') return null
  const name = cleanText(g.name, LIMITS.GOAL_NAME)
  if (!name) return null
  const target = cleanAmount(g.target)
  if (!(target > 0)) return null
  const saved = Math.min(cleanAmount(g.saved), LIMITS.AMOUNT_MAX)
  const logs = []
  if (Array.isArray(g.logs)) {
    const cap = Math.min(g.logs.length, 500)
    for (let i = 0; i < cap; i++) {
      const l = g.logs[i]
      if (!l || typeof l !== 'object') continue
      const amt = cleanDelta(l.amount)
      if (!amt) continue
      const date = cleanDate(l.date) || D.today()
      logs.push({ amount: amt, date: date, ts: cleanTs(l.ts, date), note: cleanText(l.note, LIMITS.NOTE) })
    }
  }
  return {
    id: cleanId(g.id) || uid('g'),
    name: name,
    emoji: cleanText(g.emoji, 4) || '🎯',
    target: target,
    saved: saved,
    deadline: cleanDate(g.deadline),
    createdAt: cleanTs(g.createdAt, D.today()),
    logs: logs
  }
}

/** 设置项 —— 只认已知键，未知键一律忽略（防止往存储里塞垃圾） */
function cleanSettings(s) {
  const out = {}
  if (!s || typeof s !== 'object') return out
  if (typeof s.budget === 'object' && s.budget) {
    const b = {}
    const total = cleanAmount(s.budget.total)
    b.total = total                      // 允许为 0（表示取消总预算）
    const cats = s.budget.cats
    const cb = {}
    if (cats && typeof cats === 'object') {
      Object.keys(cats).forEach(function (k) {
        const key = cleanCat(k, 'expense')
        const v = cleanAmount(cats[k])
        if (v > 0) cb[key] = v
      })
    }
    b.cats = cb
    out.budget = b
  }
  if (typeof s.nickname === 'string') out.nickname = cleanText(s.nickname, 12)
  if (typeof s.theme === 'string' && /^[a-z]{2,12}$/.test(s.theme)) out.theme = s.theme
  if (['dark', 'light', 'system'].indexOf(s.appearance) >= 0) out.appearance = s.appearance
  // 自定义金额档位：只认合法分类/备注/金额，最多 CUSTOM_QUICK 个
  if (Array.isArray(s.customQuick)) {
    out.customQuick = s.customQuick.slice(0, LIMITS.CUSTOM_QUICK).map(function (it) {
      if (!it || typeof it !== 'object') return null
      const cat = cleanCat(it.cat, 'expense')
      if (!cat) return null
      const amount = cleanAmount(it.amount)
      if (!(amount > 0)) return null
      return { cat: cat, note: cleanText(it.note, LIMITS.NOTE), amount: amount }
    }).filter(Boolean)
  }
  return out
}

/* ---------------- 备份文件级 ---------------- */

/** 解析备份文本：先控大小，再控结构，最后逐条清洗 */
function parseBackup(text, uid) {
  const raw = String(text === null || text === undefined ? '' : text)
  if (!raw.trim()) return { ok: false, msg: '没读到内容，请先复制备份文本' }
  if (raw.length > LIMITS.IMPORT_TEXT) {
    return { ok: false, msg: '备份内容过大（超过 2MB），请确认复制的是本小程序的备份' }
  }

  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    return { ok: false, msg: '文本格式不对，请检查是否完整复制了备份内容' }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, msg: '这不是本小程序的备份内容' }
  }
  if (data.app !== 'mama-ledger') {
    return { ok: false, msg: '这不是本小程序的备份内容' }
  }
  if (!data.months || typeof data.months !== 'object' || Array.isArray(data.months)) {
    return { ok: false, msg: '备份里没有找到账目数据' }
  }

  const ymList = Object.keys(data.months).filter(isMonthKey)
  if (ymList.length > LIMITS.MONTHS) {
    return { ok: false, msg: '备份月份过多（上限 ' + LIMITS.MONTHS + ' 个月），已拒绝导入' }
  }

  const months = {}
  let kept = 0
  let dropped = 0
  for (let i = 0; i < ymList.length; i++) {
    const ym = ymList[i]
    const list = Array.isArray(data.months[ym]) ? data.months[ym] : []
    const out = []
    const cap = Math.min(list.length, LIMITS.RECORDS_PER_MONTH)
    for (let j = 0; j < cap; j++) {
      const rec = cleanRecord(list[j], uid)
      if (rec) {
        // 记录自身日期必须落在它所属的月份里，否则视为伪造
        if (D.toMonthKey(rec.date) === ym) { out.push(rec); kept++ } else { dropped++ }
      } else {
        dropped++
      }
      if (kept >= LIMITS.RECORDS_TOTAL) break
    }
    if (out.length) months[ym] = out
    if (kept >= LIMITS.RECORDS_TOTAL) break
  }

  const goals = []
  if (Array.isArray(data.goals)) {
    const gcap = Math.min(data.goals.length, LIMITS.GOALS)
    for (let i = 0; i < gcap; i++) {
      const g = cleanGoal(data.goals[i], uid)
      if (g) goals.push(g)
    }
  }

  return {
    ok: true,
    months: months,
    settings: cleanSettings(data.settings),
    goals: goals,
    kept: kept,
    dropped: dropped,
    msg: '已恢复 ' + kept + ' 笔记录、' + goals.length + ' 个攒钱目标' +
      (dropped ? '（已跳过 ' + dropped + ' 条异常数据）' : '')
  }
}

/** 表格导出防公式注入：以 = + - @ 开头的单元格前面加单引号 */
function csvCell(v) {
  let s = String(v === null || v === undefined ? '' : v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
  return s
}

module.exports = {
  LIMITS,
  isMonthKey,
  isDateStr,
  cleanText,
  cleanAmount,
  cleanDelta,
  cleanType,
  cleanCat,
  cleanDate,
  cleanId,
  cleanTs,
  cleanRecord,
  cleanGoal,
  cleanSettings,
  parseBackup,
  csvCell
}
