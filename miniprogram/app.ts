/**
 * 小程序入口：启动时执行存储迁移与兼容能力检测（阶段 1）。
 * 不申请任何与功能无关的权限；隐私弹窗逻辑在阶段 4 接入，且不得阻塞首屏记账。
 */

import type { CompatInfo } from './types';
import { detectCompat } from './utils/compat';
import { computeNavSafeTop } from './utils/nav';
import { runMigrationsIfNeeded } from './utils/storage';

/** 供各页面 getApp() 读取的全局数据形状 */
export interface AppGlobalData {
  compat: CompatInfo | null;
  schemaVersion: number;
  /** 顶部安全偏移（胶囊底+间距）：页面注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** 最近一次 tabBar 点击时间戳：tab 页 onShow 据此判定是否播切换入场动画（交互修复第一批） */
  lastTabSwitchAt: number;
}

export interface AppOptionWithGlobalData {
  globalData: AppGlobalData;
}

App<AppOptionWithGlobalData>({
  globalData: {
    compat: null,
    schemaVersion: 0,
    navSafeTop: 0,
    lastTabSwitchAt: 0,
  },

  onLaunch(): void {
    // 1) 兼容检测（同步，不阻塞 UI）
    this.globalData.compat = detectCompat();
    // 2) 顶部安全区计算（同步，全局一次；页面 onLoad 注入为 CSS 变量）
    this.globalData.navSafeTop = computeNavSafeTop();
    // 3) 存储结构迁移（幂等，失败不影响首屏渲染，记录到控制台）
    try {
      this.globalData.schemaVersion = runMigrationsIfNeeded();
    } catch (error) {
      console.error('[JJ] migration failed on launch', error);
    }
  },
});
