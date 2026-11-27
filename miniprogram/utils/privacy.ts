/**
 * 隐私合规辅助（阶段 4）：按基础库版本判定调用隐私接口。
 * 事实：wx.requirePrivacyAuthorize / wx.getPrivacySetting 均自基础库 2.32.3 起支持（官方文档）。
 * 项目最低 2.30.0，故 2.30.0～2.32.2 需降级路径。
 * 官方文档说明 getPrivacySetting/requirePrivacyAuthorize 均为辅助接口，非必须；
 * 未注册 wx.onNeedPrivacyAuthorization 时由微信弹官方隐私窗，属合规简化实现。
 *
 * 设计约束（阶段 0 §2.6）：隐私弹窗不得阻塞首屏记账；
 * 仅在真正调用相册/摄像头等隐私能力前检查并拦截。
 */

import { supportsPrivacyApi } from './compat';
import { getSystemInfoSnapshot } from './wxPromise';

/** 缓存用户授权状态（本次启动内有效） */
let authorized = false;

/** 当前环境是否支持隐私接口 */
export function canUsePrivacyApi(): boolean {
  return supportsPrivacyApi(getSystemInfoSnapshot().sdkVersion);
}

/**
 * 在调用隐私能力（相册/摄像头）前确保已获授权。
 * - 2.32.3+：调用 wx.requirePrivacyAuthorize，用户同意返回 true；
 * - 低版本：不调用不存在的接口，弹窗说明后阻断该能力（返回 false），
 *   并引导用户阅读隐私指引。绝不阻塞首屏记账。
 */
export function ensurePrivacyForMedia(): Promise<boolean> {
  if (!canUsePrivacyApi()) {
    wx.showModal({
      title: '需要你的同意',
      content: '添加凭证需使用相册/摄像头。请先阅读并同意《隐私指引》后，升级微信至最新版本再试。',
      confirmText: '查看隐私指引',
      cancelText: '暂不',
      success: (res) => {
        if (res.confirm) wx.navigateTo({ url: '/pages/privacy/index' });
      },
    });
    return Promise.resolve(false);
  }
  if (authorized) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    // 先查授权状态：needAuthorization=false 时无需弹窗，直接放行（OBS-4 优化）
    wx.getPrivacySetting({
      success: (setting) => {
        if (!setting.needAuthorization) {
          authorized = true;
          resolve(true);
          return;
        }
        requestAuthorize(resolve);
      },
      fail: () => {
        // 查询失败不阻断能力：直接走授权流程兜底
        requestAuthorize(resolve);
      },
    });
  });
}

/** 调用官方隐私授权弹窗（未注册 onNeedPrivacyAuthorization 时使用微信官方窗） */
function requestAuthorize(resolve: (granted: boolean) => void): void {
  wx.requirePrivacyAuthorize({
    success: () => {
      authorized = true;
      resolve(true);
    },
    fail: () => resolve(false),
  });
}

/** 重置授权缓存（用户主动撤回时调用） */
export function resetPrivacyAuthorization(): void {
  authorized = false;
}
