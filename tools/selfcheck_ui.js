// 家庭记账小程序 · 预览版界面自检（基于 jsdom，模拟真实点击）
// 用法： node selfcheck_ui.js <项目目录>
// 依赖 jsdom。若提示找不到，用受管环境跑：
//   NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules node selfcheck_ui.js <项目目录>
const fs = require('fs')
const path = require('path')

let JSDOM, VirtualConsole
try {
  JSDOM = require('jsdom').JSDOM
  VirtualConsole = require('jsdom').VirtualConsole
} catch (e) {
  console.log('\n[提示] 没找到 jsdom，界面自检无法运行。两种装法：')
  console.log('  1) npm i jsdom')
  console.log('  2) 用已装好 jsdom 的环境：')
  console.log('     NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules \\')
  console.log('       node selfcheck_ui.js <项目目录>\n')
  process.exit(2)
}

const DIR = path.resolve(process.argv[2] || '.')
const cands = ['\u9884\u89c8\u7248.html', 'preview.html']
let file = ''
for (const c of cands) {
  const p = path.join(DIR, c)
  if (fs.existsSync(p)) { file = p; break }
}
if (!file) {
  console.log('\n[错误] 在 ' + DIR + ' 里找不到 预览版.html（或 preview.html）')
  console.log('       预览版随生成的项目一起产出；确认参数指向的是项目目录。\n')
  process.exit(1)
}
const html = fs.readFileSync(file, 'utf8')

const errors = []
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: new (require('jsdom').VirtualConsole)()
    .on('jsdomError', e => errors.push('jsdomError: ' + e.message))
    .on('error', (...a) => errors.push('error: ' + a.join(' ')))
})

const w = dom.window
const doc = w.document
const $ = s => doc.querySelector(s)
const txt = s => ($(s) ? $(s).textContent.trim() : '')

let pass = 0, fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')) }
}

console.log('\n=== 页面能否正常跑起来 ===')
ok('脚本无运行时错误', errors.length === 0, errors.join(' | '))
ok('App 已初始化', typeof w.App === 'object')
ok('示例数据已自动填入', w.Store.stats().records > 0, '记录数 ' + w.Store.stats().records)

console.log('\n=== 首页渲染 ===')
ok('hero 主卡存在', !!$('.hero'))
ok('显示「本月还能花」', txt('.hero-label') === '本月还能花', txt('.hero-label'))
ok('剩余金额非空', /^¥[\d,]+/.test(txt('.hero-num').replace(/\s/g, '')), txt('.hero-num'))
ok('预警条存在', !!$('.alert'))
ok('预警标题非空', txt('.alert-title').length > 0, txt('.alert-title'))
ok('有改预算入口', !!$('.hero-pill'))
ok('快捷键有内容', doc.querySelectorAll('.q-item').length > 0, doc.querySelectorAll('.q-item').length + ' 个')
ok('「记一笔」入口存在', !!$('.q-add'))
ok('三格概览存在', doc.querySelectorAll('.stat').length === 3)
ok('7 天柱状图有 7 根', doc.querySelectorAll('.bar-col').length === 7)
ok('记录列表有内容', doc.querySelectorAll('.rec').length > 0, doc.querySelectorAll('.rec').length + ' 条')
ok('底部 tab 4 项（记账/统计/攒钱/我的）', doc.querySelectorAll('.tab').length === 4, doc.querySelectorAll('.tab').length + ' 项')

console.log('\n=== 记一笔流程 ===')
w.App.go('add')
ok('进入记账页', w.App.view === 'add')
ok('键盘 12 个键', doc.querySelectorAll('.k').length === 12)
ok('分类 12 个', doc.querySelectorAll('.cat').length === 12)
ok('金额初始为 0', txt('.amt') === '0')
ok('支出/收入切换存在', doc.querySelectorAll('.seg-i').length === 2)

// 输入 25.5
'2 5 . 5'.split(' ').forEach(k => w.App.key(k))
ok('键盘输入 25.5', w.App.add.amountStr === '25.5', w.App.add.amountStr)
ok('界面同步显示 25.5', txt('.amt') === '25.5', txt('.amt'))

