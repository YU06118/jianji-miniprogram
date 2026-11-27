/**
 * 统计聚合单测（阶段 0 §3.6）：按月归集、软删除过滤、分类占比、空月补零。
 */

import type { Account, BillRecord } from '../../types';
import {
  categoryRatios,
  monthlyTrend,
  recordsOfMonth,
  summarizeMonth,
} from '../stats.service';

function makeRecord(overrides: Partial<BillRecord> & { date: string; amountInCents: number }): BillRecord {
  return {
    _id: Math.random().toString(36).slice(2),
    accountId: 'acc-food',
    type: 'expense',
    note: '',
    images: [],
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAtMs: 0,
    updatedAtMs: 0,
    ...overrides,
  };
}

const records: BillRecord[] = [
  makeRecord({ date: '2026-01-05', amountInCents: 1200 }),
  makeRecord({ date: '2026-01-31', amountInCents: 800, accountId: 'acc-transport' }),
  makeRecord({ date: '2026-01-10', amountInCents: 50000, type: 'income' }),
  makeRecord({ date: '2026-02-01', amountInCents: 300 }),
  makeRecord({ date: '2026-01-20', amountInCents: 999, isDeleted: true }),
];

const accounts: Account[] = [
  {
    _id: 'acc-food',
    name: '餐饮',
    type: 'expense',
    icon: '🍚',
    color: '#8B7BE8',
    sortOrder: 0,
    builtIn: true,
    isDeleted: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    _id: 'acc-transport',
    name: '交通',
    type: 'expense',
    icon: '🚌',
    color: '#5E4FB5',
    sortOrder: 1,
    builtIn: true,
    isDeleted: false,
    createdAt: '',
    updatedAt: '',
  },
];

describe('recordsOfMonth', () => {
  it('按月份过滤且不串月', () => {
    expect(recordsOfMonth(records, '2026-01')).toHaveLength(3);
    expect(recordsOfMonth(records, '2026-02')).toHaveLength(1);
    expect(recordsOfMonth(records, '2026-03')).toHaveLength(0);
  });

  it('过滤软删除记录', () => {
    expect(recordsOfMonth(records, '2026-01').some((r) => r.isDeleted)).toBe(false);
  });
});

describe('summarizeMonth', () => {
  it('收支汇总与结余（整数分）', () => {
    const summary = summarizeMonth(records, '2026-01');
    expect(summary.incomeInCents).toBe(50000);
    expect(summary.expenseInCents).toBe(2000);
    expect(summary.balanceInCents).toBe(48000);
  });

  it('空月返回全 0', () => {
    const summary = summarizeMonth(records, '2026-03');
    expect(summary.incomeInCents).toBe(0);
    expect(summary.expenseInCents).toBe(0);
    expect(summary.balanceInCents).toBe(0);
  });
});

describe('categoryRatios', () => {
  it('按金额降序且占比为 0~1', () => {
    const ratios = categoryRatios(records, accounts, '2026-01');
    expect(ratios[0].accountId).toBe('acc-food');
    expect(ratios[0].ratio).toBeCloseTo(0.6);
    expect(ratios[1].ratio).toBeCloseTo(0.4);
    expect(ratios.reduce((s, r) => s + r.ratio, 0)).toBeCloseTo(1);
  });

  it('未知分类回退为「未分类」', () => {
    const withUnknown = [...records, makeRecord({ date: '2026-01-11', amountInCents: 100, accountId: 'unknown' })];
    const ratios = categoryRatios(withUnknown, accounts, '2026-01');
    expect(ratios.some((r) => r.name === '未分类')).toBe(true);
  });
});

describe('monthlyTrend', () => {
  it('近 6 个月含空月补零', () => {
    const trend = monthlyTrend(records, '2026-03', 6);
    expect(trend).toHaveLength(6);
    expect(trend[0].month).toBe('2025-10');
    expect(trend[5].month).toBe('2026-03');
    expect(trend[5].expenseInCents).toBe(0);
  });
});
