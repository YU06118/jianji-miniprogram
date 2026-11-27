/**
 * 分类管理服务（阶段 2）：预设分类初始化、新增/编辑/排序/软删除。
 * 纯逻辑 + 存储注入，单测在 Node 覆盖；预设分类不可删除（builtIn=true）。
 */

import type { Account, RecordType } from '../types';
import { createId } from '../utils/id';
import { loadAccounts, readAllAccounts, saveAccounts } from '../utils/storage';
import { TOKEN_ACCENT, TOKEN_BRAND, TOKEN_INCOME, TOKEN_PURPLE_2, TOKEN_PURPLE_3 } from '../utils/tokens';

/** 预设分类（阶段 0 Q7 默认值） */
export const PRESET_ACCOUNTS: ReadonlyArray<{
  name: string;
  type: RecordType;
  icon: string;
  color: string;
}> = [
  { name: '餐饮', type: 'expense', icon: '🍚', color: TOKEN_ACCENT },
  { name: '交通', type: 'expense', icon: '🚌', color: TOKEN_PURPLE_2 },
  { name: '购物', type: 'expense', icon: '🛍', color: TOKEN_PURPLE_3 },
  { name: '居住', type: 'expense', icon: '🏠', color: TOKEN_BRAND },
  { name: '娱乐', type: 'expense', icon: '🎮', color: TOKEN_ACCENT },
  { name: '医疗', type: 'expense', icon: '💊', color: TOKEN_PURPLE_2 },
  { name: '工资', type: 'income', icon: '💰', color: TOKEN_INCOME },
  { name: '理财', type: 'income', icon: '📈', color: TOKEN_INCOME },
];

/** 生成预设分类的完整 Account 对象（纯函数，供单测覆盖） */
export function buildPresetAccounts(now: string = new Date().toISOString()): Account[] {
  return PRESET_ACCOUNTS.map((preset, index) => ({
    _id: `preset-${index}`,
    name: preset.name,
    type: preset.type,
    icon: preset.icon,
    color: preset.color,
    sortOrder: index,
    builtIn: true,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  }));
}

/** 若本地无分类数据则初始化预设（幂等） */
export function ensurePresetAccounts(): Account[] {
  const existing = loadAccounts();
  if (existing.length > 0) return existing;
  // 仅在从未初始化过时写入；若已有墓碑则追加预设，不覆盖墓碑
  const tombstones = readAllAccounts();
  const presets = buildPresetAccounts();
  saveAccounts([...presets, ...tombstones]);
  return presets;
}

export function listAccounts(type?: RecordType): Account[] {
  const all = loadAccounts();
  return type ? all.filter((a) => a.type === type) : all;
}

/** 新增自定义分类 */
export function createAccount(input: {
  name: string;
  type: RecordType;
  icon: string;
  color: string;
}): Account {
  const all = readAllAccounts(); // 基于全量写入，保留既有墓碑
  const activeCount = all.filter((a) => !a.isDeleted).length;
  const now = new Date().toISOString();
  const account: Account = {
    _id: createId('acc'),
    name: input.name.trim(),
    type: input.type,
    icon: input.icon || 'circle',
    color: input.color || TOKEN_ACCENT,
    sortOrder: activeCount,
    builtIn: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
  saveAccounts([...all, account]);
  return account;
}

/** 编辑分类名称/图标（预设可改名，但不可删除） */
export function updateAccount(id: string, patch: Partial<Pick<Account, 'name' | 'icon' | 'color'>>): void {
  const all = readAllAccounts();
  const idx = all.findIndex((a) => a._id === id);
  if (idx < 0 || all[idx].isDeleted) return; // 墓碑不可编辑
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  saveAccounts(all);
}

/** 软删除分类（预设分类拒绝删除，返回 false） */
export function deleteAccount(id: string): boolean {
  const all = readAllAccounts();
  const idx = all.findIndex((a) => a._id === id);
  if (idx < 0 || all[idx].builtIn || all[idx].isDeleted) return false; // 幂等
  all[idx] = { ...all[idx], isDeleted: true, updatedAt: new Date().toISOString() };
  saveAccounts(all);
  return true;
}

/** 排序：传入新的 id 顺序，写回 sortOrder（墓碑保持原位置不参与排序） */
export function reorderAccounts(ids: string[]): void {
  const all = readAllAccounts();
  const orderMap = new Map(ids.map((id, index) => [id, index]));
  all.forEach((a) => {
    if (a.isDeleted) return;
    const next = orderMap.get(a._id);
    if (next !== undefined) a.sortOrder = next;
  });
  saveAccounts(all);
}
