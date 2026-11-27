/**
 * JSON 导入校验：导入前做结构校验，失败整体回滚（阶段 0 §5.1/§3.6）。
 * 纯函数，可在 Node 单测覆盖。
 */

import type { Account, BillRecord, Budget } from '../types';
import { isValidDate } from '../utils/date';

/** 导入文件结构 */
export interface ImportPayload {
  schemaVersion?: number;
  accounts?: Account[];
  records?: BillRecord[];
  budgets?: Budget[];
}

export interface ImportValidateResult {
  valid: boolean;
  errors: string[];
  accounts: Account[];
  records: BillRecord[];
  budgets: Budget[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 校验导入数据。任何一条错误都会标记 valid=false，调用方据此整体回滚（不写入任何数据）。
 */
export function validateImport(input: unknown): ImportValidateResult {
  const errors: string[] = [];
  const empty: ImportValidateResult = {
    valid: false,
    errors,
    accounts: [],
    records: [],
    budgets: [],
  };
  if (!isRecord(input)) {
    errors.push('根节点必须是对象');
    return empty;
  }
  const payload = input as ImportPayload;
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const records = Array.isArray(payload.records) ? payload.records : [];
  const budgets = Array.isArray(payload.budgets) ? payload.budgets : [];
  if (!Array.isArray(payload.accounts)) errors.push('accounts 必须是数组');
  if (!Array.isArray(payload.records)) errors.push('records 必须是数组');
  if (!Array.isArray(payload.budgets)) errors.push('budgets 必须是数组');

  const seenIds = new Set<string>();
  accounts.forEach((a, i) => {
    if (!a || typeof a._id !== 'string' || a._id === '') errors.push(`accounts[${i}] 缺少 _id`);
    if (a && typeof a.name !== 'string') errors.push(`accounts[${i}].name 非法`);
    if (a && a.type !== 'income' && a.type !== 'expense') errors.push(`accounts[${i}].type 非法`);
    if (a) {
      if (seenIds.has(a._id)) errors.push(`accounts[${i}] 存在重复 _id`);
      seenIds.add(a._id);
    }
  });

  const recordIds = new Set<string>();
  records.forEach((r, i) => {
    if (!r || typeof r._id !== 'string' || r._id === '') errors.push(`records[${i}] 缺少 _id`);
    if (r && r.type !== 'income' && r.type !== 'expense') errors.push(`records[${i}].type 非法`);
    if (r && !Number.isSafeInteger(r.amountInCents)) errors.push(`records[${i}].amountInCents 非法`);
    if (r && typeof r.date !== 'string') errors.push(`records[${i}].date 非法`);
    else if (r && !isValidDate(r.date)) errors.push(`records[${i}].date 不是合法日期`);
    if (r && !Array.isArray(r.images)) errors.push(`records[${i}].images 非法`);
    if (r) {
      if (recordIds.has(r._id)) errors.push(`records[${i}] 存在重复 _id`);
      recordIds.add(r._id);
    }
  });

  budgets.forEach((b, i) => {
    if (!b || typeof b.month !== 'string' || !/^\d{4}-\d{2}$/.test(b.month)) {
      errors.push(`budgets[${i}].month 非法`);
    }
    if (b && !Number.isSafeInteger(b.amountInCents)) errors.push(`budgets[${i}].amountInCents 非法`);
  });

  return {
    valid: errors.length === 0,
    errors,
    accounts,
    records,
    budgets,
  };
}

/** 导出数据结构 */
export function buildExportPayload(
  accounts: Account[],
  records: BillRecord[],
  budgets: Budget[],
  schemaVersion: number,
): ImportPayload {
  return { schemaVersion, accounts, records, budgets };
}
