/**
 * 统一日志与错误提示：所有 wx API 失败都必须经过此处，不允许静默 catch。
 */

let toastVisible = false;

/** 统一错误 toast（节流：toast 显示期间不重复弹出） */
export function showErrorToast(message: string): void {
  if (toastVisible) return;
  toastVisible = true;
  try {
    wx.showToast({
      title: message.slice(0, 14),
      icon: 'none',
      duration: 2000,
      complete: () => {
        toastVisible = false;
      },
    });
  } catch (error) {
    toastVisible = false;
    console.error('[JJ] toast failed', error);
  }
}

/** 成功提示 */
export function showSuccessToast(message: string): void {
  try {
    wx.showToast({ title: message.slice(0, 14), icon: 'success', duration: 1500 });
  } catch (error) {
    console.error('[JJ] toast failed', error);
  }
}

/** 记录错误并提示用户 */
export function reportError(scope: string, error: unknown, userMessage?: string): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[JJ][${scope}]`, detail);
  showErrorToast(userMessage ?? '操作失败，请重试');
}
