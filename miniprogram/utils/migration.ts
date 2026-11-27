/**
 * 存储结构幂等迁移（阶段 0 §6.2）。
 * 纯函数：输入老数据对象，输出升级后的对象；可重复执行不产生副作用、不丢字段。
 * 单测在 Node 环境直接覆盖，不依赖 wx。
 */

import type { Account, BillRecord, Budget, SchemaMeta } from '../types';
import { TOKEN_ACCENT } from './tokens';

/** 当前 schema 版本 */
export const CURRENT_SCHEMA_VERSION = 1;

/** 可迁移的存储数据集合 */
export interface MigrationPayload {
  schemaVersion?: number;
  accounts?: Partial<Account>[];
  records?: Partial<BillRecord>[];
  budgets?: Partial<Budget>[];
  [key: string]: unknown;
}

/** 补字段用的默认账号 */
function normalizeAccount(input: Partial<Account>): Account {
  const now = new Date().toISOString();
  return {
    ...input,
    _id: input._id ?? '',
    name: input.name ?? '未分类',
    type: input.type === 'income' ? 'income' : 'expense',
    icon: input.icon ?? 'circle',
    color: input.color ?? TOKEN_ACCENT,
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
    builtIn: input.builtIn === true,
    isDeleted: input.isDeleted === true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

/** 补字段：records 增加同步游标双字段、images、isDeleted */
function normalizeRecord(input: Partial<BillRecord>): BillRecord {
  const now = Date.now();
  const updatedMs =
    typeof input.updatedAtMs === 'number'
      ? input.updatedAtMs
      : input.updatedAt
        ? Date.parse(input.updatedAt) || now
        : now;
  const createdMs =
    typeof input.createdAtMs === 'number'
      ? input.createdAtMs
      : input.createdAt
        ? Date.parse(input.createdAt) || now
        : now;
  return {
    ...input,
    _id: input._id ?? '',
    accountId: input.accountId ?? '',
    type: input.type === 'income' ? 'income' : 'expense',
    amountInCents: Number.isSafeInteger(input.amountInCents) ? (input.amountInCents as number) : 0,
    note: typeof input.note === 'string' ? input.note : '',
    date: typeof input.date === 'string' ? input.date : '',
    images: Array.isArray(input.images) ? input.images.filter((x): x is string => typeof x === 'string') : [],
    isDeleted: input.isDeleted === true,
    createdAt: input.createdAt ?? new Date(createdMs).toISOString(),
    updatedAt: input.updatedAt ?? new Date(updatedMs).toISOString(),
    createdAtMs: createdMs,
    updatedAtMs: updatedMs,
  };
}

function normalizeBudget(input: Partial<Budget>): Budget {
  const now = new Date().toISOString();
  return {
    ...input,
    _id: input._id ?? '',
    month: typeof input.month === 'string' ? input.month : '',
    accountId: typeof input.accountId === 'string' ? input.accountId : null,
    amountInCents: Number.isSafeInteger(input.amountInCents) ? (input.amountInCents as number) : 0,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

/**
 * 执行一次迁移（幂等）。
 * - 已达标（schemaVersion 相同）时仅做字段规整，不改变值；
 * - 缺失 schemaVersion 的老数据视为 v0，补齐 v1 字段。
 */
export function migratePayload(raw: MigrationPayload, target: number = CURRENT_SCHEMA_VERSION): MigrationPayload {
  const current = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (current > target) {
    // 来自更高版本的未知结构，原样保留，避免丢字段
    return { ...raw };
  }
  const migrated: MigrationPayload = { ...raw };
  if (current < 1) {
    migrated.accounts = (raw.accounts ?? []).map(normalizeAccount);
    migrated.records = (raw.records ?? []).map(normalizeRecord);
    migrated.budgets = (raw.budgets ?? []).map(normalizeBudget);
  }
  migrated.schemaVersion = target;
  return migrated;
}

/** 读取当前 schema 元信息（供 storage 层调用） */
export function makeSchemaMeta(version: number = CURRENT_SCHEMA_VERSION): SchemaMeta {
  return { schemaVersion: version, migratedAt: new Date().toISOString() };
}
