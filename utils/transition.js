// utils/transition.js —— 页面转场内容动画（WebView 渲染引擎兼容）
//
// 背景与边界：
//   微信小程序「页面容器之间」的切换由系统管理：navigateTo 自带右滑入栈、
//   navigateBack 自带左滑出栈、switchTab 无系统动画。这些无法用 CSS 覆盖
//   （除非切 Skyline + 自定义路由，代价是重写全部页面，本项目不采用）。
//   本模块做的是「配合系统转场的内容淡入」：页面出现时让根节点内容柔和淡入，
//   把生硬的切换变得顺滑。tab 页 DOM 常驻、CSS 入场动画不会重播，故用 JS
//   在 onShow 里重播，保证每次切 tab 都有过渡感。
//
// 性能：
//   - 只动画 opacity（合成器属性），不碰 transform —— 根节点若有 transform，
//     会改变 fixed 子元素（.aurora / .save-bar / .sheet）的包含块，导致错位。
//   - 低端设备直接跳过（与 app.globalData.lowEnd 联动）。
//   - wx.createAnimation 由官方在 UI 线程执行，不占 JS 主线程。

const FROM_OPACITY = 0.55   // 从半透明淡入，而非全透明——避免切 tab 时闪一下白/黑底
const DURATION = 260        // 略短于系统右滑（约 300ms），内容先于转场结束呈现

/**
 * 播放一次页面内容淡入。
 * @param {Object} page 页面实例（传 this）
 * @param {Object} [opt] { force: true } 可覆盖低端跳过
 */
function playEnter(page, opt) {
  if (!page || typeof page.setData !== 'function') return
  const app = typeof getApp === 'function' ? getApp() : null
  if (app && app.globalData && app.globalData.lowEnd && !(opt && opt.force)) return

  try {
    const anim = wx.createAnimation({
      duration: 0,
      timingFunction: 'linear',
      delay: 0
    })
    anim.opacity(FROM_OPACITY).step()
    anim.opacity(1).step({ duration: DURATION, timingFunction: 'ease-out' })
    page.setData({ pageAnim: anim.export() })
  } catch (e) {
    // createAnimation 不可用时静默降级：系统转场仍然存在，不影响功能
  }
}

module.exports = { playEnter }
