/**
 * 预算服务单测（阶段 3）：upsert 幂等、按月隔离、进度计算、预警/超支判定。
 */

import { setStorageAdapter, STORAGE_KEYS } from '../../utils/storage';
import type { StorageAdapter } from '../../utils/storage';
import { upsertBudget, getBudget, budgetsOfMonth, computeProgress, removeBudget, WARNING_RATIO } from '../budget.service';
import type { BillRecord, Budget, Account } from '../../types';

function memoryAdapter(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}

function makeRecord(month: string, amountInCents: number, accountId = 'a1', isDeleted = false): BillRecord {
  return {
    _id: `r-${Math.random().toString(36).slice(2)}`,
    accountId,
    type: 'expense',
    amountInCents,
    note: '',
    date: `${month}-15`,
    images: [],
    isDeleted,
    createdAt: '',
    updatedAt: '',
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

const accounts: Account[] = [
  {
    _id: 'a1',
    name: '餐饮',
    type: 'expense',
    icon: '',
    color: '',
    sortOrder: 0,
    builtIn: true,
    isDeleted: false,
    createdAt: '',
    updatedAt: '',
  },
];

describe('budget.service upsert', () => {
  beforeEach(() => {
    const adapter = memoryAdapter();
    setStorageAdapter(adapter);
    adapter.setItem(STORAGE_KEYS.budgets, '[]');
  });

  it('新增预算并读回', () => {
    upsertBudget('2026-01', null, 100000);
    expect(getBudget('2026-01', null)?.amountInCents).toBe(100000);
  });

  it('同月同分类 upsert 幂等，不产生重复', () => {
    upsertBudget('2026-01', null, 100000);
    upsertBudget('2026-01', null, 200000);
    expect(budgetsOfMonth('2026-01')).toHaveLength(1);
    expect(getBudget('2026-01', null)?.amountInCents).toBe(200000);
  });

  it('按月隔离', () => {
    upsertBudget('2026-01', null, 100000);
    upsertBudget('2026-02', null, 200000);
    expect(budgetsOfMonth('2026-01')).toHaveLength(1);
    expect(budgetsOfMonth('2026-03')).toHaveLength(0);
  });

  it('L1 回归：清除预算是真删除，不留下 0 元预算', () => {
    upsertBudget('2026-01', null, 100000);
    expect(removeBudget('2026-01', null)).toBe(true);
    expect(getBudget('2026-01', null)).toBeNull();
    expect(budgetsOfMonth('2026-01')).toHaveLength(0);
    // 重复删除返回 false
    expect(removeBudget('2026-01', null)).toBe(false);
    // 不产生 ¥X/¥0.00 的荒谬进度条目
    expect(computeProgress('2026-01', [], accounts, budgetsOfMonth('2026-01'))).toHaveLength(0);
  });

  it('拒绝非法参数', () => {
    expect(() => upsertBudget('2026-1', null, 100)).toThrow();
    expect(() => upsertBudget('2026-01', null, -1)).toThrow();
    expect(() => upsertBudget('2026-01', null, 1.5)).toThrow();
  });
});

describe('computeProgress', () => {
  const month = '2026-01';

  it('总预算汇总全部分类支出，分类预算只汇总本分类', () => {
    const records = [makeRecord(month, 6000, 'a1'), makeRecord(month, 4000, 'a2')];
    const budgets: Budget[] = [
      { _id: 'b1', month, accountId: null, amountInCents: 20000, createdAt: '', updatedAt: '' },
      { _id: 'b2', month, accountId: 'a1', amountInCents: 10000, createdAt: '', updatedAt: '' },
    ];
    const progress = computeProgress(month, records, accounts, budgets);
    expect(progress.find((p) => p.accountId === null)?.spentInCents).toBe(10000);
    expect(progress.find((p) => p.accountId === 'a1')?.spentInCents).toBe(6000);
  });

  it('预警阈值 80% 与超支判定', () => {
    const budgets: Budget[] = [
      { _id: 'b1', month, accountId: null, amountInCents: 10000, createdAt: '', updatedAt: '' },
    ];
    const warn = computeProgress(month, [makeRecord(month, 8500)], accounts, budgets)[0];
    expect(WARNING_RATIO).toBe(0.8);
    expect(warn.warning).toBe(true);
    expect(warn.over).toBe(false);
    expect(warn.remainInCents).toBe(1500);

    const over = computeProgress(month, [makeRecord(month, 12000)], accounts, budgets)[0];
    expect(over.over).toBe(true);
    expect(over.warning).toBe(false);
    expect(over.remainInCents).toBe(-2000);
  });

  it('软删除记录不计入支出', () => {
    const records = [makeRecord(month, 5000, 'a1', false), makeRecord(month, 3000, 'a1', true)];
    const budgets: Budget[] = [
      { _id: 'b1', month, accountId: null, amountInCents: 10000, createdAt: '', updatedAt: '' },
    ];
    expect(computeProgress(month, records, accounts, budgets)[0].spentInCents).toBe(5000);
  });

  it('空分组：无预算返回空数组', () => {
    expect(computeProgress(month, [], accounts, [])).toHaveLength(0);
  });
});
