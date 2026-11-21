// utils/store.js —— 数据层
// 存储策略：按「月」分片存储流水，避免单个 storage key 撑爆 1MB 上限
//   ledger_index_v1     -> ['2026-09', '2026-08', ...]  月份索引（降序）
//   ledger_rec_YYYY-MM  -> [ 记录... ]
//   ledger_settings_v1  -> { budget: { total, cats } }
//   ledger_goals_v1     -> [ 目标... ]
//   ledger_meta_v1      -> { openCount, createdAt }

const M = require('./money.js')
const D = require('./date.js')
const C = require('./categories.js')
const S = require('./safe.js')   // 输入校验与清洗（所有外部内容必经此层）

const K_INDEX = 'ledger_index_v1'
const K_REC = 'ledger_rec_'
const K_SETTINGS = 'ledger_settings_v1'
const K_GOALS = 'ledger_goals_v1'
const K_META = 'ledger_meta_v1'
const K_SEEDED = 'ledger_seeded_v1'

/* ---------------- 底层读写 ---------------- */

const storage = {
  get(key, def) {
    try {
      const v = wx.getStorageSync(key)
      if (v === '' || v === undefined || v === null) return def
      return v
    } catch (e) {
      return def
    }
  },
  set(key, val) {
    try {
      wx.setStorageSync(key, val)
      return true
    } catch (e) {
      return false
    }
  },
  remove(key) {
    try {
      wx.removeStorageSync(key)
    } catch (e) { /* ignore */ }
  }
}

/* ---------------- 写入结果可观测性 ----------------
 * P0：storage.set 失败原本静默返回 false，12+ 调用方无一检查，
 * 存储满时页面仍弹「记好了」，用户以为已保存实则丢数据。
 * 关键写走 writeOrWarn（记录结果 + 通知 UI）；尽力写（meta/索引）仍用 storage.set。
 */
let _lastCriticalOk = true
let _writeFailHandler = null

/** app.js 启动时注册一次；仅关键写失败才回调 */
function setWriteFailHandler(fn) {
  _writeFailHandler = typeof fn === 'function' ? fn : null
}

/** 紧邻一次用户写操作后调用：false = 这次真的没落盘 */
function lastWriteOk() { return _lastCriticalOk }

/** 关键写：记录结果并通知 UI，返回是否成功 */
function writeOrWarn(key, val) {
  let ok = false
  try { wx.setStorageSync(key, val); ok = true }
  catch (e) { ok = false }
  _lastCriticalOk = ok
  if (!ok && _writeFailHandler) {
    try { _writeFailHandler(key) } catch (ignore) { }
  }
  return ok
}