// 连续输入两个小数点应被忽略
w.App.key('.')
ok('第二个小数点被忽略', w.App.add.amountStr === '25.5', w.App.add.amountStr)

// 备注自动分类
w.App.onNote('菜市场买菜')
ok('备注自动分类到 grocery', w.App.add.cat === 'grocery', w.App.add.cat)
w.App.setCat('kid')
w.App.onNote('菜市场买菜和奶粉')
ok('手动选过分类后不再被覆盖', w.App.add.cat === 'kid', w.App.add.cat)

// 完成记账
const before = w.Store.stats().records
w.App.commit({ type: 'expense', amount: '25.5', cat: 'kid', note: '测试一笔' })
ok('记录数 +1', w.Store.stats().records === before + 1, before + ' → ' + w.Store.stats().records)
ok('记完自动回首页', w.App.view === 'index')

console.log('\n=== 快捷记账 ===')
const b2 = w.Store.stats().records
w.App.quickAdd(0)
ok('点标签直接记一笔', w.Store.stats().records === b2 + 1)

console.log('\n=== 统计页 ===')
w.App.go('stats')
ok('进入统计页', w.App.view === 'stats')
ok('总额有数字', /[\d]/.test(txt('.total-num')), txt('.total-num'))
ok('环形图画布存在', !!$('#donut'))
ok('图例有内容', doc.querySelectorAll('.lg').length > 0, doc.querySelectorAll('.lg').length + ' 项')
ok('分类排行有内容', doc.querySelectorAll('.rk').length > 0, doc.querySelectorAll('.rk').length + ' 类')
ok('分项预算区块存在', doc.querySelectorAll('.cb').length > 0)
ok('近 6 个月有 6 根柱', doc.querySelectorAll('.tr-col').length === 6)

// 展开分类明细
const firstCat = doc.querySelector('.rk')
firstCat.dispatchEvent(new w.Event('click', { bubbles: true }))
ok('点分类可展开明细', doc.querySelectorAll('.rk-detail').length > 0)

// 月份切换
const ymNow = w.App._ym
w.App.shift(-1)
ok('切到上个月', w.App._ym !== ymNow, w.App._ym)
w.App.shift(1)
ok('切回本月', w.App._ym === ymNow)

console.log('\n=== 攒钱页 ===')
w.App.go('goal')
ok('进入攒钱页', w.App.view === 'goal')
ok('已经攒下金额非空', /[\d]/.test(txt('.hero-num')), txt('.hero-num'))
ok('有目标卡片', doc.querySelectorAll('.gcard').length > 0, doc.querySelectorAll('.gcard').length + ' 个')
ok('进度条存在', doc.querySelectorAll('.gcard .bar').length > 0)
ok('每个目标都有行动建议', doc.querySelectorAll('.gc-tip').length === doc.querySelectorAll('.gcard').length)

console.log('\n=== 弹层表单（替代 prompt，兼容微信内置浏览器） ===')
w.App.askDeposit(0)
ok('弹层已打开', $('#sheet').classList.contains('show'))
ok('标题含「存一笔」', txt('#shTitle').indexOf('存一笔') >= 0, txt('#shTitle'))
ok('有金额输入框', !!$('#shBody input[type=number]'))
ok('有快捷金额按钮', doc.querySelectorAll('#shBody .dq').length === 4)
w.App.sheetQuick(500)
ok('快捷金额会累加', $('#shBody input[type=number]').value === '1500', $('#shBody input[type=number]').value)
const savedBefore = w.Store.getGoals()[0].saved
w.App.submitSheet()
ok('提交后弹层关闭', !$('#sheet').classList.contains('show'))
ok('目标已存金额 +1500', w.Store.getGoals()[0].saved === savedBefore + 1500,
  savedBefore + ' → ' + w.Store.getGoals()[0].saved)

w.App.newGoal()
ok('新建目标弹层打开', $('#sheet').classList.contains('show'))
ok('有三个表单字段', doc.querySelectorAll('#shBody input').length === 3)
const goalsBefore = w.Store.getGoals().length
// 名称为空应被拦下
$('#shBody input[data-k=name]').value = ''
w.App.submitSheet()
ok('名称为空时拦截', w.Store.getGoals().length === goalsBefore && $('#sheet').classList.contains('show'))
$('#shBody input[data-k=name]').value = '家庭旅行基金'
$('#shBody input[data-k=target]').value = '20000'
w.App.submitSheet()
ok('填好后成功新建', w.Store.getGoals().length === goalsBefore + 1, w.Store.getGoals().length)

