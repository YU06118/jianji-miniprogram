// app.js
const store = require('./utils/store.js')

App({
  globalData: {
    needRefresh: false,
    systemTheme: 'light'
  },

  onLaunch() {
    // 首次启动时初始化数据结构
    store.initIfEmpty()

    // P0：关键写失败（存储满/系统异常）时明确告知，不再静默丢数据
    store.setWriteFailHandler(function () {
      wx.showModal({
        title: '保存失败',
        content: '手机存储空间可能已满，这次改动没有保存成功。建议先备份，再清理旧数据。',
        showCancel: false,
        confirmText: '知道了'
      })
    })

    // 记录打开次数，用于「我的」页展示
    const meta = store.getMeta()
    meta.openCount = (meta.openCount || 0) + 1
    meta.lastOpen = Date.now()
    store.saveMeta(meta)

    // 记录系统主题（跟随系统档需要）
    try { this.globalData.systemTheme = wx.getSystemInfoSync().theme || 'light' } catch (e) { }

    // 跟随系统时监听系统主题变化 → 单向驱动页面与原生栏刷新
    if (wx.onThemeChange) {
      wx.onThemeChange((res) => {
        this.globalData.systemTheme = res.theme || 'light'
        if (store.getAppearance() === 'system') this.syncAppearance()
      })
    }

    this.syncAppearance()
  },

  onShow() {
    // 从后台回到前台时，重新同步外观（原生导航栏不认 CSS 变量，只能靠 API 设色）
    this.syncAppearance()
  },

  /**
   * 统一同步外观到原生层：导航栏、tabBar、窗口背景色。
   * theme.json 只能跟随系统，用户手动选深/浅时必须用 API 兜底。
   * 末尾通知当前页刷新根节点 class（单向：页面不得回调本方法，避免死循环）。
   */
  syncAppearance() {
    const dark = store.isDark()
    const accent = store.themeColor()   // 前景强调色，深浅底上都够亮

    // 导航栏：solid 底 + 白字（所有 solid 色均验证白字 ≥4.5:1）
    if (wx.setNavigationBarColor) {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: store.navColor(),
        fail() { }
      })
    }

    // tabBar：跟随系统靠 theme.json，手动深/浅靠这里兜底
    if (wx.setTabBarStyle) {
      wx.setTabBarStyle({
        color: dark ? '#9E9E9E' : '#686868',
        selectedColor: accent,
        backgroundColor: dark ? '#2C2C2C' : '#FFFFFF',
        borderStyle: dark ? 'black' : 'white',
        fail() { }
      })
    }

    // 窗口背景（下拉露出的区域），避免边缘露白/露黑
    if (wx.setBackgroundColor) {
      wx.setBackgroundColor({
        backgroundColor: dark ? '#202020' : '#F3F3F3',
        fail() { }
      })
    }

    // 通知当前活跃页刷新根节点 class 与 JS 内联色
    const pages = getCurrentPages()
    const cur = pages[pages.length - 1]
    if (cur && typeof cur.applyAppearance === 'function') cur.applyAppearance()
  }
})
