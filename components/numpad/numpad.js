// components/numpad/numpad.js
// 键盘只管抛事件，金额字符串由页面持有，便于页面做自动分类等联动
Component({
  properties: {},

  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.k
      wx.vibrateShort && wx.vibrateShort({ type: 'light', fail() {} })
      this.triggerEvent('key', { key: key })
    },

    onConfirm() {
      this.triggerEvent('confirm')
    }
  }
})