console.log('\n=== 记账页日期选择 ===')
w.App.go('add')
ok('日期控件存在（原生 date input）', !!$('#view input[type=date]'))
w.App.setDate('2026-09-05')
ok('改日期后生效', w.App.add.date === '2026-09-05', w.App.add.date)
ok('界面显示对应日期', txt('.meta-pill').indexOf('9月5日') >= 0, txt('.meta-pill'))

console.log('\n=== 预算页 ===')
w.App.go('budget')
ok('进入预算页', w.App.view === 'budget')
ok('总预算输入框有值', $('#totalInput').value.length > 0, $('#totalInput').value)
ok('分项预算 11 项', doc.querySelectorAll('.cb-item').length === 11, doc.querySelectorAll('.cb-item').length)
ok('分项合计已计算', /[\d]/.test(txt('#cbSum')), txt('#cbSum'))

// 改一个分项，看合计是否联动
const cbInputs = doc.querySelectorAll('.cb-in')
const sumBefore = txt('#cbSum')
cbInputs[0].value = '9999'
w.App.onBudgetInput(cbInputs[0])
const sumAfter = txt('#cbSum')
ok('改分项后合计联动更新', sumAfter !== sumBefore && /15,299/.test(sumAfter), sumBefore + ' → ' + sumAfter)
ok('超出总额时给出警告', $('#cbSum').classList.contains('warn'), $('#cbSum').className)

// 按上月花销填充（向上取整到 10 元）
w.App.useSug(3567)
ok('套用建议值（向上取整到 10 元）', $('#totalInput').value === '3570', $('#totalInput').value)

console.log('\n=== 我的 · 主题色 ===')
w.App.go('me')
ok('进入我的页', w.App.view === 'me')
ok('主题色有 4 套', doc.querySelectorAll('.th-card').length === 4, doc.querySelectorAll('.th-card').length + ' 套')
ok('当前主题被标记选中', doc.querySelectorAll('.th-card.on').length === 1)

const clsBefore = doc.querySelector('.device').className
w.App.pickTheme('lilac')
ok('切主题后容器类名变化', doc.querySelector('.device').className !== clsBefore, doc.querySelector('.device').className)
ok('切换后写入本地存储', w.Store.getTheme() === 'lilac', w.Store.getTheme())
ok('主题卡选中态跟着走', doc.querySelector('.th-card.on').textContent.indexOf('香芋紫') >= 0,
  doc.querySelector('.th-card.on').textContent.trim())
w.App.pickTheme('matcha')
ok('再切一次也生效', doc.querySelector('.device').className.indexOf('t-matcha') >= 0, doc.querySelector('.device').className)
// 非法主题必须被挡回默认值
w.Store.setTheme('hacker"><script>')
ok('非法主题被白名单挡回', w.Store.getTheme() === 'matcha', w.Store.getTheme())

console.log('\n=== 图表色跟随主题（柱子不能用硬编码色）===')
ok('Store 暴露 brand / tint', typeof w.Store.brand === 'function' && typeof w.Store.tint === 'function')
w.App.pickTheme('pink')
w.App.go('index')
const barPink = $('.bar-col-fill') ? $('.bar-col-fill').getAttribute('style') : ''
w.App.pickTheme('matcha')
w.App.go('index')
const barMatcha = $('.bar-col-fill') ? $('.bar-col-fill').getAttribute('style') : ''
ok('切主题后柱状图颜色跟着变', !!barPink && !!barMatcha && barPink !== barMatcha,
  barPink.replace(/height:[^;]*;/, '') + ' → ' + barMatcha.replace(/height:[^;]*;/, ''))
ok('柱子色取的是当前主题品牌色系', barMatcha.indexOf(w.Store.brand()) >= 0 || barMatcha.indexOf(w.Store.tint(0.8)) >= 0
  || barMatcha.indexOf(w.Store.tint(0.55)) >= 0, barMatcha)
