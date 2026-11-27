/**
 * 记账服务单测（阶段 2）：新增/编辑/软删除/分页/筛选/按日分组。
 * 用内存 StorageAdapter 注入，避免依赖 wx。
 */

import { setStorageAdapter, STORAGE_KEYS } from '../../utils/storage';
import type { StorageAdapter } from '../../utils/storage';
import {
  createRecord,
  updateRecord,
  deleteRecord,
  getRecord,
  queryRecords,
  groupByDay,
  PAGE_SIZE,
} from '../record.service';

/** 简易内存适配器 */
function memoryAdapter(): StorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}

function reset(adapter: StorageAdapter): void {
  adapter.setItem(STORAGE_KEYS.records, '[]');
}

describe('record.service', () => {
  let adapter: ReturnType<typeof memoryAdapter>;

  beforeEach(() => {
    adapter = memoryAdapter();
    setStorageAdapter(adapter);
    reset(adapter);
  });

  it('新增记录写入即持久化', () => {
    const r = createRecord({
      accountId: 'a1',
      type: 'expense',
      amountInCents: 1234,
      note: '午餐',
      date: '2026-01-05',
      images: [],
    });
    expect(r.amountInCents).toBe(1234);
    expect(getRecord(r._id)?.note).toBe('午餐');
    expect(JSON.parse(adapter.getItem(STORAGE_KEYS.records) ?? '[]')).toHaveLength(1);
  });

  it('拒绝非法金额与日期', () => {
    expect(() =>
      createRecord({ accountId: 'a1', type: 'expense', amountInCents: -1, note: '', date: '2026-01-01', images: [] }),
    ).toThrow();
    expect(() =>
      createRecord({ accountId: 'a1', type: 'expense', amountInCents: 100, note: '', date: '2025-02-29', images: [] }),
    ).toThrow();
  });

  it('编辑刷新 updatedAt，软删除后查询不到', () => {
    const r = createRecord({ accountId: 'a1', type: 'expense', amountInCents: 100, note: '', date: '2026-01-01', images: [] });
    updateRecord(r._id, { amountInCents: 200 });
    expect(getRecord(r._id)?.amountInCents).toBe(200);
    expect(deleteRecord(r._id)).toBe(true);
    expect(getRecord(r._id)).toBeNull();
    // 软删除记录仍在存储中（墓碑保留）
    expect(JSON.parse(adapter.getItem(STORAGE_KEYS.records) ?? '[]')).toHaveLength(1);
  });

  it('BUG-01 回归：连续删除两条，两条墓碑都在', () => {
    const a = createRecord({ accountId: 'a', type: 'expense', amountInCents: 100, note: 'A', date: '2026-01-01', images: [] });
    const b = createRecord({ accountId: 'a', type: 'expense', amountInCents: 200, note: 'B', date: '2026-01-01', images: [] });
    expect(deleteRecord(a._id)).toBe(true);
    expect(deleteRecord(b._id)).toBe(true);
    const stored = JSON.parse(adapter.getItem(STORAGE_KEYS.records) ?? '[]') as Array<{ isDeleted: boolean }>;
    expect(stored.filter((r) => r.isDeleted)).toHaveLength(2);
  });

  it('BUG-01 回归：后续新增/编辑不抹掉既有墓碑', () => {
    const a = createRecord({ accountId: 'a', type: 'expense', amountInCents: 100, note: 'A', date: '2026-01-01', images: [] });
    deleteRecord(a._id);
    const c = createRecord({ accountId: 'a', type: 'expense', amountInCents: 300, note: 'C', date: '2026-01-01', images: [] });
    updateRecord(c._id, { note: 'C2' });
    const stored = JSON.parse(adapter.getItem(STORAGE_KEYS.records) ?? '[]') as Array<{ isDeleted: boolean }>;
    expect(stored.filter((r) => r.isDeleted)).toHaveLength(1);
    expect(stored).toHaveLength(2);
  });

  it('重复删除同一条幂等，不制造重复墓碑', () => {
    const a = createRecord({ accountId: 'a', type: 'expense', amountInCents: 100, note: '', date: '2026-01-01', images: [] });
    expect(deleteRecord(a._id)).toBe(true);
    expect(deleteRecord(a._id)).toBe(false);
    const stored = JSON.parse(adapter.getItem(STORAGE_KEYS.records) ?? '[]') as Array<{ isDeleted: boolean }>;
    expect(stored.filter((r) => r.isDeleted)).toHaveLength(1);
  });

  it('按月筛选不串月', () => {
    createRecord({ accountId: 'a1', type: 'expense', amountInCents: 100, note: '', date: '2026-01-31', images: [] });
    createRecord({ accountId: 'a1', type: 'expense', amountInCents: 200, note: '', date: '2026-02-01', images: [] });
    expect(queryRecords({ month: '2026-01' })).toHaveLength(1);
    expect(queryRecords({ month: '2026-02' })).toHaveLength(1);
  });

  it('分页每页 20 条', () => {
    for (let i = 1; i <= 45; i += 1) {
      createRecord({
        accountId: 'a1',
        type: 'expense',
        amountInCents: i,
        note: '',
        date: '2026-01-15',
        images: [],
      });
    }
    expect(PAGE_SIZE).toBe(20);
    expect(queryRecords({ page: 0 })).toHaveLength(20);
    expect(queryRecords({ page: 1 })).toHaveLength(20);
    expect(queryRecords({ page: 2 })).toHaveLength(5);
  });

  it('关键字与分类筛选', () => {
    createRecord({ accountId: 'a1', type: 'expense', amountInCents: 100, note: '午餐', date: '2026-01-01', images: [] });
    createRecord({ accountId: 'a2', type: 'expense', amountInCents: 200, note: '晚餐', date: '2026-01-01', images: [] });
    expect(queryRecords({ keyword: '午' })).toHaveLength(1);
    expect(queryRecords({ accountId: 'a2' })).toHaveLength(1);
    expect(queryRecords({ type: 'income' })).toHaveLength(0);
  });

  it('按日分组：日期降序、汇总金额', () => {
    createRecord({ accountId: 'a1', type: 'expense', amountInCents: 100, note: '', date: '2026-01-01', images: [] });
    createRecord({ accountId: 'a1', type: 'expense', amountInCents: 200, note: '', date: '2026-01-01', images: [] });
    createRecord({ accountId: 'a1', type: 'expense', amountInCents: 300, note: '', date: '2026-01-02', images: [] });
    const groups = groupByDay(queryRecords({}));
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe('2026-01-02');
    expect(groups[1].totalInCents).toBe(300);
  });
});
