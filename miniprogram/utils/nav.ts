/**
 * 顶部安全区计算（阶段 6）：全局 navigationStyle: custom 下，
 * 页面内容必须避让状态栏与右上胶囊按钮（微信 •••/⊙ 胶囊）。
 * 策略：优先胶囊矩形 rect.bottom + 间距（跨端可靠，devtools/iOS/Android 均可取）；
 * 胶囊信息异常时回退 statusBarHeight + 标准导航高度 44。
 * 计算一次存 app.globalData，页面 onLoad 注入为 CSS 变量 --nav-safe-top。
 */

import type { CompatInfo } from '../types';
import { getSystemInfoSnapshot } from './wxPromise';

/** 胶囊底部与页面内容之间的间距（px） */
const CAPSULE_GAP = 8;
/** 无胶囊信息时的标准导航栏高度兜底（px） */
const NAV_HEIGHT_FALLBACK = 44;
/** tab 切换动画窗口（ms），与 app.wxss .anim-tab-enter-* 的 800ms 对齐（第七阶段） */
const TAB_SWITCH_WINDOW_MS = 800;

/** 计算页面内容安全顶部偏移：胶囊底 + 间距；异常回退状态栏 + 44。 */
export function computeNavSafeTop(): number {
  if (typeof wx.getMenuButtonBoundingClientRect === 'function') {
    try {
      const rect = wx.getMenuButtonBoundingClientRect();
      if (rect && rect.width > 0 && rect.bottom > 0) {
        return rect.bottom + CAPSULE_GAP;
      }
    } catch {
      // 胶囊接口异常（极少数环境）：走 statusBarHeight 兜底
    }
  }
  return getSystemInfoSnapshot().statusBarHeight + NAV_HEIGHT_FALLBACK;
}

/** 页面启动注入数据的形状（compat 降级类 + 安全区变量） */
export interface ThemeBootstrap {
  compat: CompatInfo | null;
  navSafeTop: number;
}

/** getApp() 返回的最小全局数据形状（避免与 app.ts 形成运行时循环依赖） */
interface AppGlobalLike {
  globalData?: {
    compat?: CompatInfo | null;
    navSafeTop?: number;
    /** custom-tab-bar 切页时写入的时间戳 */
    lastTabSwitchAt?: number;
  } | undefined;
}

/**
 * 页面 onLoad 统一调用：从 globalData 取 compat 与 navSafeTop，
 * 一次性 setData，供 wxml 根节点绑定 rootClass 与 --nav-safe-top 变量。
 */
export function getThemeBootstrap(): ThemeBootstrap {
  const app = getApp<AppGlobalLike>();
  return {
    compat: app.globalData?.compat ?? null,
    navSafeTop: app.globalData?.navSafeTop ?? 0,
  };
}

/**
 * 第七阶段：是否处于 tab 切换窗口。
 * tab 页 onShow 据此跳过「同月全量刷新」——切 tab 时数据未变，重复 queryRecords
 * 是最大的无谓开销；从编辑页 navigateBack 返回时不在窗口内，仍正常刷新。
 */
export function isRecentTabSwitch(now: number = Date.now()): boolean {
  const at = getApp<AppGlobalLike>().globalData?.lastTabSwitchAt;
  return typeof at === 'number' && now - at >= 0 && now - at < TAB_SWITCH_WINDOW_MS;
}
