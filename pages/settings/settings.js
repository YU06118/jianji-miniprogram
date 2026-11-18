// pages/settings/settings.js —— 统一设置（外观 / 记账 / 数据工具 / 关于）
const store = require('../../utils/store.js')
const M = require('../../utils/money.js')

Page({
  data: {
    theme: 't-pink',
    modeClass: store.modeClass(),
    appearance: 'dark',
    appearances: [],
    budgetText: '未设置',
    themes: [],
    themeName: '系统蓝',
    showHow: false
  },

  onShow() {
    store.initIfEmpty()
    this.applyAppearance()
    this.load()
  },

  load() {
    const settings = store.getSettings()
    const total = M.parse(settings.budget.total)
    this.setData({
      appearance: store.getAppearance(),
      appearances: store.appearanceList().map(function (a) {
        return { key: a.key, name: a.name, on: a.key === store.getAppearance() }
      }),
      budgetText: total > 0 ? '¥' + M.fmt(total) + ' / 月' : '未设置',
      themes: store.themeList().map(function (t) {
        return { key: t.key, name: t.name, cls: t.cls, on: t.key === store.getTheme() }
      }),
      themeName: (store.themeList().filter(function (t) {
        return t.key === store.getTheme()
      })[0] || { name: '系统蓝' }).name
    })
  },

  /* ---------------- 外观模式 ---------------- */

  onPickAppearance(e) {
    const v = e.currentTarget.dataset.v
    store.setAppearance(v)
    this.setData({ appearance: v, modeClass: store.modeClass() })
    getApp().syncAppearance()
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
  },

  onPickTheme(e) {
    const key = e.currentTarget.dataset.k
    store.setTheme(key)
    this.setData({ theme: store.themeClass() })
    getApp().syncAppearance()
    this.load()
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
  },

  /* ---------------- 跳转 ---------------- */

  goBudget() {
    wx.navigateTo({ url: '/pages/budget/budget' })
  },

  goStats() {
    wx.switchTab({ url: '/pages/stats/stats' })
  },

  toggleHow() {
    this.setData({ showHow: !this.data.showHow })
  },

  /* ---------------- 备份 / 恢复 ---------------- */

  doBackup() {
    const text = store.exportJSON()
    if (text.length < 60) {
      wx.showToast({ title: '还没有数据可以备份', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: text,
      success() {
        wx.showModal({
          title: '备份已复制',
          content: '内容有 ' + text.length + ' 个字符。建议立刻粘贴到微信收藏、备忘录或发给自己，别留在剪贴板里被覆盖。',
          showCancel: false,
          confirmText: '知道了'
        })
      },
      fail() {
        wx.showToast({ title: '复制失败，请重试', icon: 'none' })
      }
    })
  },

  doRestore() {
    const that = this
    wx.getClipboardData({
      success(res) {
        const text = res.data || ''
        if (!text) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' })
          return
        }
        wx.showModal({
          title: '确认恢复？',
          content: '同一个月的记录会被备份里的内容替换掉，其他月份不受影响。',
          confirmText: '恢复',
          confirmColor: '#EF5478',
          success(r) {
            if (!r.confirm) return
            const out = store.importJSON(text)
            wx.showModal({
              title: out.ok ? '恢复完成' : '没能恢复',
              content: out.msg,
              showCancel: false
            })
            if (out.ok) that.load()
          }
        })
      },
      fail() {
        wx.showToast({ title: '读不到剪贴板', icon: 'none' })
      }
    })
  },

  /* ---------------- 示例数据 ---------------- */

  doSeed() {
    const that = this
    wx.showModal({
      title: '填入示例数据？',
      content: '会先清空本月已有记录，换成一份 26 笔的示例账，方便你先看看效果。',
      confirmText: '填入',
      confirmColor: '#EF5478',
      success(res) {
        if (!res.confirm) return
        const n = store.seedDemo()
        that.load()
        wx.showModal({
          title: '已填入 ' + n + ' 笔',
          content: '回到「记账」页看看效果：首页有本月进度，去「钱去哪了」能看分类占比。',
          showCancel: false,
          confirmText: '好'
        })
      }
    })
  },

  /* ---------------- 清空 ---------------- */

  doClear() {
    const that = this
    wx.showModal({
      title: '清空所有数据？',
      content: '所有账目、预算、攒钱目标都会被删除，无法恢复。',
      confirmText: '继续',
      confirmColor: '#E8453F',
      success(res) {
        if (!res.confirm) return
        wx.showModal({
          title: '最后确认一次',
          content: '真的要把全部数据删掉吗？建议先做一次备份。',
          confirmText: '确定删除',
          confirmColor: '#E8453F',
          success(r2) {
            if (!r2.confirm) return
            store.clearAll()
            that.load()
            wx.showToast({ title: '已清空', icon: 'none' })
          }
        })
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
