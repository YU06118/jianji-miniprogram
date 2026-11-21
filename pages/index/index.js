// pages/index/index.js —— 首页：一眼看清「这个月还能花多少」
const store = require('../../utils/store.js')
const M = require('../../utils/money.js')
const D = require('../../utils/date.js')
const C = require('../../utils/categories.js')

Page({
  data: {
    ym: '',
    isThisMonth: true,
    monthLabelText: '本月',
    bs: { hasBudget: false, tone: 'ok', advice: { title: '', body: '', action: '' }, cats: [] },
    sum: {},
    todayText: '0',
    usedText: '0',
    budgetText: '0',
    leftText: '0',
    heroLabel: '本月还能花',
    incomeText: '0',
    dailyLeftText: '0',
    barWidth: 0,
    quickTags: [],
    learnedCount: 0,
    days: [],
    weekText: '0',
    weekMaxText: '0',
    recent: []
  },

  onShow() {
    this.applyAppearance()
    this.refresh()
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  refresh() {
    const ym = D.thisMonth()
    const today = D.today()
    const bs = store.budgetStatus(ym)
    const sum = store.summary(ym)
    const records = store.getRecords(ym)

    // 今日支出
    const todayCents = records.reduce(function (s, r) {
      if (r.type !== 'expense' || r.date !== today) return s
      return s + M.toCents(r.amount)
    }, 0)
    const todayExpense = M.toYuan(todayCents)

    // 常用标签（首页聚焦支出）
    const rawTags = store.quickTags(8).filter(function (t) { return t.type === 'expense' })
    const quickTags = rawTags.map(function (t) {
      const c = C.getCat(t.cat)
      return {
        key: t.cat + '|' + t.note,
        type: t.type,
        cat: t.cat,
        note: t.note,
        displayNote: (t.learned ? '⚡' : '') + t.note,
        amount: t.amount,
        amountText: M.fmt(t.amount),
        emoji: c.emoji,
        learned: t.learned
      }
    })

    // 近 7 天柱状
    const rawDays = store.recentDays(7)
    let maxAmt = 0
    let weekCents = 0
    for (let i = 0; i < rawDays.length; i++) {
      if (rawDays[i].amount > maxAmt) maxAmt = rawDays[i].amount
      weekCents += M.toCents(rawDays[i].amount)
    }
    const days = rawDays.map(function (d) {
      let h = 4
      if (maxAmt > 0 && d.amount > 0) h = Math.max(10, Math.round(d.amount / maxAmt * 100))
      else if (d.amount > 0) h = 30
      const isToday = d.date === today
      return {
        date: d.date,
        label: isToday ? '今' : String(Number(d.label)),
        amount: d.amount,
        h: h,
        color: (d.amount === maxAmt && maxAmt > 0) ? store.themeColor()
          : (isToday ? store.themeTint(0.55) : store.themeTint(0.8))
      }
    })

    // 最近记录
    const recent = records.slice(0, 8).map(function (r) {
      const c = C.getCat(r.cat)
      return {
        id: r.id,
        ym: ym,
        type: r.type,
        cat: r.cat,
        catName: c.name,
        emoji: c.emoji,
        soft: c.soft,
        note: r.note,
        when: D.human(r.date),
        amountText: M.fmt(r.amount)
      }
    })

    this.setData({
      ym: ym,
      isThisMonth: true,
      monthLabelText: D.monthLabel(ym),
      bs: bs,
      sum: sum,
      todayText: M.fmt(todayExpense),
      usedText: M.fmt(bs.hasBudget ? bs.used : sum.expense),
      budgetText: M.fmt(bs.total),
      leftText: M.fmt(Math.abs(bs.left)),
      // 超支时不能写「本月还能花」——数字是超出的金额，标签说反了就成误导
      heroLabel: bs.status === 'over' ? '本月已超支'
        : (ym === D.thisMonth() ? '本月还能花' : D.monthLabel(ym) + ' 剩余'),
      incomeText: M.fmt(sum.income),
      // 超支时「每天可花 ¥0」没有信息量，直接说超了多少
      dailyLeftText: bs.status === 'over'
        ? '已超 ¥' + M.fmt(Math.abs(bs.left))
        : '每天可花 ¥' + M.fmt(bs.dailyLeft),
      barWidth: Math.min(100, Math.max(bs.pct, 0)),
      quickTags: quickTags,
      learnedCount: quickTags.filter(function (t) { return t.learned }).length,
      days: days,
      weekText: M.fmt(M.toYuan(weekCents)),
      weekMaxText: M.fmt(maxAmt),
      recent: recent
    })
  },

  /* ---------------- 跳转 ---------------- */

  goAdd() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' })
  },

  goBudget() {
    wx.navigateTo({ url: '/pages/budget/budget' })
  },

  onAlertTap() {
    const action = this.data.bs.advice.action
    if (action === '去设预算' || action === '调整预算') this.goBudget()
    else this.goStats()
  },

  /* ---------------- 快捷记账 ---------------- */

  onQuick(e) {
    const t = this.data.quickTags[e.currentTarget.dataset.i]
    if (!t) return
    store.addRecord({ type: t.type, amount: t.amount, cat: t.cat, note: t.note, date: D.today() })
    // P0：写库失败时不弹成功，避免误导
    if (!store.lastWriteOk()) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
    wx.showToast({ title: '记好了 ' + t.emoji + ' ¥' + t.amountText, icon: 'none' })
    this.refresh()
  },

  onRecTap(e) {
    const d = e.currentTarget.dataset
    wx.navigateTo({ url: '/pages/add/add?id=' + d.id + '&ym=' + d.ym })
  },

  onRecLong(e) {
    const d = e.currentTarget.dataset
    const that = this
    wx.showModal({
      title: '删掉这笔？',
      content: '删掉就找不回来了',
      confirmText: '删除',
      confirmColor: '#C42B1C',
      cancelText: '留着',
      success(res) {
        if (!res.confirm) return
        store.deleteRecord(d.ym, d.id)
        wx.showToast({ title: '已删除', icon: 'none' })
        that.refresh()
      }
    })
  },

  /* 外观模式：刷新根节点 class；不含原生层同步（由 app.syncAppearance 单向驱动） */
  applyAppearance() {
    const patch = {}
    const t = store.themeClass()
    const m = store.modeClass()
    if (t !== this.data.theme) patch.theme = t
    if (m !== this.data.modeClass) patch.modeClass = m
    if (Object.keys(patch).length) this.setData(patch)
  }
})
