/**
 * 防御式 requestAnimationFrame（阶段 5 统一，第二轮 F 扩展取消能力）
 * 小程序类型包未声明 DOM 全局，且各端 rAF 可用性证据不一；
 * 运行时检测，缺失时回退 setTimeout(16ms)，规避 ReferenceError。
 * raf 返回句柄、cancelRaf 取消——供动画链在页面隐藏/组件卸载时停止。
 */

declare const requestAnimationFrame: ((callback: () => void) => number) | undefined;
declare const cancelAnimationFrame: ((id: number) => void) | undefined;

export const raf: (callback: () => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (callback) => requestAnimationFrame(callback)
    : (callback) => setTimeout(callback, 16) as unknown as number;

export const cancelRaf: (id: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? (id) => {
        cancelAnimationFrame(id);
      }
    : (id) => {
        clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
      };
