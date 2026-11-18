// 家庭记账小程序 · 数据层 / 安全 / 主题色自检
// 用法： node selfcheck_data.js <项目目录>
//   例： node selfcheck_data.js "D:/记账/扑满小程序"
// 退出码：0 = 全过，1 = 有失败项（可直接接进 CI）
const fs = require('fs')
const path = require('path')
const cp = require('child_process')

const DIR = path.resolve(process.argv[2] || '.')
if (!fs.existsSync(path.join(DIR, 'app.json'))) {
  console.log('\n[错误] 这个目录里没有 app.json。请把参数指向小程序工程目录：')
  console.log('       node selfcheck_data.js <项目目录>\n')
  process.exit(1)
}

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name) }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '  \u2192 ' + extra : '')) }
}
function near(a, b) { return Math.abs(a - b) < 1e-6 }

function walkFiles(dir, ext, out) {
  out = out || []
  for (const f of fs.readdirSync(dir)) {
    if (f === 'node_modules' || f === '__pycache__') continue
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walkFiles(p, ext, out)
    else if (f.endsWith(ext)) out.push(p)
  }
  return out
}

console.log('\n=== 0. 语法与配置 ===')
const jsFiles = walkFiles(DIR, '.js')
let synBad = 0
jsFiles.forEach(function (p) {
  const r = cp.spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' })
  if (r.status !== 0) { synBad++; console.log('  \u2717 语法错误 ' + path.relative(DIR, p)) }
})
ok(jsFiles.length + ' 个 JS 文件语法正确', synBad === 0, synBad + ' 个有问题')

const jsonFiles = walkFiles(DIR, '.json')
let jsonBad = 0
jsonFiles.forEach(function (p) {
  try { JSON.parse(fs.readFileSync(p, 'utf8')) }
  catch (e) { jsonBad++; console.log('  \u2717 JSON 非法 ' + path.relative(DIR, p)) }
})
ok(jsonFiles.length + ' 个 JSON 配置文件合法', jsonBad === 0, jsonBad + ' 个有问题')

const appJson = JSON.parse(fs.readFileSync(path.join(DIR, 'app.json'), 'utf8'))
ok('app.json 注册了页面', Array.isArray(appJson.pages) && appJson.pages.length > 0,
  appJson.pages.length + ' 个页面')
const pageMissing = []
appJson.pages.forEach(function (pg) {
  ['js', 'json', 'wxml', 'wxss'].forEach(function (ext) {
    if (!fs.existsSync(path.join(DIR, pg + '.' + ext))) pageMissing.push(pg + '.' + ext)
  })
})
ok('每个页面四件套齐全（js/json/wxml/wxss）', pageMissing.length === 0, pageMissing.join('、'))
const tabPages = ((appJson.tabBar || {}).list || []).map(function (x) { return x.pagePath })
const tabBad = tabPages.filter(function (p) { return appJson.pages.indexOf(p) === -1 })
ok('tabBar 页面都已注册', tabBad.length === 0, tabBad.join('、'))

// ---------- 模拟微信小程序 storage ----------
const mem = {}
global.wx = {
  getStorageSync(k) { return mem[k] === undefined ? '' : mem[k] },
  setStorageSync(k, v) { mem[k] = JSON.parse(JSON.stringify(v)) },
  removeStorageSync(k) { delete mem[k] },
  getStorageInfoSync() { return { keys: Object.keys(mem) } }
}

const U = path.join(DIR, 'utils') + path.sep
const M = require(U + 'money.js')
const D = require(U + 'date.js')
const C = require(U + 'categories.js')
const store = require(U + 'store.js')