function uid(prefix) {
  return (prefix || 'r') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/* ---------------- 初始化 ---------------- */

function initIfEmpty() {
  const meta = getMeta()
  if (!meta.createdAt) {
    meta.createdAt = Date.now()
    saveMeta(meta)
  }
  if (!storage.get(K_INDEX, null)) storage.set(K_INDEX, [])
  if (!storage.get(K_SETTINGS, null)) storage.set(K_SETTINGS, defaultSettings())
}

function defaultSettings() {
  return {
    budget: { total: 0, cats: {} },
    currency: '¥',
    theme: 'pink',          // 主题色：pink / lilac / blue / matcha
    appearance: 'dark',     // 外观模式：dark / light / system（默认深色）
    nickname: '',
    seeded: false
  }
}

/* 主题色白名单：只有这四套，外部传什么都落回 pink */
const THEMES = ['pink', 'lilac', 'blue', 'matcha']
const THEME_NAMES = { pink: '系统蓝', lilac: '紫罗兰', blue: '青蓝', matcha: '森绿' }
/* 原生导航栏用色：微信原生导航栏不认 CSS 变量，只能靠 API 设色，
   所以这里必须与 app.wxss 里 .t-xxx 定义的 --pink 逐一对齐 */
const THEME_NAV = { pink: '#0078D4', lilac: '#6B4EFF', blue: '#00809D', matcha: '#0E7C3A' }

function getTheme() {
  const t = String(getSettings().theme || 'pink')
  return THEMES.indexOf(t) >= 0 ? t : 'pink'
}

/** 供页面根节点绑定：class="page {{theme}}" */
function themeClass() {
  return 't-' + getTheme()
}

/** 当前主题的品牌色（原生导航栏设色用） */
function themeColor() {
  return THEME_NAV[getTheme()] || THEME_NAV.pink
}

/**
 * 品牌色的浅色档，用于图表柱子（0 = 原色，数值越大越接近白）。
 * 图表色不能用 CSS 变量，只能由 JS 算出来——否则切主题时页面变了、图表还是旧色。
 */
function themeTint(t) {
  const base = themeColor()
  const n = Math.max(0, Math.min(0.85, Number(t) || 0))
  const ch = [1, 3, 5].map(function (i) {
    const c = parseInt(base.slice(i, i + 2), 16)
    const v = Math.round(c + (255 - c) * n)
    return ((v < 16 ? '0' : '') + v.toString(16)).toUpperCase()
  })
  return '#' + ch.join('')
}

function setTheme(name) {
  const t = String(name || '')
  if (THEMES.indexOf(t) === -1) return getTheme()
  saveSettings({ theme: t })
  return t
}

function themeList() {
  return THEMES.map(function (k) { return { key: k, name: THEME_NAMES[k], cls: 't-' + k } })
}

/* ---------------- 外观模式（深色 / 浅色 / 跟随系统） ---------------- */
const APPEARANCES = ['dark', 'light', 'system']
function getAppearance() {
  const a = String(getSettings().appearance || 'dark')
  return APPEARANCES.indexOf(a) >= 0 ? a : 'dark'
}

function setAppearance(v) {
  const a = String(v || '')
  if (APPEARANCES.indexOf(a) === -1) return getAppearance()
  saveSettings({ appearance: a })
  return a
}

function systemIsDark() {
  try { return (wx.getSystemInfoSync().theme || 'light') === 'dark' }
  catch (e) { return false }
}

/** 当前是否深色：显式深色，或跟随系统且系统是深色 */
function isDark() {
  const a = getAppearance()
  return a === 'dark' || (a === 'system' && systemIsDark())
}

/** 供页面根节点绑定：class="page {{theme}} {{modeClass}}" */
function modeClass() {
  return isDark() ? 'mode-dark' : 'mode-light'
}

/** 原生导航栏底色：固定深紫黑 + 白字（四套主题、深浅模式统一，不随主题变化） */
function navColor() {
  return '#1E1A2E'
}

/** 外观模式选项列表（设置页 segmented 用） */
function appearanceList() {
  return [
    { key: 'dark', name: '深色' },
    { key: 'light', name: '浅色' },
    { key: 'system', name: '跟随系统' }
  ]
}

/* ---------------- 月份索引 ---------------- */

/** 月份索引：过滤掉非法月份键，并给索引长度封顶 */
function getMonthKeys() {
  const list = storage.get(K_INDEX, [])
  if (!Array.isArray(list)) return []
  return list.filter(S.isMonthKey).slice(0, S.LIMITS.MONTHS + 12)
}

function ensureMonthKey(ym) {
  if (!S.isMonthKey(ym)) return
  const list = getMonthKeys()
  if (list.indexOf(ym) === -1) {
    list.push(ym)
    list.sort(function (a, b) { return a < b ? 1 : (a > b ? -1 : 0) })
    storage.set(K_INDEX, list)
  }
}

function dropMonthKey(ym) {
  const list = getMonthKeys().filter(function (k) { return k !== ym })
  storage.set(K_INDEX, list)
}

/* ---------------- 流水 ---------------- */

/** 读取某月流水（已按时间倒序）；非法月份键直接返回空，避免用外部字符串拼 storage key */
function getRecords(ym) {
  if (!S.isMonthKey(ym)) return []
  const list = storage.get(K_REC + ym, [])
  return Array.isArray(list) ? list.slice(0, S.LIMITS.RECORDS_PER_MONTH) : []
}

function saveRecords(ym, list) {
  if (!S.isMonthKey(ym)) return
  const safeList = (Array.isArray(list) ? list : []).slice(0, S.LIMITS.RECORDS_PER_MONTH)
  writeOrWarn(K_REC + ym, safeList)
  if (safeList.length) ensureMonthKey(ym)
  else dropMonthKey(ym)
}

/** 写入一笔，自动落到记录自身日期所属月份；金额非法返回 null（不落库） */
function addRecord(rec) {
  const r = rec && typeof rec === 'object' ? rec : {}
  const date = S.cleanDate(r.date) || D.today()
  const ym = D.toMonthKey(date)
  const amount = S.cleanAmount(r.amount)
  if (!(amount > 0)) return null
  const type = S.cleanType(r.type)
  const item = {
    id: S.cleanId(r.id) || uid('r'),
    type: type,
    amount: amount,
    cat: S.cleanCat(r.cat, type),
    note: S.cleanText(r.note, S.LIMITS.NOTE),
    date: date,
    ts: S.cleanTs(r.ts, date)
  }
  const list = getRecords(ym)
  list.unshift(item)
  list.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0) })
  saveRecords(ym, list)
  return item
}

