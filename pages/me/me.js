// pages/me/me.js —— 我的（概览 + 设置入口）
const store = require('../../utils/store.js')
const T = require('../../utils/transition.js')
const M = require('../../utils/money.js')

Page({
  data: {
    theme: 't-pink',
    modeClass: store.modeClass(),
    stats: { records: 0, months: 0, days: 0 },
    goalText: '还没有目标'
  },

  onShow() {
    T.playEnter(this)  // 页面转场：内容淡入（配合系统右滑/tab切换）
    store.initIfEmpty()
    this.applyAppearance()
    this.load()
  },

  load() {
    const s = store.stats()
    const meta = store.getMeta()
    const created = meta.createdAt || Date.now()
    const days = Math.max(1, Math.round((Date.now() - created) / 86400000))
    const goals = store.getGoals()
    let savedCents = 0
    for (let i = 0; i < goals.length; i++) savedCents += M.toCents(M.parse(goals[i].saved))
    this.setData({
      stats: {
        records: s.records,
        months: s.months,
        days: days
      },
      goalText: goals.length ? '已攒 ¥' + M.fmt(M.toYuan(savedCents)) : '还没有目标'
    })
  },

  goGoal() {
    wx.navigateTo({ url: '/pages/goal/goal' })
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
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
