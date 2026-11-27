/**
 * 云同步合并单测（阶段 4）：后写为准、墓碑不复活、时间相等本地优先、去重。
 */

import { getUpdatedMs, mergeByUpdatedAt, pendingUploads } from '../sync-merge.service';
import type { Syncable } from '../sync-merge.service';

interface Item extends Syncable {
  _id: string;
  note: string;
  updatedAtMs?: number;
  isDeleted?: boolean;
}

describe('getUpdatedMs', () => {
  it('优先用 updatedAtMs', () => {
    expect(getUpdatedMs({ _id: 'a', updatedAtMs: 100, updatedAt: '2020-01-01T00:00:00.000Z' })).toBe(100);
  });

  it('回退解析 ISO 字符串', () => {
    expect(getUpdatedMs({ _id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' })).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('无时间字段返回 0', () => {
    expect(getUpdatedMs({ _id: 'a' })).toBe(0);
  });
});

describe('mergeByUpdatedAt', () => {
  it('远端更新时取远端', () => {
    const local: Item[] = [{ _id: 'a', note: 'local', updatedAtMs: 100 }];
    const remote: Item[] = [{ _id: 'a', note: 'remote', updatedAtMs: 200 }];
    const result = mergeByUpdatedAt(local, remote);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].note).toBe('remote');
    expect(result.remoteWins).toBe(1);
  });

  it('本地更新时取本地', () => {
    const local: Item[] = [{ _id: 'a', note: 'local', updatedAtMs: 300 }];
    const remote: Item[] = [{ _id: 'a', note: 'remote', updatedAtMs: 200 }];
    const result = mergeByUpdatedAt(local, remote);
    expect(result.merged[0].note).toBe('local');
    expect(result.localWins).toBe(1);
  });

  it('时间相等本地优先（离线写入不被覆盖）', () => {
    const local: Item[] = [{ _id: 'a', note: 'local', updatedAtMs: 200 }];
    const remote: Item[] = [{ _id: 'a', note: 'remote', updatedAtMs: 200 }];
    expect(mergeByUpdatedAt(local, remote).merged[0].note).toBe('local');
  });

  it('较新的墓碑胜出，防止已删记录复活', () => {
    const local: Item[] = [{ _id: 'a', note: 'deleted', updatedAtMs: 500, isDeleted: true }];
    const remote: Item[] = [{ _id: 'a', note: 'active', updatedAtMs: 100 }];
    const result = mergeByUpdatedAt(local, remote);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].isDeleted).toBe(true);
  });

  it('较旧的墓碑败给较新的远端活跃记录', () => {
    const local: Item[] = [{ _id: 'a', note: 'old-deleted', updatedAtMs: 100, isDeleted: true }];
    const remote: Item[] = [{ _id: 'a', note: 'new-active', updatedAtMs: 900 }];
    expect(mergeByUpdatedAt(local, remote).merged[0].isDeleted).toBeUndefined();
  });

  it('合并不产生重复 _id', () => {
    const local: Item[] = [
      { _id: 'a', note: 'l1', updatedAtMs: 100 },
      { _id: 'b', note: 'l2', updatedAtMs: 200 },
    ];
    const remote: Item[] = [
      { _id: 'a', note: 'r1', updatedAtMs: 50 },
      { _id: 'c', note: 'r2', updatedAtMs: 300 },
    ];
    const result = mergeByUpdatedAt(local, remote);
    expect(result.merged).toHaveLength(3);
    expect(new Set(result.merged.map((i) => i._id)).size).toBe(3);
  });
});

describe('pendingUploads', () => {
  it('L2 决策：时间相等也必须上传，否则本地优先语义失效', () => {
    const local: Item[] = [{ _id: 'a', note: '本地新版本', updatedAtMs: 500 }];
    const remote: Item[] = [{ _id: 'a', note: '远端旧版本', updatedAtMs: 500 }];
    // 若改成 >，云端永远拿不到本地版本，probe 再取时时间仍相等，循环无解
    expect(pendingUploads(local, remote)).toHaveLength(1);
    expect(pendingUploads(local, remote)[0].note).toBe('本地新版本');
  });

  it('只上传本地新增或更新的记录（含墓碑）', () => {
    const local: Item[] = [
      { _id: 'a', note: 'newer', updatedAtMs: 200 },
      { _id: 'b', note: 'older', updatedAtMs: 50 },
      { _id: 'c', note: 'only-local', updatedAtMs: 100 },
      { _id: 'd', note: 'deleted', updatedAtMs: 300, isDeleted: true },
    ];
    const remote: Item[] = [
      { _id: 'a', note: 'old', updatedAtMs: 100 },
      { _id: 'b', note: 'new', updatedAtMs: 150 },
    ];
    const pending = pendingUploads(local, remote);
    expect(pending.map((i) => i._id)).toEqual(['a', 'c', 'd']);
  });
});