function deleteRecord(ym, id) {
  if (!S.isMonthKey(ym)) return []
  const list = getRecords(ym).filter(function (r) { return r.id !== id })
  saveRecords(ym, list)
  return list
}

/** 修改一笔：只允许改这 4 个字段，id / ts 不接受外部覆盖 */
function updateRecord(ym, id, patch) {
  if (!S.isMonthKey(ym)) return getRecords(ym)
  const p = patch && typeof patch === 'object' ? patch : {}
  const list = getRecords(ym).map(function (r) {
    if (r.id !== id) return r
    const type = S.cleanType(p.type === undefined ? r.type : p.type)
    const newDate = S.cleanDate(p.date)
    const date = newDate || r.date
    const merged = {
      id: r.id,
      type: type,
      amount: S.cleanAmount(p.amount === undefined ? r.amount : p.amount),
      cat: S.cleanCat(p.cat === undefined ? r.cat : p.cat, type),
      note: S.cleanText(p.note === undefined ? r.note : p.note, S.LIMITS.NOTE),
      date: date,
      ts: S.cleanTs(p.ts === undefined ? r.ts : p.ts, date)
    }
    return merged
  })
  saveRecords(ym, list)
  return list
}

/** 合并读取多个月份的记录（默认最近 3 个月），用于标签学习与导出 */
function getAllRecords(monthsLimit) {
  const keys = getMonthKeys()
  const limit = monthsLimit || 3
  const use = keys.slice(0, limit)
  let out = []
  for (let i = 0; i < use.length; i++) out = out.concat(getRecords(use[i]))
  return out
}

/* ---------------- 设置 ---------------- */

function getSettings() {
  const s = storage.get(K_SETTINGS, null)
  if (!s || typeof s !== 'object') return defaultSettings()
  if (!s.budget) s.budget = { total: 0, cats: {} }
  if (!s.budget.cats) s.budget.cats = {}
  return s
}

/** 设置写库前先过白名单，未知字段一律不落盘 */
function saveSettings(s) {
  const merged = Object.assign(defaultSettings(), getSettings(), S.cleanSettings(s))
  writeOrWarn(K_SETTINGS, merged)
  return merged
}

function getMeta() {
  const m = storage.get(K_META, null)
  return (m && typeof m === 'object') ? m : {}
}

function saveMeta(m) {
  storage.set(K_META, m)
  return m
}

/* ---------------- 攒钱目标 ---------------- */

function getGoals() {
  const list = storage.get(K_GOALS, [])
  return Array.isArray(list) ? list.slice(0, S.LIMITS.GOALS) : []
}

function saveGoals(list) {
  const safeList = (Array.isArray(list) ? list : []).slice(0, S.LIMITS.GOALS)
  writeOrWarn(K_GOALS, safeList)
  return safeList
}

function addGoal(goal) {
  const item = S.cleanGoal(goal, uid)
  if (!item) return null
  const list = getGoals()
  list.push(item)
  saveGoals(list)
  return item
}

/** 修改目标：名称 / 图标 / 目标额 / 已存额 / 目标日 之外的字段不可被外部覆盖 */
function updateGoal(id, patch) {
  const p = patch && typeof patch === 'object' ? patch : {}
  const list = getGoals().map(function (g) {
    if (g.id !== id) return g
    const merged = {
      id: g.id,
      name: S.cleanText(p.name === undefined ? g.name : p.name, S.LIMITS.GOAL_NAME) || g.name,
      emoji: S.cleanText(p.emoji === undefined ? g.emoji : p.emoji, 4) || g.emoji,
      target: S.cleanAmount(p.target === undefined ? g.target : p.target) || g.target,
      saved: Math.max(0, S.cleanAmount(p.saved === undefined ? g.saved : p.saved)),
      deadline: p.deadline === undefined ? g.deadline : S.cleanDate(p.deadline),
      createdAt: g.createdAt,
      logs: Array.isArray(g.logs) ? g.logs.slice(-500) : []
    }
    return merged
  })
  saveGoals(list)
  return list
}

