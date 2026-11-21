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
    quickTags: [],
    learnedCount: 0,
    days: [],
    weekText: '0',
    weekMaxText: '0',
    recent: [],
    // 自定义金额档位管理 sheet
    cqSheet: false,
    cqCats: C.catsOf('expense'),
    cqEditIndex: -1,          // -1=新增，>=0=编辑第几个档位
    cqCat: 'food',
    cqNote: '',
    cqAmount: '',
    cqList: [],
    // 长按气泡菜单
    popShow: false,
    popX: 0, popY: 0,          // 视口坐标(px)，fixed 直接定位
    popIdx: -1,                // 当前操作的 quickTags 下标
    popIsCustom: false         // 是否自定义档位（决定菜单项）
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

    // 常用标签（首页聚焦支出）：自定义档位优先展示，其后是习惯学习标签
    const custom = store.getCustomQuick().map(function (it, i) {
      const c = C.getCat(it.cat)
      return {
        key: 'c|' + it.cat + '|' + i,
        type: 'expense',
        cat: it.cat,
        note: it.note,
        displayNote: '✦' + it.note,     // ✦ 表示用户自定义档位
        amount: it.amount,
        amountText: M.fmt(it.amount),
        emoji: c.emoji,
        learned: false,
        custom: true,
        customIndex: i
      }
    })
    const rawTags = store.quickTags(8).filter(function (t) { return t.type === 'expense' })
    const learnedTags = rawTags.map(function (t) {
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
        learned: t.learned,
        custom: false
      }
    })
    // 合计最多 8 个，避免横向溢出
    const quickTags = custom.concat(learnedTags).slice(0, 8)

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

  /* ---------------- 自定义金额档位（长按标签进入） ---------------- */

  /** 长按标签：在按压位置下方弹气泡菜单（不直接进表单） */
  onQuickLong(e) {
    const idx = Number(e.currentTarget.dataset.i)
    const t = this.data.quickTags[idx]
    if (!t) return
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })

    // clientX/clientY 是视口坐标，fixed 定位直接用，无需校正 scroll-left
    const touch = (e.changedTouches && e.changedTouches[0]) || {}
    const px = Number(touch.clientX) || 0
    const py = Number(touch.clientY) || 0

    let winW = 375, winH = 667
    try {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      winW = info.windowWidth || winW
      winH = info.windowHeight || winH
    } catch (err) { /* 用兜底值 */ }

    const isCustom = !!t.custom
    // 与 .pop-menu 的 width:300rpx 对齐，按实际屏宽换算，避免右缘翻转失准
    const MENU_W = Math.round(300 * winW / 750) + 2   // rpx→px + 边框余量
    const MENU_H = (isCustom ? 3 : 2) * 44 + 16
    const PAD = 8

    let x = px + 6                            // 略右偏，贴合手指
    let y = py + 12                           // 按压点下方
    if (x + MENU_W > winW - PAD) x = px - MENU_W - 6   // 右缘不足 → 翻到左侧
    if (y + MENU_H > winH - PAD) y = py - MENU_H - 12  // 底部不足 → 翻到上方
    if (x < PAD) x = PAD
    if (y < PAD) y = PAD

    this.setData({
      popShow: true, popX: x, popY: y,
      popIdx: idx, popIsCustom: isCustom
    })
  },

  closePop() { this.setData({ popShow: false }) },
  noop() {},   // 拦截冒泡与 touchmove，避免底层 scroll-view 跟着滚

  /** 菜单：改金额 / 自定义金额 → 进大表单 */
  onPopEdit() {
    const t = this.data.quickTags[this.data.popIdx]
    this.closePop()
    if (!t) return
    if (t.custom) this._openCqSheet(t.customIndex, null)  // 编辑已有档位
    else this._openCqSheet(-1, t)                         // 以普通标签为模板新建
  },

  /** 菜单：删这个档位（仅自定义档位可达） */
  onPopDelete() {
    const t = this.data.quickTags[this.data.popIdx]
    this.closePop()
    if (!t || !t.custom) return                           // 防御
    const ci = t.customIndex
    const list = store.getCustomQuick()
    if (ci < 0 || ci >= list.length) return
    const that = this
    wx.showModal({
      title: '删掉这个档位？',
      content: '只删快捷档位，不影响已记的账',
      confirmText: '删除', confirmColor: '#C42B1C', cancelText: '留着',
      success(res) {
        if (!res.confirm) return
        list.splice(ci, 1)
        if (!store.saveCustomQuick(list)) {
          wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
          return
        }
        wx.showToast({ title: '已删除', icon: 'none' })
        that.refresh()
      }
    })
  },

  /** 菜单：新建一个（始终可用） */
  onPopNew() {
    this.closePop()
    this._openCqSheet(-1, null)
  },

  /** 统一打开大表单：editIndex>=0 编辑，否则新建；templateTag 提供默认值 */
  _openCqSheet(editIndex, templateTag) {
    const list = store.getCustomQuick()
    let cat = 'food', note = '', amount = ''
    if (editIndex >= 0) {
      const it = list[editIndex] || {}
      cat = it.cat || 'food'
      note = it.note || ''
      amount = M.fmt(it.amount || 0)
    } else if (templateTag) {
      cat = templateTag.cat || 'food'
      note = templateTag.note || ''
      amount = String(templateTag.amount || '')
    }
    this.setData({
      cqSheet: true, cqEditIndex: editIndex,
      cqCat: cat, cqNote: note, cqAmount: amount,
      cqList: this.decorateCq(list)
    })
  },

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

  /** 保存档位：新增或覆盖编辑项，写库失败不提示成功 */
  saveCq() {
    const amount = M.parse(this.data.cqAmount)
    if (!(amount > 0)) {
      wx.showToast({ title: '金额要大于 0', icon: 'none' })
      return
    }
    const note = String(this.data.cqNote || '').trim() || C.getCat(this.data.cqCat).name
    const list = store.getCustomQuick()
    const item = { cat: this.data.cqCat, note: note, amount: amount }
    const idx = this.data.cqEditIndex
    if (idx >= 0 && idx < list.length) list[idx] = item
    else list.push(item)
    if (!store.saveCustomQuick(list)) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }
    wx.showToast({ title: idx >= 0 ? '已改好' : '已添加', icon: 'success' })
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
        that.setData({ cqList: that.decorateCq(list), cqEditIndex: -1 })
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
