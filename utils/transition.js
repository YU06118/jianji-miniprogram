// utils/transition.js —— 页面转场内容动画（WebView 渲染引擎兼容）
//
// 背景与边界：
//   微信小程序「页面容器之间」的切换由系统管理：navigateTo 自带右滑入栈、
//   navigateBack 自带左滑出栈、switchTab 无系统动画。这些无法用 CSS 覆盖
//   （除非切 Skyline + 自定义路由，代价是重写全部页面，本项目不采用）。
//   本模块做的是「配合系统转场的内容淡入」：页面出现时让根节点内容柔和淡入。
//
// ⚠️ 血泪教训（2026-11-21）：
//   曾用 wx.createAnimation 两段式 [opacity .55 → 1] 实现，结果编译预览与
//   真机上第二步恢复动画经常不执行，页面永久卡在 opacity .55 —— 整个界面
//   发灰、发暗、白色文字变灰（用户实测截图确认）。根因是 JS 动画 step 链
//   在 onShow 与系统转场叠加时不可靠。
//   现改为 CSS class 淡入：CSS animation 有确定终态（opacity:1），配合
//   animation-fill-mode:both 锁定终态，绝不会卡在中间值。
//
// 性能：只动画 opacity（合成器属性），不碰 transform —— 根节点若有 transform，
//   会改变 fixed 子元素（.aurora / .save-bar / .sheet）的包含块导致错位。

/**
 * 播放一次页面内容淡入（CSS class 方案，终态必为 opacity:1）。
 * 先移除 class 再添加，触发 CSS animation 重播（tab 页 DOM 常驻时需要）。
 * @param {Object} page 页面实例（传 this）
 */
function playEnter(page) {
  if (!page || typeof page.setData !== 'function') return
  const app = typeof getApp === 'function' ? getApp() : null
  if (app && app.globalData && app.globalData.lowEnd) return   // 低端设备跳过

  if (page.data.pageFade) {
    page.setData({ pageFade: false }, function () {
      page.setData({ pageFade: true })
    })
  } else {
    page.setData({ pageFade: true })
  }
}

module.exports = { playEnter }