function deleteGoal(id) {
  const list = getGoals().filter(function (g) { return g.id !== id })
  saveGoals(list)
  return list
}

/** 给目标存一笔 / 取一笔（delta 为正表示存钱） */
function depositToGoal(id, delta, note) {
  const d = S.cleanDelta(delta)
  if (!d) return getGoals()
  const list = getGoals().map(function (g) {
    if (g.id !== id) return g
    const next = Object.assign({}, g)
    const raw = M.toCents(next.saved) + M.toCents(d)
    next.saved = M.toYuan(Math.max(0, Math.min(raw, M.toCents(S.LIMITS.AMOUNT_MAX))))
    next.logs = (Array.isArray(next.logs) ? next.logs : []).slice(-499).concat([{
      amount: d,
      date: D.today(),
      ts: Date.now(),
      note: S.cleanText(note, S.LIMITS.NOTE)
    }])
    return next
  })
  saveGoals(list)
  return list
}

/* ---------------- 统计聚合 ---------------- */

/** 单月汇总 */
function summary(ym) {
  const month = ym || D.thisMonth()
  const list = getRecords(month)
  const expenseList = list.filter(function (r) { return r.type === 'expense' })
  const incomeList = list.filter(function (r) { return r.type === 'income' })

  const expense = M.sumYuan(expenseList.map(function (r) { return r.amount }))
  const income = M.sumYuan(incomeList.map(function (r) { return r.amount }))

  // 分类聚合
  const catMap = {}
  for (let i = 0; i < expenseList.length; i++) {
    const r = expenseList[i]
    if (!catMap[r.cat]) catMap[r.cat] = { key: r.cat, amount: 0, count: 0, cents: 0 }
    catMap[r.cat].cents += M.toCents(r.amount)
    catMap[r.cat].count += 1
  }
  let byCat = Object.keys(catMap).map(function (k) {
    const c = catMap[k]
    const meta = C.getCat(k)
    return {
      key: k,
      name: meta.name,
      emoji: meta.emoji,
      color: meta.color,
      amount: M.toYuan(c.cents),
      count: c.count,
      pct: expense > 0 ? Math.round(M.toYuan(c.cents) / expense * 100) : 0
    }
  })
  byCat.sort(function (a, b) { return b.amount - a.amount })

  // 按天聚合
  const total = D.daysInMonth(month)
  const byDay = []
  for (let d = 1; d <= total; d++) byDay.push({ day: d, amount: 0 })
  for (let i = 0; i < expenseList.length; i++) {
    const day = D.dayOf(expenseList[i].date)
    if (day >= 1 && day <= total) byDay[day - 1].amount += M.toCents(expenseList[i].amount)
  }
  for (let i = 0; i < byDay.length; i++) byDay[i].amount = M.toYuan(byDay[i].amount)

  let maxDay = { day: 0, amount: 0 }
  for (let i = 0; i < byDay.length; i++) {
    if (byDay[i].amount > maxDay.amount) maxDay = { day: byDay[i].day, amount: byDay[i].amount }
  }

  const passed = D.daysPassedInMonth(month)

  return {
    ym: month,
    expense,
    income,
    balance: M.toYuan(M.toCents(income) - M.toCents(expense)),
    count: list.length,
    dayCount: expenseList.length,
    byCat,
    byDay,
    maxDay,
    topCat: byCat.length ? byCat[0] : null,
    avgPerDay: passed > 0 ? M.toYuan(Math.round(M.toCents(expense) / passed)) : 0,
    passed
  }
}

/** 近 n 个月总支出（含本月），返回升序数组 */
function recentMonths(n, endYm) {
  const end = endYm || D.thisMonth()
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const ym = D.shiftMonth(end, -i)
    const list = getRecords(ym).filter(function (r) { return r.type === 'expense' })
    const cents = list.reduce(function (s, r) { return s + M.toCents(r.amount) }, 0)
    const p = D.parseMonth(ym)
    out.push({ ym, label: p.m + '月', amount: M.toYuan(cents) })
  }
  return out
}

