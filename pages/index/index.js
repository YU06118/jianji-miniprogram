// pages/index/index.js —— 首页：一眼看清「这个月还能花多少」
const store = require('../../utils/store.js')
const T = require('../../utils/transition.js')
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
    days: [],
    weekText: '0',
    weekMaxText: '0',
    recent: [],
    // 记一笔弹窗：表单保存即记账；常用档位在面板内一点即记
    cqSheet: false,
    cqCats: C.catsOf('expense'),
    cqCat: 'food',
    cqNote: '',
    cqAmount: '',
    cqList: []
  },

  onShow() {
    T.playEnter(this)  // 页面转场：内容淡入（配合系统右滑/tab切换）
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
      days: days,
      weekText: M.fmt(M.toYuan(weekCents)),
      weekMaxText: M.fmt(maxAmt),
      recent: recent
    })
  },

  /* ---------------- 跳转 ---------------- */

  /** 「记一笔」：直接弹记账面板（原 navigateTo 跳 tabBar 页会静默失败，故弃用跳页） */
  goAdd() {
    this.setData({
      cqSheet: true,
      cqCat: 'food', cqNote: '', cqAmount: '',
      cqList: this.decorateCq(store.getCustomQuick())
    })
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

  /* ---------------- 记一笔弹窗 ---------------- */

  noop() {},   // 拦截冒泡与 touchmove，避免底层 scroll-view 跟着滚

  /** 给档位渲染层补分类名/emoji/金额文本 */
  decorateCq(list) {
    return (list || []).map(function (it, i) {
      const c = C.getCat(it.cat)
      return {
        cat: it.cat, note: it.note, amount: it.amount, index: i,
        name: c.name, emoji: c.emoji, amountText: M.fmt(it.amount)
      }
    })
  },

  closeCq() { this.setData({ cqSheet: false }) },

  onCqCat(e) { this.setData({ cqCat: e.currentTarget.dataset.cat }) },

  onCqNote(e) { this.setData({ cqNote: e.detail.value }) },

  /** 金额输入清洗：只留数字与单个小数点，两位小数封顶 */
  onCqAmount(e) {
    let s = String(e.detail.value || '').replace(/[^0-9.]/g, '')
    const p = s.indexOf('.')
    if (p >= 0) s = s.slice(0, p + 1) + s.slice(p + 1).replace(/\./g, '').slice(0, 2)
    this.setData({ cqAmount: s })
  },

  /** 面板「保存」＝直接记一笔账（写库失败不提示成功，保留表单重试） */
  saveCq() {
    const amount = M.parse(this.data.cqAmount)
    if (!(amount > 0)) {
      wx.showToast({ title: '金额要大于 0', icon: 'none' })
      return
    }
    const note = String(this.data.cqNote || '').trim() || C.getCat(this.data.cqCat).name
    store.addRecord({ type: 'expense', amount: amount, cat: this.data.cqCat, note: note, date: D.today() })
    if (!store.lastWriteOk()) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
    wx.showToast({ title: '记好了 ¥' + M.fmt(amount), icon: 'none' })
    this.setData({ cqSheet: false })
    this.refresh()
  },

  /** 面板「存为常用档位」＝只存模板不记账，列表即时可见、下次一点即记 */
  keepCq() {
    const amount = M.parse(this.data.cqAmount)
    if (!(amount > 0)) {
      wx.showToast({ title: '金额要大于 0', icon: 'none' })
      return
    }
    const cat = this.data.cqCat
    const note = String(this.data.cqNote || '').trim() || C.getCat(cat).name
    const list = store.getCustomQuick()
    // 同分类+同备注视为同一档位，覆盖金额
    const hit = list.findIndex(function (x) { return x.cat === cat && x.note === note })
    if (hit >= 0) list[hit].amount = amount
    else list.push({ cat: cat, note: note, amount: amount })
    if (!store.saveCustomQuick(list)) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }
    wx.showToast({ title: '已存为档位', icon: 'none' })
    this.setData({ cqList: this.decorateCq(list) })
  },

  /** 点档位行＝按该档位直接记账 */
  useCq(e) {
    const i = Number(e.currentTarget.dataset.i)
    const it = store.getCustomQuick()[i]
    if (!it) return
    store.addRecord({ type: 'expense', amount: it.amount, cat: it.cat, note: it.note, date: D.today() })
    if (!store.lastWriteOk()) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }
    const c = C.getCat(it.cat)
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
    wx.showToast({ title: '记好了 ' + c.emoji + ' ¥' + M.fmt(it.amount), icon: 'none' })
    this.setData({ cqSheet: false })
    this.refresh()
  },

  /** 删除某个档位（sheet 内列表） */
  delCq(e) {
    const i = Number(e.currentTarget.dataset.i)
    const list = store.getCustomQuick()
    if (i < 0 || i >= list.length) return
    const that = this
    wx.showModal({
      title: '删掉这个档位？',
      content: '只删快捷档位，不影响已记的账',
      confirmText: '删除', confirmColor: '#C42B1C', cancelText: '留着',
      success(res) {
        if (!res.confirm) return
        list.splice(i, 1)
        if (!store.saveCustomQuick(list)) {
          wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
          return
        }
        that.setData({ cqList: that.decorateCq(list) })
        that.refresh()
      }
    })
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
    // 低端设备降级：关流光/毛玻璃，保首屏与滚动流畅
    const app = getApp()
    const perf = app && app.globalData && app.globalData.lowEnd ? ' low-end' : ''
    if (perf !== (this.data.perf || '')) patch.perf = perf
    if (Object.keys(patch).length) this.setData(patch)
  }
})
