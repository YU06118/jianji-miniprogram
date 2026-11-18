// pages/me/me.js —— 我的（概览 + 设置入口）
const store = require('../../utils/store.js')

Page({
  data: {
    theme: 't-pink',
    modeClass: store.modeClass(),
    stats: { records: 0, months: 0, days: 0 }
  },

  onShow() {
    store.initIfEmpty()
    this.applyAppearance()
    this.load()
  },

  load() {
    const s = store.stats()
    const meta = store.getMeta()
    const created = meta.createdAt || Date.now()
    const days = Math.max(1, Math.round((Date.now() - created) / 86400000))
    this.setData({
      stats: {
        records: s.records,
        months: s.months,
        days: days
      }
    })
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
    if (Object.keys(patch).length) this.setData(patch)
  }
})