/** 近 n 天支出（含今天），用于首页小趋势 */
function recentDays(n) {
  const out = []
  const base = Date.now()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base - i * 86400000)
    const ds = D.toDateStr(d)
    const ym = ds.slice(0, 7)
    const list = getRecords(ym).filter(function (r) { return r.type === 'expense' && r.date === ds })
    const cents = list.reduce(function (s, r) { return s + M.toCents(r.amount) }, 0)
    out.push({ date: ds, label: ds.slice(8, 10), amount: M.toYuan(cents) })
  }
  return out
}

/**
 * 预算预警核心
 * 返回 { hasBudget, total, used, left, pct, status, daysLeft, dailyLeft,
 *        avgPerDay, forecast, forecastOver, pace, cats, advice, tone }
 */
function budgetStatus(ym) {
  const month = ym || D.thisMonth()
  const s = getSettings()
  const total = M.parse(s.budget.total)
  const sum = summary(month)
  const used = sum.expense
  const daysLeft = Math.max(0, D.daysInMonth(month) - D.daysPassedInMonth(month)) + (month === D.thisMonth() ? 1 : 0)
  const passed = Math.max(1, D.daysPassedInMonth(month))

  const left = M.toYuan(M.toCents(total) - M.toCents(used))
  const pct = total > 0 ? Math.min(999, Math.round(used / total * 100)) : 0

  // 时间进度 vs 花钱进度 —— 事前预警的关键
  const monthDays = D.daysInMonth(month)
  const timeRatio = passed / monthDays
  const moneyRatio = total > 0 ? used / total : 0
  const pace = total > 0 ? moneyRatio - timeRatio : 0 // 正数=花得比时间快

  // 按当前速度外推月底总额
  const avgPerDay = used / passed
  const forecast = M.toYuan(Math.round(M.toCents(avgPerDay) * monthDays))
  const forecastOver = M.toYuan(Math.max(0, M.toCents(forecast) - M.toCents(total)))

  // 综合状态
  let status = 'ok'
  if (total > 0) {
    if (pct >= 100) status = 'over'
    else if (pct >= 80 || pace >= 0.15) status = 'warn'
  }

  // 剩余每天可花额度
  const dailyLeft = daysLeft > 0 && left > 0
    ? M.toYuan(Math.round(M.toCents(left) / daysLeft))
    : 0
  // 建议日均（把整月预算摊平）
  const suggestDaily = total > 0 ? M.toYuan(Math.round(M.toCents(total) / monthDays)) : 0

  // 分项预算
  const cats = []
  const catBudget = s.budget.cats || {}
  const catUsedMap = {}
  for (let i = 0; i < sum.byCat.length; i++) catUsedMap[sum.byCat[i].key] = sum.byCat[i].amount
  Object.keys(catBudget).forEach(function (k) {
    const b = M.parse(catBudget[k])
    if (b <= 0) return
    const u = catUsedMap[k] || 0
    const p = Math.round(u / b * 100)
    const meta = C.getCat(k)
    cats.push({
      key: k,
      name: meta.name,
      emoji: meta.emoji,
      color: meta.color,
      budget: b,
      used: u,
      left: M.toYuan(M.toCents(b) - M.toCents(u)),
      pct: p,
      status: p >= 100 ? 'over' : (p >= 80 ? 'warn' : 'ok')
    })
  })
  cats.sort(function (a, b) { return b.pct - a.pct })

  const advice = buildAdvice({ total, used, left, pct, status, daysLeft, dailyLeft, forecast, forecastOver, pace, cats })
  const tone = status === 'over' ? 'over' : (status === 'warn' ? 'warn' : 'ok')

  return {
    hasBudget: total > 0,
    total,
    used,
    left,
    pct,
    status,
    tone,
    daysLeft: month === D.thisMonth() ? D.daysLeftInMonth(month) : 0,
    dailyLeft,
    suggestDaily,
    avgPerDay: M.toYuan(Math.round(M.toCents(avgPerDay))),
    forecast,
    forecastOver,
    pace: Math.round(pace * 100),
    cats,
    advice
  }
}

