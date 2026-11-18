// pages/goal/goal.js —— 攒钱目标
const store = require('../../utils/store.js')
const M = require('../../utils/money.js')
const D = require('../../utils/date.js')

const EMOJIS = ['🎓', '✈️', '🏠', '🚗', '💍', '🎁', '🧳', '📱', '🐷', '🎨', '🏥', '🎉']
const DEPOSIT_QUICK = [200, 500, 1000, 2000]

Page({
  data: {
    goals: [],
    totalSavedText: '0',
    totalTargetText: '0',
    totalPct: 0,
    totalPctW: 0,

    sheetMode: '',
    emojis: EMOJIS,
    form: { id: '', name: '', emoji: '🎓', target: '', saved: '', deadline: '' },

    depositGoal: { id: '', name: '' },
    depositAmount: '',
    depositMode: 'in',
    depositQuick: DEPOSIT_QUICK,
    depositNeedText: '0'
  },

  onShow() {
    store.initIfEmpty()
    this.applyAppearance()
    this.load()
  },

  /* ---------------- 数据 ---------------- */

  load() {
    const raw = store.getGoals()
    let savedCents = 0
    let targetCents = 0

    const goals = raw.map(function (g) {
      const target = M.parse(g.target)
      const saved = M.parse(g.saved)
      const pct = target > 0 ? Math.round(saved / target * 100) : 0
      const done = target > 0 && saved >= target
      const need = M.toYuan(Math.max(0, M.toCents(target) - M.toCents(saved)))

      savedCents += M.toCents(saved)
      targetCents += M.toCents(target)

      /* 副标题 */
      let subline = ''
      let dl = null
      if (g.deadline) {
        dl = D.daysUntil(g.deadline)
        if (dl > 0) subline = '目标日 ' + g.deadline + ' · 还剩 ' + dl + ' 天'
        else subline = '目标日 ' + g.deadline + '（已过期）'
      }
      if (!subline || done) {
        subline = done ? '已经达成了' : ('还差 ¥' + M.fmt(need))
      }

      /* 行动建议 */
      let tip = ''
      if (done) {
        tip = '🎉 目标达成，这笔钱可以放心用了'
      } else if (dl !== null && dl > 0) {
        const months = Math.max(1, Math.ceil(dl / 30))
        tip = '每月存 ¥' + M.fmt(M.toYuan(Math.ceil(M.toCents(need) / months))) + '，就能在目标日前存够'
      }
      if (!tip) {
        const createdDays = Math.max(1, Math.round((Date.now() - (g.createdAt || Date.now())) / 86400000))
        const speedCents = M.toCents(saved) / createdDays
        if (speedCents > 1 && need > 0) {
          const daysNeed = Math.ceil(M.toCents(need) / speedCents)
          if (daysNeed <= 365 * 3) {
            const fd = new Date(Date.now() + daysNeed * 86400000)
            tip = '按现在的速度，大约 ' + fd.getFullYear() + ' 年 ' + (fd.getMonth() + 1) + ' 月能存够'
          } else {
            tip = '按现在的速度还得好几年，可以把每月目标调高一点'
          }
        }
      }
      if (!tip) tip = '还差 ¥' + M.fmt(need) + '，存一笔就开始积累吧'

      const meta = EMOJIS.indexOf(g.emoji) >= 0 ? null : null // 保留用户原样
      return {
        id: g.id,
        name: g.name,
        emoji: g.emoji || '🎯',
        soft: done ? '#E4F5F1' : '#FFF3E0',
        target: target,
        saved: saved,
        pct: pct,
        done: done,
        w: Math.min(100, Math.max(2, pct)),
        barColor: done
          ? 'linear-gradient(90deg,#6FD3B8,#3FAE9F)'
          : 'linear-gradient(90deg,#FFD08A,#F5A93B)',
        savedText: M.fmt(saved),
        targetText: M.fmt(target),
        subline: subline,
        tip: tip,
        raw: g
      }
    })

    const totalPct = targetCents > 0 ? Math.round(savedCents / targetCents * 100) : 0

    this.setData({
      goals: goals,
      totalSavedText: M.fmt(M.toYuan(savedCents)),
      totalTargetText: M.fmt(M.toYuan(targetCents)),
      totalPct: totalPct,
      totalPctW: Math.min(100, totalPct)
    })
  },

  /* ---------------- 弹层控制 ---------------- */

  closeSheet() {
    this.setData({ sheetMode: '' })
  },

  openNew() {
    this.setData({
      sheetMode: 'edit',
      form: { id: '', name: '', emoji: '🎓', target: '', saved: '', deadline: '' }
    })
  },

  openEdit(e) {
    const g = this.data.goals[e.currentTarget.dataset.i]
    if (!g) return
    const raw = g.raw
    this.setData({
      sheetMode: 'edit',
      form: {
        id: raw.id,
        name: raw.name,
        emoji: raw.emoji || '🎓',
        target: String(M.parse(raw.target) || ''),
        saved: String(M.parse(raw.saved) || ''),
        deadline: raw.deadline || ''
      }
    })
  },

  /* ---------------- 表单 ---------------- */

  onFormInput(e) {
    const k = e.currentTarget.dataset.k
    const v = e.detail.value
    this.setData({ ['form.' + k]: v })
  },

  pickEmoji(e) {
    this.setData({ 'form.emoji': e.currentTarget.dataset.e })
  },

  onDeadline(e) {
    this.setData({ 'form.deadline': e.detail.value })
  },

  clearDeadline() {
    this.setData({ 'form.deadline': '' })
  },

  submitForm() {
    const f = this.data.form
    const name = (f.name || '').trim()
    if (!name) {
      wx.showToast({ title: '给它起个名字吧', icon: 'none' })
      return
    }
    const target = M.parse(f.target)
    if (!(target > 0)) {
      wx.showToast({ title: '填一下目标金额', icon: 'none' })
      return
    }
    const saved = M.parse(f.saved)

    if (f.id) {
      store.updateGoal(f.id, { name: name, emoji: f.emoji, target: target, saved: saved, deadline: f.deadline })
      wx.showToast({ title: '改好了', icon: 'success' })
    } else {
      if (!store.addGoal({ name: name, emoji: f.emoji, target: target, saved: saved, deadline: f.deadline })) {
        wx.showToast({ title: '名称或金额不合规', icon: 'none' })
        return
      }
      wx.showToast({ title: '目标已定下', icon: 'success' })
    }
    this.setData({ sheetMode: '' })
    this.load()
  },

  removeGoal() {
    const id = this.data.form.id
    const that = this
    wx.showModal({
      title: '删掉这个目标？',
      content: '已经存的钱不会自动记账，删了只是不再跟踪',
      confirmText: '删除',
      confirmColor: '#EF5350',
      success(res) {
        if (!res.confirm) return
        store.deleteGoal(id)
        that.setData({ sheetMode: '' })
        that.load()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  /* ---------------- 存一笔 ---------------- */

  openDeposit(e) {
    const g = this.data.goals[e.currentTarget.dataset.i]
    if (!g) return
    this.setData({
      sheetMode: 'deposit',
      depositGoal: { id: g.id, name: g.name },
      depositAmount: '',
      depositMode: 'in',
      depositNeedText: M.fmt(M.toYuan(Math.max(0, M.toCents(g.target) - M.toCents(g.saved))))
    })
  },

  onDepositInput(e) {
    this.setData({ depositAmount: e.detail.value })
  },

  pickDeposit(e) {
    const v = e.currentTarget.dataset.v
    const cur = M.parse(this.data.depositAmount)
    const next = M.toYuan(M.toCents(cur) + M.toCents(v))
    this.setData({ depositAmount: String(next) })
  },

  setDepositMode(e) {
    this.setData({ depositMode: e.currentTarget.dataset.m })
  },

  submitDeposit() {
    const amt = M.parse(this.data.depositAmount)
    if (!(amt > 0)) {
      wx.showToast({ title: '先输入金额', icon: 'none' })
      return
    }
    const delta = this.data.depositMode === 'out' ? -amt : amt
    store.depositToGoal(this.data.depositGoal.id, delta)
    wx.showToast({
      title: (delta > 0 ? '存进 ¥' : '取出 ¥') + M.fmt(amt),
      icon: 'none'
    })
    this.setData({ sheetMode: '' })
    this.load()
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