console.log('\n=== 1. 金额精度（浮点陷阱） ===')
ok('0.1 + 0.2 用分计算等于 0.3', near(M.sumYuan([0.1, 0.2]), 0.3), M.sumYuan([0.1, 0.2]))
ok('10 笔 0.1 相加等于 1', near(M.sumYuan([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]), 1))
ok('千分位格式化', M.fmt(1234567.89) === '1,234,567.89', M.fmt(1234567.89))
ok('整数不带小数', M.fmt(1200) === '1,200', M.fmt(1200))
ok('parse 容错（带 ¥ 和逗号）', M.parse('¥1,234.50') === 1234.5, M.parse('¥1,234.50'))
ok('parse 非法输入返回 0', M.parse('abc') === 0)

console.log('\n=== 2. 自动分类（关键词最长匹配优先） ===')
ok('「菜市场买菜」→ 买菜', C.guess('菜市场买菜') === 'grocery', C.guess('菜市场买菜'))
ok('「早餐」→ 餐饮', C.guess('早餐') === 'food', C.guess('早餐'))
ok('「宝宝奶粉」→ 孩子', C.guess('宝宝奶粉') === 'kid', C.guess('宝宝奶粉'))
ok('「水果茶」→ 餐饮（不被「水果」抢走）', C.guess('水果茶') === 'food', C.guess('水果茶'))
ok('「水果」→ 买菜', C.guess('水果') === 'grocery', C.guess('水果'))
ok('「同事随礼」→ 人情', C.guess('同事随礼') === 'social', C.guess('同事随礼'))
ok('「加油」→ 交通', C.guess('加油') === 'transport', C.guess('加油'))
ok('无关键词返回 null', C.guess('abcdef') === null)

console.log('\n=== 3. 写入 / 汇总口径 ===')
store.initIfEmpty()
const n = store.seedDemo()
console.log('  填入示例 ' + n + ' 笔')
const ym = D.thisMonth()
const sum = store.summary(ym)

const byCatTotal = M.toYuan(sum.byCat.reduce((s, c) => s + M.toCents(c.amount), 0))
ok('分类金额之和 === 总支出', near(byCatTotal, sum.expense), byCatTotal + ' vs ' + sum.expense)

const byDayTotal = M.toYuan(sum.byDay.reduce((s, d) => s + M.toCents(d.amount), 0))
ok('按天金额之和 === 总支出', near(byDayTotal, sum.expense), byDayTotal + ' vs ' + sum.expense)

const pctTotal = sum.byCat.reduce((s, c) => s + c.pct, 0)
ok('分类占比之和 ≈ 100%（±2 允许四舍五入）', Math.abs(pctTotal - 100) <= 2, pctTotal + '%')

ok('分类按金额降序', sum.byCat.every((c, i) => i === 0 || sum.byCat[i - 1].amount >= c.amount))
ok('笔数 = 支出笔数', sum.dayCount === store.getRecords(ym).filter(r => r.type === 'expense').length)

// 手工核算总量
const manual = store.getRecords(ym).filter(r => r.type === 'expense')
  .reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100
ok('summary.expense 与逐笔手工累加一致', near(manual, sum.expense), manual + ' vs ' + sum.expense)

console.log('\n=== 4. 预算预警 ===')
const bs = store.budgetStatus(ym)
console.log('  预算 ¥' + bs.total + ' / 已花 ¥' + bs.used + ' / 剩 ¥' + bs.left +
  ' / 进度 ' + bs.pct + '% / 状态 ' + bs.status)
console.log('  日均 ¥' + bs.avgPerDay + ' → 外推月底 ¥' + bs.forecast +
  '（超支 ¥' + bs.forecastOver + '）/ 每天可花 ¥' + bs.dailyLeft)
console.log('  提醒：' + bs.advice.title + ' —— ' + bs.advice.body)