/** 生成一句人话预警，而不是甩一个百分比给人 */
function buildAdvice(o) {
  if (!o.total) {
    return { title: '还没设预算', body: '设一个每月总额，我才能帮你看住钱袋子。', action: '去设预算' }
  }
  if (o.status === 'over') {
    return {
      title: '这个月已经超支了',
      body: '超出 ¥' + M.fmt(o.pct >= 100 ? Math.abs(o.left) : 0) + '，' +
        (o.daysLeft > 0 ? '还剩 ' + o.daysLeft + ' 天，先停掉非必要的开销。' : '下个月把预算调准一点。'),
      action: '看看钱花哪了'
    }
  }
  if (o.forecastOver > 0) {
    return {
      title: '按这个速度，月底要超',
      body: '照现在的节奏会花到 ¥' + M.fmt(o.forecast) + '，比预算多 ¥' + M.fmt(o.forecastOver) +
        '。接下来每天控制在 ¥' + M.fmt(o.dailyLeft) + ' 以内就能拉回来。',
      action: '调整预算'
    }
  }
  if (o.status === 'warn') {
    return {
      title: '这个月要悠着点',
      body: '已经花掉 ' + o.pct + '%，还剩 ' + o.daysLeft + ' 天，每天可花 ¥' + M.fmt(o.dailyLeft) + '。',
      action: '看看钱花哪了'
    }
  }
  return {
    title: '节奏很好，继续保持',
    body: '剩 ' + o.daysLeft + ' 天，每天可花 ¥' + M.fmt(o.dailyLeft) + '，安心花。',
    action: ''
  }
}

/** 学习出来的快捷记账标签 */
function quickTags(limit) {
  const max = limit || 6
  const all = getAllRecords(3)
  const groups = {}
  for (let i = 0; i < all.length; i++) {
    const r = all[i]
    const label = r.note || C.catName(r.cat)
    const key = r.type + '|' + r.cat + '|' + label
    if (!groups[key]) {
      groups[key] = {
        type: r.type, cat: r.cat, label: label,
        count: 0, amounts: {}, lastTs: 0,
        lastAmount: 0, lastOccTs: -1
      }
    }
    const g = groups[key]
    const a = M.parse(r.amount)
    const ts = r.ts || 0
    g.count += 1
    g.amounts[a] = (g.amounts[a] || 0) + 1
    if (ts > g.lastTs) g.lastTs = ts
    if (ts > g.lastOccTs) { g.lastOccTs = ts; g.lastAmount = a }
  }

  const arr = []
  Object.keys(groups).forEach(function (k) {
    const g = groups[k]
    if (g.count < 2) return
    // 取出现次数最多的金额；每次都不一样时，用最近一次用过的金额
    // （「早餐」记了 12、15、14，用户下次多半还是随手记最近那个数）
    let bestAmt = g.lastAmount
    let bestN = 0
    Object.keys(g.amounts).forEach(function (a) {
      const n = g.amounts[a]
      if (n > bestN) { bestN = n; bestAmt = Number(a) }
    })
    if (bestN <= 1) bestAmt = g.lastAmount
    arr.push({
      type: g.type,
      cat: g.cat,
      note: g.label,
      amount: bestAmt,
      count: g.count,
      learned: true,
      lastTs: g.lastTs
    })
  })

  arr.sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count
    return b.lastTs - a.lastTs
  })

  let out = arr.slice(0, max)

  // 数据不足时用默认标签补齐
  if (out.length < 4) {
    const used = {}
    for (let i = 0; i < out.length; i++) used[out[i].cat + '|' + out[i].note] = true
    for (let i = 0; i < C.DEFAULT_QUICK.length; i++) {
      const d = C.DEFAULT_QUICK[i]
      if (out.length >= max) break
      if (used[d.cat + '|' + d.note]) continue
      out.push({ type: d.type, cat: d.cat, note: d.note, amount: d.amount, count: 0, learned: false })
    }
  }
  return out
}

/** 总体使用情况 */
function stats() {
  const keys = getMonthKeys()
  let total = 0
  for (let i = 0; i < keys.length; i++) total += getRecords(keys[i]).length
  const meta = getMeta()
  return {
    months: keys.length,
    records: total,
    firstDate: keys.length ? keys[keys.length - 1] + '-01' : '',
    createdAt: meta.createdAt || 0
  }
}

/* ---------------- 备份与恢复 ---------------- */

function exportJSON() {
  const keys = getMonthKeys()
  const months = {}
  for (let i = 0; i < keys.length; i++) months[keys[i]] = getRecords(keys[i])
  const payload = {
    app: 'mama-ledger',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    goals: getGoals(),
    months: months
  }
  return JSON.stringify(payload)
}

/**
 * 从备份文本恢复。这是外部文本进入本系统的唯一入口，全部清洗后再落盘：
 * 控大小 → 验结构 → 白名单重建每一条 → 限额封顶。
 * 返回 { ok, msg }
 */
