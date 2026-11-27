/**
 * 记账服务层（阶段 2）：新增/编辑/删除、按日分组、按月分页、筛选。
 * 软删除 + 写入即持久化（本地 Storage 为唯一真源）。
 */

import type { BillRecord, RecordType } from '../types';
import { isValidDate, monthOfDate, nowISOWithMs } from '../utils/date';
import { createId } from '../utils/id';
import { loadRecords, readAllRecords, saveRecords } from '../utils/storage';

/** 分页大小（阶段 0 §5.1：每页 20 条） */
export const PAGE_SIZE = 20;

export interface CreateRecordInput {
  accountId: string;
  type: RecordType;
  amountInCents: number;
  note: string;
  date: string;
  images: string[];
}

/** 新增记录（返回新记录，写入即持久化） */
export function createRecord(input: CreateRecordInput): BillRecord {
  if (!Number.isSafeInteger(input.amountInCents) || input.amountInCents < 0) {
    throw new Error('金额必须为非负整数分');
  }
  if (!isValidDate(input.date)) {
    throw new Error('日期非法');
  }
  const now = nowISOWithMs();
  const record: BillRecord = {
    _id: createId('rec'),
    accountId: input.accountId,
    type: input.type,
    amountInCents: input.amountInCents,
    note: input.note,
    date: input.date,
    images: input.images,
    isDeleted: false,
    createdAt: now.iso,
    updatedAt: now.iso,
    createdAtMs: now.ms,
    updatedAtMs: now.ms,
  };
  const all = readAllRecords(); // 基于全量写入，保留既有墓碑
  saveRecords([record, ...all]);
  return record;
}

/** 编辑记录（软更新，刷新 updatedAt 双字段） */
export function updateRecord(id: string, patch: Partial<CreateRecordInput>): BillRecord | null {
  const all = readAllRecords(); // 基于全量写入，保留既有墓碑
  const idx = all.findIndex((r) => r._id === id);
  if (idx < 0 || all[idx].isDeleted) return null; // 墓碑不可编辑
  if (patch.date !== undefined && !isValidDate(patch.date)) {
    throw new Error('日期非法');
  }
  if (patch.amountInCents !== undefined && !Number.isSafeInteger(patch.amountInCents)) {
    throw new Error('金额必须为整数分');
  }
  const now = nowISOWithMs();
  const updated: BillRecord = {
    ...all[idx],
    ...patch,
    updatedAt: now.iso,
    updatedAtMs: now.ms,
  };
  all[idx] = updated;
  saveRecords(all);
  return updated;
}

/** 软删除记录（isDeleted + updatedAt，统计与预算实时重算由服务层查询保证） */
export function deleteRecord(id: string): boolean {
  const all = readAllRecords(); // 基于全量写入，保留此前所有墓碑
  const idx = all.findIndex((r) => r._id === id);
  if (idx < 0 || all[idx].isDeleted) return false; // 幂等：已删记录不重复制造墓碑
  const now = nowISOWithMs();
  all[idx] = { ...all[idx], isDeleted: true, updatedAt: now.iso, updatedAtMs: now.ms };
  saveRecords(all);
  return true;
}

/** 查询单条（不含软删除） */
export function getRecord(id: string): BillRecord | null {
  return loadRecords().find((r) => r._id === id) ?? null;
}

/** 按日分组数据结构 */
export interface DayGroup {
  date: string;
  records: BillRecord[];
  totalInCents: number;
}

export interface QueryOptions {
  month?: string;
  keyword?: string;
  accountId?: string;
  type?: RecordType;
  page?: number;
  pageSize?: number;
}

/** 查询并筛选（按月/关键字/分类/类型），按日期降序、同日按创建时间降序 */
export function queryRecords(options: QueryOptions = {}): BillRecord[] {
  let list = loadRecords();
  if (options.month) list = list.filter((r) => monthOfDate(r.date) === options.month);
  if (options.type) list = list.filter((r) => r.type === options.type);
  if (options.accountId) list = list.filter((r) => r.accountId === options.accountId);
  if (options.keyword) {
    const kw = options.keyword.trim().toLowerCase();
    list = list.filter((r) => r.note.toLowerCase().includes(kw));
  }
  list.sort((a, b) => {
    if (a.date !== b.date) return a.date > b.date ? -1 : 1;
    return b.createdAtMs - a.createdAtMs;
  });
  const page = options.page ?? 0;
  const size = options.pageSize ?? PAGE_SIZE;
  return list.slice(page * size, (page + 1) * size);
}

/** 按日分组（供首页列表吸顶分组渲染） */
export function groupByDay(records: BillRecord[]): DayGroup[] {
  const map = new Map<string, BillRecord[]>();
  records.forEach((r) => {
    const bucket = map.get(r.date) ?? [];
    bucket.push(r);
    map.set(r.date, bucket);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .map(([date, list]) => ({
      date,
      records: list,
      totalInCents: list.reduce((sum, r) => sum + r.amountInCents, 0),
    }));
}
