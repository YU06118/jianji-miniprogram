/**
 * 页面转场规范（交互修复第一批 / 阶段二加固 / 第四轮 A 方案）：
 * - 二级页进入：内容层 translateY(8px) + 淡入 220ms（--dur-page-enter）。
 *   根节点 idle 首帧 opacity:1（不黑屏，靠位移表达未入场），onLoad 末尾由
 *   playPageEnter 切 a/b 双类，动画必然重播；a/b 交替避免同实例复用时不重播。
 * - 返回退出（第四轮 A 方案）：不再自定义退出动画——setData/timer/身份比较全部移除，
 *   直接 wx.navigateBack()，把右滑退场交还系统，根治"点返回后整页卡灰"。
 * - tab 切换：内容 12px 上移淡入 320ms——playTabEnter 仅在 tabBar 点击后
 *   800ms 窗口内播放，子页返回等场景跳过（同页重复触发由双类交替保证重播）。
 * 只动 transform / opacity；时长走 theme.wxss token。
 */

/** tab 切换入场判定窗口：tabBar onTap 到目标页 onShow 的最大间隔 */
const TAB_SWITCH_WINDOW_MS = 800;

/**
 * 二级页入场：页面 onLoad 末尾调用（第四轮：不等 onReady，避免慢设备先渲染一帧）。
 * pageEnterSeq 0（idle，内容层 translateY(8px)、opacity:1）→ 1/2（a/b 双类交替），
 * 类名变化必然重播内容层入场动画。
 */
export function playPageEnter(page: unknown): void {
  const target = page as
    | { data?: { pageEnterSeq?: number }; setData?: (data: Record<string, unknown>) => void }
    | undefined;
  if (!target?.setData) return;
  const current = target.data?.pageEnterSeq ?? 0;
  target.setData({ pageEnterSeq: current === 1 ? 2 : 1 });
}

/**
 * 返回上一页（第四轮 A 方案，首选）：
 * - 重入防护：仅当页面上存在未完成的 exitAndBack 标记时不再重复调用。
 * - 栈深 > 1：直接 wx.navigateBack()，退出视觉完全交给系统（自带右滑），
 *   不再 setData pageExiting、不再起定时器、不再比较页面身份引用。
 * - 栈底（无上级页面）：reLaunch 回首页兜底，避免白屏。
 */
export function exitAndBack(): void {
  const pages = getCurrentPages();
  if (pages.length <= 1) {
    wx.reLaunch({ url: '/pages/index/index' });
    return;
  }
  const current = pages[pages.length - 1] as unknown as { _exitRequested?: boolean };
  if (current._exitRequested) return; // 重入防护：返回已发起，忽略后续连点
  current._exitRequested = true;
  wx.navigateBack();
}

/**
 * tab 切换入场：enterSeq 在 1/2 之间交替，驱动 app.wxss 的
 * .anim-tab-enter-a / .anim-tab-enter-b 双类互换——类名一变 CSS 动画必然重播，
 * 不依赖"先移除再加"（旧 enterFlip 布尔翻转会偶数次移除类导致隔次无动画）。
 * enterSeq 初始 0：首次进入页面不播；窗口外（子页返回等场景）不动。
 */
export function playTabEnter(page: unknown): void {
  const target = page as { data?: { enterSeq?: number }; setData?: (data: Record<string, unknown>) => void };
  if (!target?.setData) return;
  const app = getApp<{ globalData?: { lastTabSwitchAt?: number } }>();
  const switchedAt = app.globalData?.lastTabSwitchAt ?? 0;
  if (Date.now() - switchedAt > TAB_SWITCH_WINDOW_MS) return;
  const current = target.data?.enterSeq ?? 0;
  target.setData({ enterSeq: current === 1 ? 2 : 1 });
}
