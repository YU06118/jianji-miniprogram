/**
 * 云同步合并策略（阶段 4）：后写为准（updatedAt）+ 软删除墓碑同步。
 * 纯函数，不依赖 wx/cloud，单测覆盖。
 *
 * 规则（阶段 0 §2.5 / §6.2）：
 * - 按 _id 合并，取 updatedAt 较大者；
 * - 墓碑（isDeleted=true）同样参与比较，较新的墓碑胜出，防止已删记录复活；
 * - 时间相同以「本地优先」为准，保证离线写入不被远端覆盖；
 * - 合并不产生重复记录（同 _id 唯一）。
 *
 * 时间字段差异：BillRecord 有 updatedAtMs（number），Account/Budget 只有 ISO 字符串；
 * 统一用 getUpdatedMs 提取器，避免强制类型假设。
 */

export interface Syncable {
  _id: string;
  isDeleted?: boolean;
  updatedAt?: string;
  updatedAtMs?: number;
}

/** 从实体提取更新时间毫秒（优先双字段的 ms，回退 ISO 解析） */
export function getUpdatedMs(item: Syncable): number {
  if (typeof item.updatedAtMs === 'number' && Number.isFinite(item.updatedAtMs)) return item.updatedAtMs;
  if (typeof item.updatedAt === 'string') {
    const parsed = Date.parse(item.updatedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export interface MergeResult<T extends Syncable> {
  merged: T[];
  localWins: number;
  remoteWins: number;
}

/** 合并本地与远端同类型记录，返回去重后的全量（含墓碑） */
export function mergeByUpdatedAt<T extends Syncable>(local: T[], remote: T[]): MergeResult<T> {
  const map = new Map<string, T>();
  let localWins = 0;
  let remoteWins = 0;

  remote.forEach((r) => map.set(r._id, r));
  local.forEach((l) => {
    const existing = map.get(l._id);
    if (!existing) {
      map.set(l._id, l);
      localWins += 1;
      return;
    }
    const lt = getUpdatedMs(l);
    const rt = getUpdatedMs(existing);
    if (lt >= rt) {
      // 时间相同或本地更新：本地优先，保证离线写入不被覆盖
      map.set(l._id, l);
      localWins += 1;
    } else {
      remoteWins += 1;
    }
  });

  return { merged: Array.from(map.values()), localWins, remoteWins };
}

/**
 * 计算需要上传到云端的记录（本地相对远端有新写入）。
 * 用于增量同步，避免全量覆盖。
 */
export function pendingUploads<T extends Syncable>(local: T[], remote: T[]): T[] {
  const remoteMap = new Map(remote.map((r) => [r._id, r]));
  return local.filter((l) => {
    const r = remoteMap.get(l._id);
    // 用 >= 而非 >：时间相等但内容不同时，必须把本地版本推到云端，
    // 否则 probe 拿到的远端时间仍相等，本地版本永远无法同步，"本地优先"语义失效。
    // 代价是极罕见的时间相等场景会多传一次，正确性优先。
    return !r || getUpdatedMs(l) >= getUpdatedMs(r);
  });
}
