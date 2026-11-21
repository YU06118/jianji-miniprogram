// pages/add/add.js —— 记账页
// 设计目标：打开即可输金额 → 分类已自动猜好 → 完成。全程 3 秒以内。
const store = require('../../utils/store.js')
const T = require('../../utils/transition.js')
const M = require('../../utils/money.js')
const D = require('../../utils/date.js')
const C = require('../../utils/categories.js')

/** 金额字符串拼接规则（保证不会出现 00、多个小数点、超两位小数） */
function appendAmount(cur, k) {
  const s = String(cur || '')
  if (k === 'del') return s.slice(0, -1)
  if (k === '.') {
    if (s.indexOf('.') >= 0) return s
    return s === '' ? '0.' : s + '.'
  }
  const dot = s.indexOf('.')
  if (dot >= 0 && s.length - dot > 2) return s        // 小数位已满
  if (s === '0') return k                              // 避免 01
  const digits = s.replace('.', '')
  if (digits.length >= 7) return s                     // 上限 7 位数字（整数 9999999 / 带两位小数 99999.99）
  return s + k
}

/** 把系统输入法产出的任意串规整为 appendAmount 等价的合法串 */
function sanitizeAmount(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^0-9.]/g, '')
  let out = ''
  for (let i = 0; i < s.length; i++) out = appendAmount(out, s[i])
  return out
}