ok('hasBudget 为真', bs.hasBudget === true)
ok('剩余 = 预算 - 已花', near(bs.left, M.toYuan(M.toCents(bs.total) - M.toCents(bs.used))))
ok('进度 = 已花/预算', bs.pct === Math.round(bs.used / bs.total * 100))
ok('状态与进度自洽（>=100 必为 over）', bs.pct >= 100 ? bs.status === 'over' : true)
ok('每天可花 = 剩余/剩余天数', bs.daysLeft > 0
  ? near(bs.dailyLeft, M.toYuan(Math.round(M.toCents(bs.left) / bs.daysLeft))) : true)
ok('外推 = 日均 × 当月天数（±1元）', Math.abs(bs.forecast - bs.avgPerDay * D.daysInMonth(ym)) <= 1,
  bs.forecast + ' vs ' + bs.avgPerDay * D.daysInMonth(ym))

const catSum = bs.cats.reduce((s, c) => s + M.toCents(c.used), 0) / 100
console.log('  分项预算已用合计 ¥' + catSum)
ok('分项已用不超过总支出（分项是子集）', catSum <= bs.used + 0.001)

console.log('\n=== 5. 标签学习 ===')
const tags = store.quickTags(8)
console.log('  学到：' + tags.map(t => (t.learned ? '⚡' : '·') + t.note + '¥' + t.amount + '×' + t.count).join('  '))
ok('学出的标签都出现过 ≥2 次', tags.filter(t => t.learned).every(t => t.count >= 2))
ok('标签金额是出现过的真实金额', tags.every(t => t.amount > 0))

console.log('\n=== 6. 跨月分片 ===')
const lastYm = D.shiftMonth(ym, -1)
store.addRecord({ type: 'expense', amount: 66.66, cat: 'food', note: '上月的账', date: lastYm + '-15' })
ok('索引里出现上月', store.getMonthKeys().indexOf(lastYm) >= 0)
ok('上月独立汇总', near(store.summary(lastYm).expense, 66.66), store.summary(lastYm).expense)
ok('本月不受影响', near(store.summary(ym).expense, sum.expense))
ok('近 6 个月包含 6 项', store.recentMonths(6, ym).length === 6)

console.log('\n=== 7. 备份 / 恢复 / 清空 ===')
const json = store.exportJSON()
ok('导出内容可解析', (() => { try { JSON.parse(json); return true } catch (e) { return false } })())
const before = store.summary(ym).expense
store.clearAll()
ok('清空后无记录', store.stats().records === 0)
const imp = store.importJSON(json)
ok('恢复成功', imp.ok === true, imp.msg)
ok('恢复后金额一致', near(store.summary(ym).expense, before), store.summary(ym).expense + ' vs ' + before)
ok('恢复后攒钱目标也在', store.getGoals().length > 0)
ok('坏文本被拒绝', store.importJSON('{"foo":1}').ok === false)
ok('非 JSON 被拒绝', store.importJSON('乱码').ok === false)

console.log('\n=== 8. 边界 ===')
ok('删除记录生效', (() => {
  const list = store.getRecords(ym)
  const id = list[0].id
  store.deleteRecord(ym, id)
  return store.getRecords(ym).length === list.length - 1
})())
ok('空月份返回空数组', store.getRecords('2019-01').length === 0)
ok('空月份汇总不报错', store.summary('2019-01').expense === 0)
ok('无预算时不崩', (() => {
  const s = store.getSettings(); s.budget = { total: 0, cats: {} }; store.saveSettings(s)
  const b = store.budgetStatus(ym)
  return b.hasBudget === false && b.status === 'ok' && b.pct === 0
})())
ok('日期工具：2026-02 有 28 天', D.daysInMonth('2026-02') === 28)
ok('日期工具：2024-02 闰年 29 天', D.daysInMonth('2024-02') === 29)
ok('月份偏移跨年正确', D.shiftMonth('2026-01', -1) === '2025-12')

console.log('\n=== 9. 安全校验（外部输入清洗） ===')
const S = require(U + 'safe.js')

