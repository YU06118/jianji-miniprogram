// pages/settings/settings.js —— 统一设置（外观 / 记账 / 数据工具 / 关于）
const store = require('../../utils/store.js')
const T = require('../../utils/transition.js')
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
    T.playEnter(this)  // 页面转场：内容淡入（配合系统右滑/tab切换）
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

  toggleHow() {
    this.setData({ showHow: !this.data.showHow })
  },

  /* ---------------- 备份 / 恢复 ---------------- */

  doBackup() {
    // P0：空骨架 JSON 本身就有 160+ 字符，原 text.length < 60 永远不触发。
    // 改为按真实内容判断：有记录 / 有目标 / 有预算才算可备份。
    let recCount = 0
    const keys = store.getMonthKeys()
    for (let i = 0; i < keys.length; i++) recCount += store.getRecords(keys[i]).length
    const goalCount = store.getGoals().length
    const total = (store.getSettings().budget && store.getSettings().budget.total) || 0
    if (!recCount && !goalCount && !(M.parse(total) > 0)) {
      wx.showToast({ title: '还没有数据可以备份', icon: 'none' })
      return
    }
    const text = store.exportJSON()
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
          confirmColor: '#C42B1C',
          success(r) {
            if (!r.confirm) return
            const out = store.importJSON(text)
            // P0：部分月份写入失败时明确提示，不能只报「恢复完成」
            const writeFailed = out.ok && !store.lastWriteOk()
            wx.showModal({
              title: out.ok ? (writeFailed ? '部分恢复' : '恢复完成') : '没能恢复',
              content: writeFailed
                ? out.msg + '。但部分月份写入失败（空间可能已满），建议清理旧数据后重试。'
                : out.msg,
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
    const keys = store.getMonthKeys()
    const thisMonth = keys.length ? keys[0] : ''
    const exist = thisMonth ? store.getRecords(thisMonth).length : 0
    const content = exist
      ? '本月已有 ' + exist + ' 笔真实记录，填入示例会先把它们清空并覆盖。建议先「备份数据」。确定继续？'
      : '会填入 26 笔示例账，方便你先看看效果。'

    wx.showModal({
      title: '填入示例数据？',
      content: content,
      confirmText: '继续',
      confirmColor: '#C42B1C',
      success(res) {
        if (!res.confirm) return
        // P0：有真实记录时必须二次确认，避免一次手滑丢掉整月数据
        if (exist) {
          wx.showModal({
            title: '最后确认',
            content: '真的要清空本月 ' + exist + ' 笔记录吗？此操作不可恢复。',
            confirmText: '确定填入',
            confirmColor: '#C42B1C',
            success(r2) { if (r2.confirm) that._reallySeed() }
          })
        } else {
          that._reallySeed()
        }
      }
    })
  },

  _reallySeed() {
    const that = this
    const n = store.seedDemo()
    if (!store.lastWriteOk()) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }
    that.load()
    wx.showModal({
      title: '已填入 ' + n + ' 笔',
      content: '回到「记账」页看看效果：首页有本月进度，去底部「统计」能看分类占比。',
      showCancel: false,
      confirmText: '好'
    })
  },

  /* ---------------- 清空 ---------------- */

  doClear() {
    const that = this
    wx.showModal({
      title: '清空所有数据？',
      content: '所有账目、预算、攒钱目标都会被删除，无法恢复。',
      confirmText: '继续',
      confirmColor: '#C42B1C',
      success(res) {
        if (!res.confirm) return
        wx.showModal({
          title: '最后确认一次',
          content: '真的要把全部数据删掉吗？建议先做一次备份。',
          confirmText: '确定删除',
          confirmColor: '#C42B1C',
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
    // 低端设备降级：关流光/毛玻璃，保首屏与滚动流畅
    const app = getApp()
    const perf = app && app.globalData && app.globalData.lowEnd ? ' low-end' : ''
    if (perf !== (this.data.perf || '')) patch.perf = perf
    if (Object.keys(patch).length) this.setData(patch)
  }
})