Page({
  data: {
    theme: 't-pink',
    modeClass: store.modeClass(),
    type: 'expense',
    amountStr: '',
    amountFocus: false,
    cat: 'food',
    note: '',
    date: '',
    dateLabel: '',
    today: '',
    cats: [],
    quickTags: [],
    curCat: C.getCat('food'),
    catTouched: false,
    autoHint: false,
    editingId: '',
    editingYm: ''
  },

  onShow() {
    T.playEnter(this)  // 页面转场：内容淡入（配合系统右滑/tab切换）
    this.applyAppearance()
  },

  onLoad(q) {
    store.initIfEmpty()
    const today = D.today()
    let patch = {
      today: today,
      date: today,
      dateLabel: D.human(today)
    }

    // 编辑已有记录
    if (q && q.id && q.ym) {
      const rec = store.getRecords(q.ym).filter(function (r) { return r.id === q.id })[0]
      if (rec) {
        patch = Object.assign(patch, {
          editingId: rec.id,
          editingYm: q.ym,
          type: rec.type,
          amountStr: String(rec.amount),
          cat: rec.cat,
          note: rec.note || '',
          date: rec.date,
          dateLabel: D.human(rec.date),
          catTouched: true
        })
        wx.setNavigationBarTitle({ title: '改一笔' })
      }
    } else if (q && q.cat) {
      patch.cat = q.cat
      patch.type = q.type || 'expense'
      patch.catTouched = true
    }

    if (q && q.type === 'income') patch.type = patch.type || 'income'

    // 新增页自动聚焦金额，编辑态不自动弹键盘
    patch.amountFocus = !patch.editingId

    this.setData(patch, () => {
      this.refreshCats()
      this.refreshQuick()
    })
  },

  /* ---------------- 视图数据 ---------------- */

  refreshCats() {
    const cats = C.catsOf(this.data.type)
    const cur = C.getCat(this.data.cat)
    // 切换类型后原分类不存在时，回落到第一个
    const exists = cats.some(function (c) { return c.key === this.data.cat }, this)
    this.setData({
      cats: cats,
      cat: exists ? this.data.cat : cats[0].key,
      curCat: exists ? cur : cats[0]
    })
  },

  refreshQuick() {
    const type = this.data.type
    const tags = store.quickTags(8).filter(function (t) { return t.type === type })
    const out = tags.map(function (t) {
      const c = C.getCat(t.cat)
      return {
        key: t.cat + '|' + t.note,
        type: t.type,
        cat: t.cat,
        note: t.note,
        amount: t.amount,
        amountText: M.fmt(t.amount),
        emoji: c.emoji,
        color: c.color,
        learned: t.learned
      }
    })
    this.setData({ quickTags: out })
  },

  /* ---------------- 交互 ---------------- */

  onType(e) {
    const t = e.currentTarget.dataset.t
    if (t === this.data.type) return
    const cats = C.catsOf(t)
    this.setData({
      type: t,
      cats: cats,
      cat: cats[0].key,
      curCat: cats[0],
      catTouched: false,
      autoHint: false,
      quickTags: []
    }, () => {
      this.refreshQuick()
      this.reguess()
    })
  },

  onAmountInput(e) {
    // 受控输入：系统键盘的任意产出都即时清洗，非法字符立即被清除
    this.setData({ amountStr: sanitizeAmount(e.detail.value) })
    this.reguess()
  },

  onCat(e) {
    const k = e.currentTarget.dataset.k
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
    this.setData({
      cat: k,
      curCat: C.getCat(k),
      catTouched: true,
      autoHint: false
    })
  },

  onNote(e) {
    this.setData({ note: e.detail.value })
    this.reguess()
  },

  clearNote() {
    this.setData({ note: '' })
  },

  /**
   * 自动分类：只在用户没有手动选过分类时生效。
   * 备注 + 金额都参与判断，备注命中关键词优先。
   */
  reguess() {
    if (this.data.catTouched) return
    const guessKey = C.guess(this.data.note)
    if (!guessKey) {
      this.setData({ autoHint: false })
      return
    }
    const cats = C.catsOf(this.data.type)
    const hit = cats.filter(function (c) { return c.key === guessKey })[0]
    if (!hit) {
      this.setData({ autoHint: false })
      return
    }
    if (hit.key !== this.data.cat) {
      this.setData({ cat: hit.key, curCat: hit, autoHint: true })
    } else {
      this.setData({ autoHint: true })
    }
  },

  onDate(e) {
    const d = e.detail.value
    this.setData({ date: d, dateLabel: D.human(d) })
  },

  /** 点常用标签：金额、分类、备注一起带上，直接存 */
  onQuick(e) {
    const i = e.currentTarget.dataset.i
    const t = this.data.quickTags[i]
    if (!t) return
    wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
    this.commit({
      type: t.type,
      amount: t.amount,
      cat: t.cat,
      note: t.note,
      date: this.data.date
    })
  },

  onConfirm() {
    // 回车与按钮可能在 420ms 跳转窗口内各触发一次，用实例标志防重复写入
    if (this._submitting) return
    const amount = M.parse(this.data.amountStr)
    if (!(amount > 0)) {
      wx.showToast({ title: '先输入金额', icon: 'none' })
      return
    }
    this._submitting = true
    wx.hideKeyboard && wx.hideKeyboard({ fail() {} })
    this.commit({
      type: this.data.type,
      amount: amount,
      cat: this.data.cat,
      note: this.data.note,
      date: this.data.date
    })
  },

  /** 统一写入口 */
  commit(payload) {
    const amount = M.parse(payload.amount)
    if (!(amount > 0)) {
      wx.showToast({ title: '先输入金额', icon: 'none' })
      return
    }

    const editing = !!this.data.editingId
    if (editing) {
      store.updateRecord(this.data.editingYm, this.data.editingId, {
        type: payload.type,
        amount: amount,
        cat: payload.cat,
        note: payload.note,
        date: payload.date
      })
    } else {
      store.addRecord({
        type: payload.type,
        amount: amount,
        cat: payload.cat,
        note: payload.note,
        date: payload.date
      })
    }
    // P0：写库失败时不弹成功、不跳页，保留表单让用户重试
    if (!store.lastWriteOk()) {
      wx.showToast({ title: '保存失败，空间可能已满', icon: 'none' })
      return
    }
    wx.showToast({ title: editing ? '改好了' : '记好了', icon: 'success' })

    setTimeout(function () {
      wx.navigateBack({ delta: 1, fail() { wx.switchTab({ url: '/pages/index/index' }) } })
    }, 420)
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
