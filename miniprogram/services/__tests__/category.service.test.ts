/**
 * 分类管理服务单测（阶段 2）：预设初始化、新增、软删除（预设拒绝）、排序。
 */

import { setStorageAdapter, STORAGE_KEYS } from '../../utils/storage';
import type { StorageAdapter } from '../../utils/storage';
import {
  buildPresetAccounts,
  ensurePresetAccounts,
  createAccount,
  deleteAccount,
  reorderAccounts,
  listAccounts,
} from '../category.service';

function memoryAdapter(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}

describe('category.service', () => {
  let adapter: ReturnType<typeof memoryAdapter>;

  beforeEach(() => {
    adapter = memoryAdapter();
    setStorageAdapter(adapter);
    adapter.setItem(STORAGE_KEYS.accounts, '[]');
  });

  it('预设 8 项分类，6 支出 2 收入（按 Q7）', () => {
    const presets = buildPresetAccounts();
    expect(presets).toHaveLength(8);
    expect(presets.filter((a) => a.type === 'expense')).toHaveLength(6);
    expect(presets.filter((a) => a.type === 'income')).toHaveLength(2);
    expect(presets.every((a) => a.builtIn)).toBe(true);
  });

  it('Q7 固化名称清单：餐饮/交通/购物/居住/娱乐/医疗（支出）+ 工资/理财（收入）', () => {
    // Q7 固化的是"清单"而非仅数量——名称或类型被改动时必须失败
    const presets = buildPresetAccounts();
    expect(presets.map((a) => a.name)).toEqual([
      '餐饮', '交通', '购物', '居住', '娱乐', '医疗', '工资', '理财',
    ]);
    expect(presets.slice(0, 6).every((a) => a.type === 'expense')).toBe(true);
    expect(presets.slice(6).every((a) => a.type === 'income')).toBe(true);
    expect(presets.every((a) => a.builtIn === true && a.isDeleted === false)).toBe(true);
  });

  it('初始化幂等', () => {
    const first = ensurePresetAccounts();
    const second = ensurePresetAccounts();
    expect(second).toEqual(first);
  });

  it('新增自定义分类并可选删除', () => {
    createAccount({ name: '宠物', type: 'expense', icon: '🐱', color: '#8B7BE8' });
    const custom = listAccounts().find((a) => a.name === '宠物');
    expect(custom?.builtIn).toBe(false);
    expect(deleteAccount(custom!._id)).toBe(true);
    expect(listAccounts().find((a) => a.name === '宠物')).toBeUndefined();
  });

  it('BUG-01 回归：连续删除两条自定义分类，墓碑都保留', () => {
    createAccount({ name: '宠物', type: 'expense', icon: '🐱', color: '#8B7BE8' });
    createAccount({ name: '健身', type: 'expense', icon: '🏋', color: '#8B7BE8' });
    const pets = listAccounts().find((a) => a.name === '宠物')!;
    const gym = listAccounts().find((a) => a.name === '健身')!;
    expect(deleteAccount(pets._id)).toBe(true);
    expect(deleteAccount(gym._id)).toBe(true);
    expect(deleteAccount(pets._id)).toBe(false); // 幂等
    const stored = JSON.parse(adapter.getItem(STORAGE_KEYS.accounts) ?? '[]') as Array<{ isDeleted: boolean }>;
    expect(stored.filter((a) => a.isDeleted)).toHaveLength(2);
    expect(listAccounts().some((a) => a.name === '宠物')).toBe(false);
    expect(listAccounts().some((a) => a.name === '健身')).toBe(false);
  });

  it('预设分类拒绝删除', () => {
    const presets = ensurePresetAccounts();
    expect(deleteAccount(presets[0]._id)).toBe(false);
  });

  it('排序写回 sortOrder', () => {
    const presets = ensurePresetAccounts();
    const reversed = presets.map((a) => a._id).reverse();
    reorderAccounts(reversed);
    expect(listAccounts()[0]._id).toBe(reversed[0]);
  });
});