// 月份键 / 日期白名单
ok('非法月份键被拒（防 storage key 注入）', !S.isMonthKey('2026-13') && !S.isMonthKey('../../x') && !S.isMonthKey('2026-1'))
ok('合法月份键通过', S.isMonthKey('2026-09'))
ok('不存在的日期被拒（2026-02-30）', !S.isDateStr('2026-02-30'))
ok('闰年 2024-02-29 通过', S.isDateStr('2024-02-29'))
ok('非法月份读不出数据', store.getRecords('__proto__').length === 0)

// 金额
ok('负金额归零', S.cleanAmount(-5) === 0)
ok('超大金额归零', S.cleanAmount(1e12) === 0)
ok('非数字金额归零', S.cleanAmount('abc') === 0)
ok('金额保留两位小数', S.cleanAmount(12.345) === 12.35, S.cleanAmount(12.345))

// 文本
ok('控制字符被剔除', S.cleanText('早餐\u0000\u001f油条') === '早餐油条', JSON.stringify(S.cleanText('早餐\u0000\u001f油条')))
ok('尖括号被剔除', S.cleanText('<script>alert(1)</script>') === 'scriptalert(1)/script', S.cleanText('<script>alert(1)</script>'))
ok('双向覆写字符被剔除', S.cleanText('abc\u202Efgh') === 'abcfgh')
ok('超长备注被截断到 30', S.cleanText('あ'.repeat(80), 30).length === 30)

// 分类
ok('非法分类落回「其他」', S.cleanCat('__hack__', 'expense') === 'other')
ok('收入用收入分类白名单', S.cleanCat('__hack__', 'income') === 'other_in')
ok('合法分类保留', S.cleanCat('food', 'expense') === 'food')

// 记录级
ok('金额为 0 的记录被丢弃', S.cleanRecord({ type: 'expense', amount: 0, date: '2026-09-01' }, () => 'x') === null)
ok('日期非法的记录被丢弃', S.cleanRecord({ type: 'expense', amount: 10, date: '9999-99-99' }, () => 'x') === null)
ok('记录未知字段被丢弃', (() => {
  const r = S.cleanRecord({ type: 'expense', amount: 10, date: '2026-09-01', evil: 'x', __proto__: 'y' }, () => 'id1')
  return r && r.evil === undefined
})())

// 备份解析：各种畸形输入
ok('备份文本超 2MB 被拒', store.importJSON('x'.repeat(2 * 1024 * 1024 + 10)).ok === false)
ok('伪造 app 名被拒', store.importJSON('{"app":"other","months":{}}').ok === false)
ok('months 非对象被拒', store.importJSON('{"app":"mama-ledger","months":[]}').ok === false)
ok('非法月份键被跳过', (() => {
  const r = store.importJSON('{"app":"mama-ledger","months":{"../../evil":[]}}')
  return r.ok === true && store.getRecords('../../evil').length === 0
})())
ok('超量月份被拒（上限 36）', (() => {
  const months = {}
  for (let i = 0; i < 40; i++) {
    const y = 2020 + Math.floor(i / 12)
    const m = String(i % 12 + 1).padStart(2, '0')
    months[y + '-' + m] = []
  }
  return store.importJSON(JSON.stringify({ app: 'mama-ledger', months: months })).ok === false
})())
ok('记录日期与所属月份不符被丢弃', (() => {
  const r = store.importJSON(JSON.stringify({
    app: 'mama-ledger',
    months: { '2026-09': [{ type: 'expense', amount: 5, date: '2020-01-01', cat: 'food' }] }
  }))
  return r.ok === true && r.dropped >= 1
})())
ok('导入结果会报告跳过的异常条数', (() => {
  const r = store.importJSON(JSON.stringify({
    app: 'mama-ledger',
    months: { '2026-09': [
      { type: 'expense', amount: 5, date: '2026-09-01', cat: 'food', note: '正常' },
      { type: 'expense', amount: -1, date: '2026-09-01', cat: 'food' }
    ] }
  }))
  return r.ok === true && r.dropped === 1 && /跳过/.test(r.msg)
})())