ok('四套主题的 brand 互不相同', (() => {
  const seen = {}
  return ['pink', 'lilac', 'blue', 'matcha'].every(function (k) {
    w.Store.setTheme(k)
    const b = w.Store.brand()
    if (seen[b]) return false
    seen[b] = 1
    return /^#[0-9A-Fa-f]{6}$/.test(b)
  })
})())
w.App.pickTheme('pink')
w.App.pickTheme('pink')

console.log('\n=== 注入防护（对外分享的关键）===')
const evil = '<img src=x onerror=window.__XSS__=1>'
w.Store.addRecord({ type: 'expense', amount: 12, cat: 'food', note: evil, date: w.Store.getRecords(new Date().toISOString().slice(0, 7))[0].date })
w.Store.addGoal({ name: evil, emoji: '🎯', target: 1000, saved: 0 })
const evilName = (w.Store.getGoals()[w.Store.getGoals().length - 1] || {}).name || ''
w.App.go('index')
ok('恶意备注未产生 img 节点', doc.querySelectorAll('#view img').length === 0,
  doc.querySelectorAll('#view img').length + ' 个')
ok('恶意备注未执行脚本', w.__XSS__ === undefined, String(w.__XSS__))
ok('恶意内容被转义成文本', txt('#view').indexOf('onerror') >= 0 || txt('#view').indexOf('&lt;img') >= 0)
ok('落库时已剥掉尖括号', w.Store.getRecords(new Date().toISOString().slice(0, 7))
  .filter(r => r.note && r.note.indexOf('<') >= 0).length === 0)
ok('恶意目标名同样被清洗', evilName.indexOf('<') === -1 && evilName.length > 0, evilName)
w.App.go('goal')
ok('攒钱页也未产生 img 节点', doc.querySelectorAll('#view img').length === 0)

console.log('\n=== 数据一致性 ===')
const ym = w.App._ym || w.Store.summary(w.D ? w.D.thisMonth() : '')
const sum = w.Store.summary(w.Store.stats() ? new Date().toISOString().slice(0, 7) : '')
const catSum = sum.byCat.reduce((s, c) => s + Math.round(c.amount * 100), 0) / 100
ok('分类金额之和 === 总支出', Math.abs(catSum - sum.expense) < 1e-6, catSum + ' vs ' + sum.expense)
ok('环形图分段占比合计 ≈ 100%', Math.abs(sum.byCat.reduce((s, c) => s + c.pct, 0) - 100) <= 2)

console.log('\n=== 测试场景面板（自己验收用）===')
w.App.go('me')
ok('「我的」页有场景面板', doc.querySelectorAll('.sc-btn').length === 6, doc.querySelectorAll('.sc-btn').length + ' 个按钮')
ok('场景按钮带说明文字', doc.querySelectorAll('.sc-d').length === 6)
ok('场景列表注册了 6 个场景', w.Store.SCENARIOS.length === 6)
ok('未知场景被安全忽略', w.Store.runScenario('__nope__') === null)
ok('无效场景点击不报错', (() => { try { w.App.runScen('__nope__'); return true } catch (e) { return false } })())

const MK = new Date().toISOString().slice(0, 7)

// 场景一：全新用户
w.Store.runScenario('fresh'); w.App.go('index')
let s1 = w.Store.summary(MK)
ok('🌱 全空：支出为 0', s1.expense === 0, String(s1.expense))
ok('🌱 全空：无预算时给「还没设预算」建议', txt('.alert-title') === '还没设预算', txt('.alert-title'))
ok('🌱 全空：首页有引导文案', txt('#view').indexOf('记') >= 0)

// 场景二：正常节奏
w.Store.runScenario('ok'); w.App.go('index')
let s2 = w.Store.budgetStatus(MK)
ok('🟢 正常：状态为 ok', s2.status === 'ok', s2.status + ' / pct ' + s2.pct)
ok('🟢 正常：建议是「节奏很好」', s2.advice.title.indexOf('节奏很好') >= 0, s2.advice.title)
ok('🟢 正常：已花金额 3247', s2.used === 3247, String(s2.used))
ok('🟢 正常：收入 15000 已记入', w.Store.summary(MK).income === 15000, String(w.Store.summary(MK).income))
ok('🟢 正常：首页无红色告警', ($('.hero-num') || {}).className.indexOf?.('over') < 0)

