/**
 * wx 异步 API 统一 Promise 封装：失败走统一 toast，不允许静默 catch。
 * 只封装阶段 1 会用到的能力；后续阶段按需在此扩展。
 */

/**
 * 通用 promisify：把 callback 风格的 wx API 转为 Promise。
 * 约定 wx API 的 success/fail 回调签名。
 */
export function promisify<T>(
  api: (options: {
    success: (res: T) => void;
    fail: (err: { errMsg?: string }) => void;
  }) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    api({
      success: (res: T) => resolve(res),
      fail: (err: { errMsg?: string }) => reject(new Error(err.errMsg ?? 'wx api failed')),
    });
  });
}

/** 封装 wx.getStorage / setStorage 的 Promise 形式（带统一错误上报入口由调用方负责） */
export function getStorage<T>(key: string): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    wx.getStorage({
      key,
      success: (res) => resolve(res.data as T),
      fail: () => resolve(null), // key 不存在属正常情况，不视为错误
    });
  });
}

export function setStorage<T>(key: string, value: T): Promise<void> {
  return promisify<void>((options) =>
    wx.setStorage({
      key,
      data: value,
      success: () => options.success(undefined as void),
      fail: options.fail,
    }),
  );
}

export interface SystemInfoSnapshot {
  platform: string;
  sdkVersion: string;
  statusBarHeight: number;
}

/**
 * 获取系统信息：优先使用拆分后的新 API（2.20.1+），低版本回退 getSystemInfoSync。
 * 对应阶段 0 C4/C6 的修正。
 */
export function getSystemInfoSnapshot(): SystemInfoSnapshot {
  const base = wx.getAppBaseInfo ? wx.getAppBaseInfo() : undefined;
  const device = wx.getDeviceInfo ? wx.getDeviceInfo() : undefined;
  const window = wx.getWindowInfo ? wx.getWindowInfo() : undefined;
  if (base && device && window) {
    return {
      platform: device.platform,
      sdkVersion: base.SDKVersion,
      statusBarHeight: window.statusBarHeight ?? 0,
    };
  }
  // 低版本兜底（未确认 API 存在性时先判空）
  const legacy = wx.getSystemInfoSync ? wx.getSystemInfoSync() : undefined;
  return {
    platform: legacy?.platform ?? 'unknown',
    sdkVersion: legacy?.SDKVersion ?? '0.0.0',
    statusBarHeight: legacy?.statusBarHeight ?? 0,
  };
}
