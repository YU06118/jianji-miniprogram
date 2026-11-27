/**
 * 预算服务层（阶段 3）：月度总预算（accountId=null）与分类预算的 upsert、查询、进度计算。
 * 预算按月覆盖，不设软删除（阶段 0 §6.1）。纯逻辑 + 存储注入，单测在 Node 覆盖。
 */

import type { Account, BillRecord, Budget } from '../types';
import { monthOfDate } from '../utils/date';
import { loadBudgets, saveBudgets } from '../utils/storage';
import { createId } from '../utils/id';

/** 预警阈值：支出达到预算 80% 进入预警色 */
export const WARNING_RATIO = 0.8;

/** upsert 单条预算（month + accountId 唯一） */
export function upsertBudget(month: string, accountId: string | null, amountInCents: number): Budget {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月份格式非法');
  if (!Number.isSafeInteger(amountInCents) || amountInCents < 0) {
    throw new Error('预算金额必须为非负整数分');
  }
  const all = loadBudgets();
  const idx = all.findIndex((b) => b.month === month && b.accountId === accountId);
  const now = new Date().toISOString();
  if (idx >= 0) {
    all[idx] = { ...all[idx], amountInCents, updatedAt: now };
    saveBudgets(all);
    return all[idx];
  }
  const budget: Budget = {
    _id: createId('bud'),
    month,
    accountId,
    amountInCents,
    createdAt: now,
    updatedAt: now,
  };
  saveBudgets([...all, budget]);
  return budget;
}

/**
 * 删除某月某条预算（清除预算用）。
 * 不能用 upsertBudget(...,0) 代替：那会留下 budgetInCents=0 的记录，
 * 统计页算出 ¥X/¥0.00 的荒谬进度条（阶段 5 检查 L1）。
 */
export function removeBudget(month: string, accountId: string | null): boolean {
  const all = loadBudgets();
  const next = all.filter((b) => !(b.month === month && b.accountId === accountId));
  if (next.length === all.length) return false;
  saveBudgets(next);
  return true;
}

/** 查询某月全部预算 */
export function budgetsOfMonth(month: string): Budget[] {
  return loadBudgets().filter((b) => b.month === month);
}

/** 查询单条预算（不存在返回 null） */
export function getBudget(month: string, accountId: string | null): Budget | null {
  return loadBudgets().find((b) => b.month === month && b.accountId === accountId) ?? null;
}

/** 预算进度条目（视图层不含 wx，金额在调用方格式化） */
export interface BudgetProgress {
  accountId: string | null;
  name: string;
  color: string;
  budgetInCents: number;
  spentInCents: number;
  remainInCents: number;
  /** 0~1，可 >1（超支） */
  ratio: number;
  /** 是否预警（≥80%） */
  warning: boolean;
  /** 是否超支 */
  over: boolean;
}

/**
 * 计算预算进度：按预算记录聚合当月支出。
 * - 总预算(accountId=null)汇总全部分类支出；
 * - 分类预算仅汇总对应 accountId 的支出；
 * - 无预算记录的分类不进入结果（避免出现 0/0 的无意义条目）。
 */
export function computeProgress(
  month: string,
  records: BillRecord[],
  accounts: Account[],
  budgets: Budget[],
): BudgetProgress[] {
  const monthBudgets = budgets.filter((b) => b.month === month);
  const spent = records.filter((r) => !r.isDeleted && r.type === 'expense' && monthOfDate(r.date) === month);
  const accountMap = new Map(accounts.filter((a) => !a.isDeleted).map((a) => [a._id, a]));
  const totalSpent = spent.reduce((sum, r) => sum + r.amountInCents, 0);

  return monthBudgets.map((b) => {
    const isTotal = b.accountId === null;
    const spentInCents = isTotal
      ? totalSpent
      : spent.filter((r) => r.accountId === b.accountId).reduce((sum, r) => sum + r.amountInCents, 0);
    const ratio = b.amountInCents > 0 ? spentInCents / b.amountInCents : 0;
    const acc = b.accountId ? accountMap.get(b.accountId) : undefined;
    return {
      accountId: b.accountId,
      name: isTotal ? '本月总预算' : (acc?.name ?? '已删除分类'),
      color: isTotal ? '' : (acc?.color ?? ''),
      budgetInCents: b.amountInCents,
      spentInCents,
      remainInCents: b.amountInCents - spentInCents,
      ratio,
      warning: ratio >= WARNING_RATIO && ratio < 1,
      over: ratio >= 1,
    };
  });
}