// 场景三：月底要超
w.Store.runScenario('tight'); w.App.go('index')
let s3 = w.Store.budgetStatus(MK)
ok('🟡 告急：状态为 warn', s3.status === 'warn', s3.status + ' / pct ' + s3.pct)
ok('🟡 告急：预测月底超支 > 0', s3.forecastOver > 0, '超 ' + s3.forecastOver)
ok('🟡 告急：建议是「按这个速度月底要超」', s3.advice.title.indexOf('月底要超') >= 0, s3.advice.title)
ok('🟡 告急：日用分项被判超支', s3.cats.some(c => c.key === 'daily' && c.status === 'over'),
  JSON.stringify(s3.cats.filter(c => c.key === 'daily')[0] || {}))
ok('🟡 告急：给出每日可花额度', s3.dailyLeft > 0, String(s3.dailyLeft))

// 场景四：已经超支
w.Store.runScenario('over'); w.App.go('index')
let s4 = w.Store.budgetStatus(MK)
ok('🔴 超支：状态为 over', s4.status === 'over', s4.status)
ok('🔴 超支：剩余金额为负', s4.left < 0, String(s4.left))
ok('🔴 超支：建议是「已经超支」', s4.advice.title.indexOf('超支') >= 0, s4.advice.title)
ok('🔴 超支：标签改成「本月已超支」', txt('.hero-label') === '本月已超支', txt('.hero-label'))
ok('🔴 超支：底部提示说超了多少', txt('.foot-v').indexOf('已超') >= 0, txt('.foot-v'))

// 场景五：连续三个月
w.Store.runScenario('history')
let keys = Object.keys(w.Store.stats()).length && (() => {
  const ms = []
  for (let i = 0; i < 4; i++) {
    const ym2 = w.D ? '' : ''
    const d = new Date(); d.setMonth(d.getMonth() - i)
    ms.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
  }
  return ms
})()
const monthsWithData = keys.filter(m => w.Store.getRecords(m).length > 0)
ok('📅 跨月：连续 3 个月都有数据', monthsWithData.length === 3, monthsWithData.join(','))
w.App.go('stats')
ok('📅 跨月：统计页趋势图渲染', doc.querySelectorAll('.tr-col').length === 6, doc.querySelectorAll('.tr-col').length + ' 根')
const ms2 = w.Store.recentMonths(6)
ok('📅 跨月：趋势返回 6 个月', ms2.length === 6)
ok('📅 跨月：近 3 个月金额均 > 0', ms2.slice(-3).every(m => m.amount > 0), JSON.stringify(ms2.slice(-3)))

// 场景六：极端输入
w.Store.runScenario('extreme')
const exRecs = w.Store.getRecords(MK)
const exSum = w.Store.summary(MK)
ok('🧨 极端：0.01 元小额未被丢弃', exRecs.some(r => r.amount === 0.01))
ok('🧨 极端：大额合计精确到分（112503.00）', exSum.expense === 112503, String(exSum.expense))
ok('🧨 极端：超长备注被截断 ≤30 字', exRecs.every(r => (r.note || '').length <= 30),
  Math.max(...exRecs.map(r => (r.note || '').length)) + ' 字')
ok('🧨 极端：带标签的备注落库无尖括号', exRecs.every(r => (r.note || '').indexOf('<') === -1))
const exTags = w.Store.quickTags(8)
const brk = exTags.filter(t => t.note === '早餐')[0]
ok('🧨 极端：重复三次的「早餐」被学成快捷标签', !!brk, JSON.stringify(exTags.map(t => t.note)))
ok('🧨 极端：快捷标签取众数金额 15', brk && brk.amount === 15, brk ? String(brk.amount) : '无')
w.App.go('index')
ok('🧨 极端：大额下首页不产生 img 节点', doc.querySelectorAll('#view img').length === 0)

console.log('\n' + '='.repeat(46))
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项')
if (errors.length) console.log('运行时错误：\n' + errors.join('\n'))
console.log('='.repeat(46) + '\n')
process.exit(fail ? 1 : 0)
