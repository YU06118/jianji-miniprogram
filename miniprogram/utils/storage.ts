/**
 * 本地存储：key 统一前缀 jj:，写入即持久化（阶段 0 §6.2）。
 * 默认同步 API；通过注入 adapter 便于在 Node 单测中覆盖迁移/导入逻辑。
 */

import type { Account, BillRecord, Budget, Setting } from '../types';
import { CURRENT_SCHEMA_VERSION, makeSchemaMeta, migratePayload } from './migration';
import type { MigrationPayload } from './migration';

/** 存储 key 常量：统一 jj: 前缀 */
export const STORAGE_KEYS = {
  records: 'jj:records',
  accounts: 'jj:accounts',
  budgets: 'jj:budgets',
  settings: 'jj:settings',
  schema: 'jj:schemaVersion',
  syncCursor: 'jj:syncCursor',
} as const;

/** 可注入的存储适配器（生产用 wx，测试用内存） */
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 默认适配器：wx 同步存储 */
export const wxStorageAdapter: StorageAdapter = {
  getItem: (key) => {
    try {
      return wx.getStorageSync(key) as string | null | undefined ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    wx.setStorageSync(key, value);
  },
  removeItem: (key) => {
    wx.removeStorageSync(key);
  },
};

let adapter: StorageAdapter = wxStorageAdapter;

/** 注入自定义适配器（仅供测试或特殊环境） */
export function setStorageAdapter(next: StorageAdapter): void {
  adapter = next;
}

/** 原始读写 */
export function readRaw(key: string): string | null {
  return adapter.getItem(key);
}

export function writeRaw(key: string, value: string): void {
  adapter.setItem(key, value);
}

/** JSON 读写 */
export function readJSON<T>(key: string, fallback: T): T {
  const raw = adapter.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  adapter.setItem(key, JSON.stringify(value));
}

/**
 * 读取账单全量（含软删除墓碑）——仅供写操作与同步使用。
 * 写操作必须基于全量，否则 saveRecords 整体覆盖会抹掉此前的墓碑。
 */
export function readAllRecords(): BillRecord[] {
  return readJSON<BillRecord[]>(STORAGE_KEYS.records, []);
}

/** 读取账单列表（已过滤软删除）——供展示层使用 */
export function loadRecords(): BillRecord[] {
  return readAllRecords().filter((r) => !r.isDeleted);
}

/** 整体写回账单（入参必须是全量数组，含墓碑） */
export function saveRecords(records: BillRecord[]): void {
  writeJSON(STORAGE_KEYS.records, records);
}

/** 读取分类全量（含软删除墓碑）——仅供写操作与同步使用 */
export function readAllAccounts(): Account[] {
  return readJSON<Account[]>(STORAGE_KEYS.accounts, []);
}

/** 读取分类列表（已过滤软删除）——供展示层使用 */
export function loadAccounts(): Account[] {
  return readAllAccounts()
    .filter((a) => !a.isDeleted)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function saveAccounts(accounts: Account[]): void {
  writeJSON(STORAGE_KEYS.accounts, accounts);
}

export function loadBudgets(): Budget[] {
  return readJSON<Budget[]>(STORAGE_KEYS.budgets, []);
}

export function saveBudgets(budgets: Budget[]): void {
  writeJSON(STORAGE_KEYS.budgets, budgets);
}

/** 设置项读写 */
export function getSetting<T>(key: string, fallback: T): T {
  const all = readJSON<Setting[]>(STORAGE_KEYS.settings, []);
  const found = all.find((s) => s.key === key);
  return found ? (found.value as T) : fallback;
}

export function setSetting<T>(key: string, value: T): void {
  const all = readJSON<Setting[]>(STORAGE_KEYS.settings, []);
  const idx = all.findIndex((s) => s.key === key);
  const entry: Setting<T> = { _id: idx >= 0 ? all[idx]._id : key, key, value };
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.push(entry);
  }
  writeJSON(STORAGE_KEYS.settings, all);
}

/**
 * 启动时执行结构迁移：读取三大数据集，规整字段后写回，并更新 schemaVersion。
 * 幂等：重复调用不会重复补字段或丢数据。
 */
export function runMigrationsIfNeeded(): number {
  const meta = readJSON<{ schemaVersion: number }>(STORAGE_KEYS.schema, {
    schemaVersion: 0,
  });
  const payload: MigrationPayload = {
    schemaVersion: meta.schemaVersion,
    accounts: readJSON<Partial<Account>[]>(STORAGE_KEYS.accounts, []),
    records: readJSON<Partial<BillRecord>[]>(STORAGE_KEYS.records, []),
    budgets: readJSON<Partial<Budget>[]>(STORAGE_KEYS.budgets, []),
  };
  const migrated = migratePayload(payload);
  if (meta.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    writeJSON(STORAGE_KEYS.accounts, migrated.accounts ?? []);
    writeJSON(STORAGE_KEYS.records, migrated.records ?? []);
    writeJSON(STORAGE_KEYS.budgets, migrated.budgets ?? []);
    writeJSON(STORAGE_KEYS.schema, makeSchemaMeta());
  }
  return CURRENT_SCHEMA_VERSION;
}
