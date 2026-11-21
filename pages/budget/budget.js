// pages/budget/budget.js —— 预算设置
const store = require('../../utils/store.js')
const M = require('../../utils/money.js')
const D = require('../../utils/date.js')
const C = require('../../utils/categories.js')

Page({
  data: {
    theme: 't-pink',
    modeClass: store.modeClass(),
    total: '',
    cats: [],
    sumCatsText: '0',
    sumDiffText: '',
    sumWarn: false,
    sugText: '',
    historyText: '',
    hasBudget: false
  },

  onShow() {
    this.applyAppearance()
  },

  onLoad() {
    store.initIfEmpty()
    const s = store.getSettings()
    const budgetCats = s.budget.cats || {}

    const cats = C.BUDGET_CATS.map(function (c) {
      const v = M.parse(budgetCats[c.key])
      return {
        key: c.key,
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        soft: c.soft,
        value: v > 0 ? String(v) : ''
      }
    })

    // 上月花销（作为总额建议）
    const prev = store.summary(D.shiftMonth(D.thisMonth(), -1))

    this.setData({
      total: s.budget.total > 0 ? String(M.parse(s.budget.total)) : '',
      cats: cats,
      hasBudget: M.parse(s.budget.total) > 0,
      sugText: prev.expense > 0 ? M.fmt(M.toYuan(Math.ceil(M.toCents(prev.expense) / 1000) * 1000)) : ''
    }, () => {
      this.recalc()
      this.calcHistory()
    })
  },

  /* ---------------- 输入 ---------------- */

  onTotal(e) {
    this.setData({ total: e.detail.value }, () => this.recalc())
  },

  onCatInput(e) {
    const i = e.currentTarget.dataset.i
    const patch = {}
    patch['cats[' + i + '].value'] = e.detail.value
    this.setData(patch, () => this.recalc())
  },

  /** 实时算分项合计，超过或远低于总额都提示 */
  recalc() {
    let cents = 0
    const totalCents = M.toCents(M.parse(this.data.total))
    for (let i = 0; i < this.data.cats.length; i++) {
      cents += M.toCents(M.parse(this.data.cats[i].value))
    }
    const sum = M.toYuan(cents)

    let diffText = ''
    let warn = false
    if (cents > 0 && totalCents > 0) {
      const d = M.toYuan(cents - totalCents)
      if (d > 0) {
        diffText = '超出总额 ¥' + M.fmt(d)
        warn = true
      } else if (d >= -100) {
        diffText = '刚好对上'
      } else {
        diffText = '比总额少 ¥' + M.fmt(-d) + '，这部分没有管'
        warn = true
      }
    } else if (cents > 0 && totalCents === 0) {
      diffText = '还没填总预算'
      warn = true
    }

    this.setData({
      sumCatsText: M.fmt(sum),
      sumDiffText: diffText,
      sumWarn: warn
    })
  },

  /* ---------------- 快捷填充 ---------------- */

  onUseSug() {
    this.setData({ total: String(M.parse(this.data.sugText.replace(/,/g, ''))) }, () => this.recalc())
  },

  /** 按近 3 个月的分类均值填充分项 */
  calcHistory() {
    const cur = D.thisMonth()
    const months = [D.shiftMonth(cur, -1), D.shiftMonth(cur, -2), D.shiftMonth(cur, -3)]
    const acc = {}
    let validMonths = 0
    for (let i = 0; i < months.length; i++) {
      const s = store.summary(months[i])
      if (s.expense > 0) validMonths++
      for (let j = 0; j < s.byCat.length; j++) {
        const c = s.byCat[j]
        acc[c.key] = (acc[c.key] || 0) + M.toCents(c.amount)
      }
    }
    if (!validMonths) {
      this.setData({ historyText: '' })
      return null
    }
    const avg = {}
    let totalCents = 0
    Object.keys(acc).forEach(function (k) {
      // 向上取整到 10 元，方便人看
      const v = Math.ceil(acc[k] / validMonths / 1000) * 1000
      avg[k] = M.toYuan(v)
      totalCents += v
    })
    this.historyAvg = avg
    this.setData({
      historyText: M.fmt(M.toYuan(totalCents))
    })
    return avg
  },

  fillByHistory() {
    const avg = this.historyAvg || this.calcHistory()
    if (!avg) {
      wx.showToast({ title: '历史数据还不够，先记两周账', icon: 'none' })
      return
    }
    const cats = this.data.cats.map(function (c) {
      const v = avg[c.key]
      return Object.assign({}, c, { value: v > 0 ? String(v) : '' })
    })
    let totalCents = 0
    Object.keys(avg).forEach(function (k) { totalCents += M.toCents(avg[k]) })
    this.setData({
      cats: cats,
      total: String(M.toYuan(totalCents))
    }, () => this.recalc())
    wx.showToast({ title: '已按历史填好，可再微调', icon: 'none' })
  },

  /* ---------------- 保存 ---------------- */

  save() {
    const total = M.parse(this.data.total)
    const cats = {}
    for (let i = 0; i < this.data.cats.length; i++) {
      const v = M.parse(this.data.cats[i].value)
      if (v > 0) cats[this.data.cats[i].key] = v
    }
    const s = store.getSettings()
    s.budget = { total: total, cats: cats }
    store.saveSettings(s)
    // P0：写库失败时不弹成功、不跳页
    if (!store.lastWriteOk()) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }

    wx.showToast({ title: total > 0 ? '预算存好了' : '已保存', icon: 'success' })
    setTimeout(function () {
      wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/index/index' }) } })
    }, 450)
  },

  clearBudget() {
    const that = this
    wx.showModal({
      title: '清空预算？',
      content: '账目记录不会受影响',
      confirmText: '清空',
      confirmColor: '#C42B1C',
      success(res) {
        if (!res.confirm) return
        const s = store.getSettings()
        s.budget = { total: 0, cats: {} }
        store.saveSettings(s)
        if (!store.lastWriteOk()) {
          wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
          return
        }
        that.setData({
          total: '',
          cats: that.data.cats.map(function (c) { return Object.assign({}, c, { value: '' }) }),
          hasBudget: false
        }, () => that.recalc())
        wx.showToast({ title: '已清空', icon: 'none' })
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
