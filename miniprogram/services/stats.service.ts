/**
 * 统计聚合：纯逻辑层，输入记录数组输出汇总，不含任何 wx API。
 * 单测在 Node 环境覆盖（阶段 0 §3.6 / §8.4）。
 */

import type { Account, BillRecord, CategoryRatio, MonthSummary } from '../types';
import { monthOfDate } from '../utils/date';
import { ratioOf, sumCents } from '../utils/money';
import { TOKEN_ACCENT } from '../utils/tokens';

/** 过滤掉软删除记录 */
export function activeRecords(records: BillRecord[]): BillRecord[] {
  return records.filter((r) => !r.isDeleted);
}

/** 按月份筛选记录 */
export function recordsOfMonth(records: BillRecord[], month: string): BillRecord[] {
  return activeRecords(records).filter((r) => monthOfDate(r.date) === month);
}

/** 单月收支总览 */
export function summarizeMonth(records: BillRecord[], month: string): MonthSummary {
  const list = recordsOfMonth(records, month);
  const incomeInCents = sumCents(list.filter((r) => r.type === 'income').map((r) => r.amountInCents));
  const expenseInCents = sumCents(list.filter((r) => r.type === 'expense').map((r) => r.amountInCents));
  return {
    month,
    incomeInCents,
    expenseInCents,
    balanceInCents: incomeInCents - expenseInCents,
  };
}

/** 分类占比（按支出聚合，降序） */
export function categoryRatios(
  records: BillRecord[],
  accounts: Account[],
  month: string,
  type: 'income' | 'expense' = 'expense',
): CategoryRatio[] {
  const list = recordsOfMonth(records, month).filter((r) => r.type === type);
  const total = sumCents(list.map((r) => r.amountInCents));
  const accountMap = new Map<string, Account>();
  accounts.filter((a) => !a.isDeleted).forEach((a) => accountMap.set(a._id, a));
  const byAccount = new Map<string, number>();
  list.forEach((r) => {
    byAccount.set(r.accountId, (byAccount.get(r.accountId) ?? 0) + r.amountInCents);
  });
  return Array.from(byAccount.entries())
    .map(([accountId, amountInCents]) => {
      const acc = accountMap.get(accountId);
      return {
        accountId,
        name: acc?.name ?? '未分类',
        color: acc?.color ?? TOKEN_ACCENT,
        amountInCents,
        ratio: ratioOf(amountInCents, total),
      };
    })
    .sort((a, b) => b.amountInCents - a.amountInCents);
}

/** 近 N 个月趋势（含空月补 0） */
export function monthlyTrend(
  records: BillRecord[],
  endMonth: string,
  months: number,
): MonthSummary[] {
  const result: MonthSummary[] = [];
  const [y, m] = endMonth.split('-').map(Number);
  for (let i = months - 1; i >= 0; i -= 1) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = ((total % 12) + 12) % 12;
    const month = `${String(yy).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}`;
    result.push(summarizeMonth(records, month));
  }
  return result;
}
