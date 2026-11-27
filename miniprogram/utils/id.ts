/**
 * ID 生成：本地记录 _id。保证单机内唯一、可读、无外部依赖。
 */

let lastMs = 0;
let sequence = 0;

/**
 * 生成形如 "r-<毫秒36进制>-<序号36进制>-<随机4位>" 的 ID。
 * 时间戳与递增序号组合，避免同一毫秒内碰撞。
 */
export function createId(prefix = 'r'): string {
  const now = Date.now();
  if (now === lastMs) {
    sequence += 1;
  } else {
    lastMs = now;
    sequence = 0;
  }
  const rand = Math.floor(Math.random() * 0x10000)
    .toString(36)
    .padStart(4, '0');
  return `${prefix}-${now.toString(36)}-${sequence.toString(36)}-${rand}`;
}
