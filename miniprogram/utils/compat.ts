/**
 * 兼容能力检测（阶段 0 C4/R1/R2/R4）。
 * wxss 无法做 CSS 特性检测，统一在 JS 侧判定后给根节点附加降级类名。
 */

import type { CompatInfo } from '../types';
import { getSystemInfoSnapshot } from './wxPromise';

/** 版本号比较：返回 1 表示 v1>v2，0 相等，-1 小于 */
export function compareVersion(v1: string, v2: string): number {
  const a = v1.split('.');
  const b = v2.split('.');
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const n1 = Number(a[i] ?? 0);
    const n2 = Number(b[i] ?? 0);
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

/** 是否支持隐私接口（2.32.3+） */
export function supportsPrivacyApi(sdkVersion: string): boolean {
  return compareVersion(sdkVersion, '2.32.3') >= 0;
}

/**
 * 是否支持 backdrop-filter。
 * wxss 无法特性检测；已知 Android 多数 WebView 支持不稳，采用保守策略：
 * iOS 全部视为支持；Android 一律加降级类（视觉仍协调，符合 §4.5）。
 * 精确支持矩阵列为真机验证项（阶段 0 R2 未确认）。
 */
export function supportsBackdropFilter(platform: string): boolean {
  const p = platform.toLowerCase();
  if (p === 'ios' || p === 'devtools') return true;
  return false;
}

/** 生成根节点类名，供 WXML 绑定 class 使用 */
export function detectCompat(): CompatInfo {
  const info = getSystemInfoSnapshot();
  const glassSupported = supportsBackdropFilter(info.platform);
  return {
    platform: info.platform,
    sdkVersion: info.sdkVersion,
    glassSupported,
    rootClass: glassSupported ? 'theme-root' : 'theme-root glass--fallback',
  };
}
