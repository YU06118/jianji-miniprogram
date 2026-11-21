// pages/stats/stats.js —— 钱去哪了
const store = require('../../utils/store.js')
const T = require('../../utils/transition.js')
const M = require('../../utils/money.js')
const D = require('../../utils/date.js')
const C = require('../../utils/categories.js')

Page({
  data: {
    ym: '',
    monthLabelText: '',
    isThisMonth: true,
    canNext: false,
    expenseText: '0',
    expenseRaw: 0,
    incomeText: '0',
    balanceText: '0',
    avgText: '0',
    countNum: 0,
    diffText: '',
    diffTone: 'pill-plain',
    byCat: [],
    legendCats: [],
    expandedCat: '',
    catBudgets: [],
    trend: [],
    trendAvgText: '',
    trendTopLabel: '',
    trendTopText: '',
    // 年月选择器：两级抽屉（年份网格 → 月份网格）
    pickerShow: false,
    pickerStep: 'year',
    years: [],
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    decadeStart: 2020,
    pickedYear: 0,
    pickedMonth: 0,
    minYear: 0,
    maxYear: 0,
    maxMonth: 12,
    canNextDecade: false
  },

  onLoad() {
    store.initIfEmpty()
    this.load(D.thisMonth())
  },

  onShow() {
    T.playEnter(this)  // 页面转场：内容淡入（配合系统右滑/tab切换）
    this.applyAppearance()
    // 从记账页返回时重新聚合
    if (this.data.ym) this.load(this.data.ym)
  },

  /* ---------------- 数据装载 ---------------- */

  load(ym) {
    const cur = D.thisMonth()
    const sum = store.summary(ym)
    const prev = store.summary(D.shiftMonth(ym, -1))
    const records = store.getRecords(ym)

    /* --- 与上月对比 --- */
    const diff = M.toYuan(M.toCents(sum.expense) - M.toCents(prev.expense))
    let diffText = ''
    let diffTone = 'pill-plain'
    if (prev.expense > 0 && Math.abs(diff) >= 1) {
      const p = Math.round(Math.abs(diff) / prev.expense * 100)
      if (diff > 0) {
        diffText = '比上月多 ¥' + M.fmt(diff) + ' ↑' + p + '%'
        diffTone = 'pill-warn'
      } else {
        diffText = '比上月少 ¥' + M.fmt(-diff) + ' ↓' + p + '%'
        diffTone = 'pill-ok'
      }
    } else if (prev.expense === 0 && sum.expense > 0) {
      diffText = '上月没有记录'
    }

    /* --- 分类排行（含展开明细） --- */
    const byCat = sum.byCat.map(function (c) {
      const recs = records.filter(function (r) {
        return r.type === 'expense' && r.cat === c.key
      }).slice(0, 12).map(function (r) {
        return {
          id: r.id,
          when: D.human(r.date),
          note: r.note || C.catName(r.cat),
          amountText: M.fmt(r.amount)
        }
      })
      return {
        key: c.key,
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        amount: c.amount,
        amountRaw: c.amount,
        amountText: M.fmt(c.amount),
        count: c.count,
        pct: c.pct,
        pctW: Math.max(3, c.pct),
        records: recs
      }
    })

    const legendCats = byCat.slice(0, 6)

    /* --- 分项预算进度 --- */
    const bs = store.budgetStatus(ym)
    const catBudgets = (bs.cats || []).map(function (c) {
      let tip = ''
      if (c.status === 'over') tip = '超出 ¥' + M.fmt(Math.abs(c.left))
      else tip = '还能花 ¥' + M.fmt(c.left)
      return {
        key: c.key,
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        usedText: M.fmt(c.used),
        budgetText: M.fmt(c.budget),
        pct: c.pct,
        w: Math.min(100, Math.max(0, c.pct)),
        status: c.status,
        tip: tip
      }
    })

    /* --- 近 6 个月趋势 --- */
    const rawTrend = store.recentMonths(6, ym)
    let maxT = 0
    let sumT = 0
    let top = { amount: -1, label: '' }
    for (let i = 0; i < rawTrend.length; i++) {
      if (rawTrend[i].amount > maxT) maxT = rawTrend[i].amount
      sumT += M.toCents(rawTrend[i].amount)
      if (rawTrend[i].amount > top.amount && rawTrend[i].ym !== cur) {
        top = { amount: rawTrend[i].amount, label: rawTrend[i].label }
      }
    }
    const trend = rawTrend.map(function (t) {
      const isCur = t.ym === cur
      return {
        ym: t.ym,
        label: t.label,
        amount: t.amount,
        h: maxT > 0 ? Math.max(4, Math.round(t.amount / maxT * 100)) : 4,
        isCur: isCur,
        color: isCur ? store.themeColor()
          : (t.amount === maxT && maxT > 0 ? store.themeTint(0.5) : store.themeTint(0.8))
      }
    })
    const trendAvg = M.toYuan(Math.round(sumT / rawTrend.length))

    this.setData({
      ym: ym,
      monthLabelText: D.monthLabel(ym),
      isThisMonth: ym === cur,
      canNext: ym < cur,
      expenseText: M.fmt(sum.expense),
      expenseRaw: sum.expense,
      incomeText: M.fmt(sum.income),
      balanceText: M.fmt(sum.balance),
      avgText: M.fmt(sum.avgPerDay),
      countNum: sum.dayCount,
      diffText: diffText,
      diffTone: diffTone,
      byCat: byCat,
      legendCats: legendCats,
      expandedCat: '',
      catBudgets: catBudgets,
      trend: trend,
      trendAvgText: maxT > 0 ? M.fmt(trendAvg) : '',
      trendTopLabel: top.amount > 0 ? top.label : '',
      trendTopText: top.amount > 0 ? M.fmt(top.amount) : ''
    }, () => {
      if (byCat.length) this.drawDonut()
    })
  },

  /* ---------------- 环形图 ---------------- */

  drawDonut() {
    const cats = this.data.byCat
    const total = this.data.expenseRaw || 0
    const that = this

    wx.createSelectorQuery()
      .select('#donut')
      .fields({ node: true, size: true })
      .exec(function (res) {
        if (!res || !res[0] || !res[0].node) return
        const canvas = res[0].node
        let dpr = 2
        try {
          const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          dpr = info.pixelRatio || 2
        } catch (e) { /* 用默认值 */ }

        const w = res[0].width
        const h = res[0].height
        if (!w || !h) return

        canvas.width = w * dpr
        canvas.height = h * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, w, h)

        const cx = w / 2
        const cy = h / 2
        // 描边外缘 r + lw/2 必须落在 min(w,h)/2 - margin 内，否则会被画布裁成平边
        const margin = 4
        const ringRatio = 0.27
        const r = (Math.min(w, h) / 2 - margin) / (1 + ringRatio / 2)
        const lw = r * ringRatio

        // P0：canvas 不认 CSS 变量，按当前外观换色（暗色下中心金额必须可读）
        const dark = store.isDark()

        // 底圈
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = dark ? '#3A3A3C' : '#F6EEED'
        ctx.lineWidth = lw
        ctx.lineCap = 'butt'
        ctx.stroke()

        // 各分类弧段
        if (cats.length && total > 0) {
          let start = -Math.PI / 2
          for (let i = 0; i < cats.length; i++) {
            const c = cats[i]
            const ang = (c.amountRaw / total) * Math.PI * 2
            if (ang <= 0) continue
            ctx.beginPath()
            ctx.arc(cx, cy, r, start + 0.006, start + ang - 0.006)
            ctx.strokeStyle = c.color
            ctx.lineWidth = lw
            ctx.stroke()
            start += ang
          }
        }

        // 中心文字
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = dark ? '#9E9E9E' : '#A2939A'
        ctx.font = '12px sans-serif'
        ctx.fillText('共花', cx, cy - 17)
        ctx.fillStyle = dark ? '#F5F5F5' : '#2E2A2B'
        ctx.font = 'bold 21px sans-serif'
        ctx.fillText('¥' + M.short(total), cx, cy + 11)
      })
  },

  /* ---------------- 年月选择器 ---------------- */

  /** 生成某个十年页的年份数组（起始年 → 起始年+9） */
  buildDecade(start) {
    const out = []
    for (let y = start; y < start + 10; y++) out.push(y)
    return out
  },

  /** 打开抽屉：范围 = [最早有记录月, 当前月]，默认定位到当前所选年月的十年页 */
  openMonthPicker() {
    const cur = D.parseMonth(D.thisMonth())
    const keys = store.getMonthKeys().filter(function (k) { return k <= D.thisMonth() })
    const first = keys.length ? D.parseMonth(keys[keys.length - 1]) : cur
    const sel = D.parseMonth(this.data.ym || D.thisMonth())
    const decade = Math.floor(sel.y / 10) * 10     // 落在所选年份所在十年页
    const maxDecade = Math.floor(cur.y / 10) * 10
    this.setData({
      pickerShow: true,
      pickerStep: 'year',
      years: this.buildDecade(decade),
      decadeStart: decade,
      pickedYear: sel.y,
      pickedMonth: sel.m,
      minYear: first.y,
      maxYear: cur.y,
      maxMonth: cur.y === sel.y ? cur.m : 12,
      canNextDecade: decade < maxDecade
    })
  },

  closePicker() { this.setData({ pickerShow: false }) },
  noop() {},   // 拦截冒泡与 touchmove，避免底层滚动

  prevDecade() {
    const start = this.data.decadeStart - 10
    // 不允许翻到早于最早记录年的十年页
    if (start + 9 < this.data.minYear) return
    this.setData({
      decadeStart: start,
      years: this.buildDecade(start),
      canNextDecade: true
    })
  },

  nextDecade() {
    if (!this.data.canNextDecade) return
    const start = this.data.decadeStart + 10
    const maxDecade = Math.floor(this.data.maxYear / 10) * 10
    this.setData({
      decadeStart: start,
      years: this.buildDecade(start),
      canNextDecade: start < maxDecade
    })
  },

  pickYear(e) {
    const y = Number(e.currentTarget.dataset.y)
    if (y > this.data.maxYear || y < this.data.minYear) return
    this.setData({
      pickerStep: 'month',
      pickedYear: y,
      maxMonth: y === this.data.maxYear ? D.parseMonth(D.thisMonth()).m : 12
    })
  },

  backToYears() { this.setData({ pickerStep: 'year' }) },

  pickMonth(e) {
    const m = Number(e.currentTarget.dataset.m)
    if (m > this.data.maxMonth) return
    const ym = this.data.pickedYear + '-' + (m < 10 ? '0' + m : m)
    this.closePicker()
    this.load(ym)   // 一处联动全部统计区块 + 环形图重绘
  },

  /* ---------------- 交互 ---------------- */

  prevMonth() {
    this.load(D.shiftMonth(this.data.ym, -1))
  },

  nextMonth() {
    if (!this.data.canNext) return
    this.load(D.shiftMonth(this.data.ym, 1))
  },

  onCatTap(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ expandedCat: this.data.expandedCat === k ? '' : k })
  },

  goBudget() {
    wx.navigateTo({ url: '/pages/budget/budget' })
  },

  /* 外观模式：刷新根节点 class；不含原生层同步（由 app.syncAppearance 单向驱动） */
  applyAppearance() {
    const patch = {}
    const t = store.themeClass()
    const m = store.modeClass()
    if (t !== this.data.theme) patch.theme = t
    if (m !== this.data.modeClass) patch.modeClass = m
    // 低端设备降级：关流光/毛玻璃，保首屏与滚动流畅
    const app = getApp()
    const perf = app && app.globalData && app.globalData.lowEnd ? ' low-end' : ''
    if (perf !== (this.data.perf || '')) patch.perf = perf
    if (Object.keys(patch).length) {
      this.setData(patch)
      // P0：暗/浅切换后 canvas 需重绘，否则中心金额仍是旧色
      if (patch.modeClass) this.drawDonut()
    }
  }
})