function importJSON(text) {
  const r = S.parseBackup(text, uid)
  if (!r.ok) return r
  const keys = Object.keys(r.months)
  for (let i = 0; i < keys.length; i++) {
    saveRecords(keys[i], r.months[keys[i]])
  }
  if (r.settings && Object.keys(r.settings).length) saveSettings(r.settings)
  if (r.goals.length) saveGoals(getGoals().concat(r.goals))
  return { ok: true, msg: r.msg, dropped: r.dropped }
}

/** 清空全部数据 */
function clearAll() {
  const keys = getMonthKeys()
  for (let i = 0; i < keys.length; i++) storage.remove(K_REC + keys[i])
  storage.remove(K_INDEX)
  storage.remove(K_SETTINGS)
  storage.remove(K_GOALS)
  storage.remove(K_META)
  storage.remove(K_SEEDED)
  initIfEmpty()
}

/** 一键填入示例数据（首次体验用） */
function seedDemo() {
  const today = D.today()
  const ym = D.thisMonth()
  // 清掉本月已有记录，避免重复
  saveRecords(ym, [])
  const plan = [
    ['grocery', '菜市场买菜', 86, 1],
    ['food', '早餐', 12, 1],
    ['kid', '宝宝奶粉', 268, 2],
    ['transport', '打车', 28, 2],
    ['grocery', '水果', 42, 3],
    ['daily', '纸巾日用', 56, 4],
    ['food', '外卖午饭', 32, 5],
    ['kid', '兴趣班', 600, 6],
    ['home', '水电燃气', 186, 7],
    ['food', '奶茶', 18, 8],
    ['grocery', '菜市场买菜', 92, 9],
    ['social', '同事随礼', 500, 10],
    ['food', '早餐', 15, 11],
    ['daily', '超市日用', 128, 12],
    ['clothing', '宝宝衣服', 159, 13],
    ['transport', '加油', 300, 14],
    ['grocery', '菜市场买菜', 78, 15],
    ['food', '家庭聚餐', 268, 16],
    ['medical', '儿童体检', 220, 17],
    ['kid', '玩具', 89, 18],
    ['food', '早餐', 14, 19],
    ['grocery', '水果', 56, 20],
    ['daily', '洗护用品', 96, 21],
    ['fun', '周末游乐场', 180, 22],
    ['grocery', '买菜', 88, 23],
    ['food', '外卖晚饭', 46, 24]
  ]
  const out = []
  const base = Date.now() - 3600000 * 40
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]
    const day = String(p[3]).padStart(2, '0')
    const date = ym + '-' + day
    if (date > today) continue
    out.push({
      id: uid('r'),
      type: 'expense',
      amount: p[2],
      cat: p[0],
      note: p[1],
      date: date,
      ts: base + i * 3600000
    })
  }
  out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0) })
  saveRecords(ym, out)

  // 顺带填一个默认预算
  const s = getSettings()
  if (!s.budget.total) {
    s.budget.total = 8000
    s.budget.cats = { grocery: 1500, food: 1200, kid: 2000, daily: 600, social: 600, transport: 600 }
    saveSettings(s)
  }
  if (!getGoals().length) {
    addGoal({ name: '宝宝教育金', emoji: '🎓', target: 50000, saved: 12000, deadline: '' })
  }
  return out.length
}

module.exports = {
  // 写入结果可观测性（P0）
  setWriteFailHandler,
  lastWriteOk,
  // 基础
  initIfEmpty,
  getMonthKeys,
  getRecords,
  saveRecords,
  addRecord,
  deleteRecord,
  updateRecord,
  getAllRecords,
  // 设置
  getSettings,
  saveSettings,
  getMeta,
  saveMeta,
  defaultSettings,
  // 主题
  getTheme,
  setTheme,
  themeClass,
  themeColor,
  themeTint,
  themeList,
  THEMES,
  // 外观模式
  getAppearance,
  setAppearance,
  systemIsDark,
  isDark,
  modeClass,
  navColor,
  appearanceList,
  // 目标
  getGoals,
  saveGoals,
  addGoal,
  updateGoal,
  deleteGoal,
  depositToGoal,
  // 统计
  summary,
  recentMonths,
  recentDays,
  budgetStatus,
  quickTags,
  stats,
  // 备份
  exportJSON,
  importJSON,
  clearAll,
  seedDemo
}