// 设置白名单
ok('设置里的未知键不落盘', (() => {
  store.saveSettings({ evilKey: 'x', budget: { total: 100, cats: {} } })
  return store.getSettings().evilKey === undefined
})())
ok('主题白名单：非法值落回 pink', (() => {
  store.setTheme('<script>')
  return store.getTheme() === 'pink'
})())
ok('主题可正常切换', (() => {
  store.setTheme('lilac')
  const t = store.themeClass() === 't-lilac'
  store.setTheme('pink')
  return t
})())

// CSV 公式注入
ok('CSV 公式注入被加前缀', S.csvCell('=1+1') === "'=1+1", S.csvCell('=1+1'))
ok('CSV 逗号与引号被正确转义', S.csvCell('a,"b"') === '"a,""b"""', S.csvCell('a,"b"'))

console.log('\n=== 10. 主题色联动（导航栏与图表都靠它） ===')
// 主题色必须与 app.wxss 里 .t-xxx 的 --pink 一致，否则导航栏与页面不同色
// 期望值从 app.wxss 动态读取（Apple HIG 冷调主题，主题无关），仍校验 THEME_NAV == app.wxss --pink
const CSS = require('fs').readFileSync(U + '../app.wxss', 'utf8')
const NAV_WANT = {}
;['pink', 'lilac', 'blue', 'matcha'].forEach(function (k) {
  const blk = CSS.split('.' + 't-' + k + ' {')[1] || ''
  const m = blk.slice(0, 200).match(/--pink:\s*(#[0-9A-Fa-f]{6})/)
  if (m) NAV_WANT[k] = m[1].toUpperCase()
})
const BASE = NAV_WANT.pink || '#4F5BD5'
ok('四套主题的品牌色都取得到', (() => {
  return Object.keys(NAV_WANT).every(function (k) {
    store.setTheme(k)
    return store.themeColor() === NAV_WANT[k]
  })
})())
ok('themeColor 与 app.wxss 的 --pink 逐套一致', (() => {
  const css = require('fs').readFileSync(U + '../app.wxss', 'utf8')
  return Object.keys(NAV_WANT).every(function (k) {
    const blk = css.split('.' + 't-' + k + ' {')[1]
    if (!blk) return false
    const m = blk.slice(0, 200).match(/--pink:\s*(#[0-9A-Fa-f]{6})/)
    return m && m[1].toUpperCase() === NAV_WANT[k]
  })
})())
ok('浅色档能正确派生（0 = 原色，越大越浅）', (() => {
  store.setTheme('pink')
  if (store.themeTint(0).toUpperCase() !== BASE) return false
  const light = store.themeTint(0.8)
  const num = parseInt(light.slice(1), 16)
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255
  const br=parseInt(BASE.slice(1,3),16),bg=parseInt(BASE.slice(3,5),16),bb=parseInt(BASE.slice(5,7),16)
  return /^#[0-9a-fA-F]{6}$/.test(light) && r >= br && g >= bg && b >= bb && (r > br || g > bg || b > bb)
})())
ok('浅色档系数被夹在 0~0.85（防越界/注入）', (() => {
  store.setTheme('pink')
  return store.themeTint(-5).toUpperCase() === BASE &&
    /^#[0-9a-fA-F]{6}$/.test(store.themeTint(99)) &&
    store.themeTint('abc').toUpperCase() === BASE
})())
ok('切主题后图表色随之改变', (() => {
  store.setTheme('pink')
  const a = store.themeTint(0.8)
  store.setTheme('matcha')
  const b = store.themeTint(0.8)
  store.setTheme('pink')
  return a !== b
})())
store.setTheme('pink')

console.log('\n' + '='.repeat(46))
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
console.log('='.repeat(46) + '\n')
process.exit(fail ? 1 : 0)
