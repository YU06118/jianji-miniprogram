/**
 * 预算设置（阶段 3）：月度总预算与分类预算编辑，复用金额键盘。
 * 金额整数分；写入即持久化（upsert 按月覆盖）。
 */

import type { Account, CompatInfo, RecordType } from '../../types';
import { ensurePresetAccounts } from '../../services/category.service';
import { upsertBudget, getBudget, removeBudget } from '../../services/budget.service';
import { monthOf } from '../../utils/date';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter } from '../../utils/page-transition';
import { formatYuan, parseAmountToCents } from '../../utils/money';
import { EMPTY_KEYPAD, keypadFromString, pressKey } from '../../utils/keypad';
import { showSuccessToast, showErrorToast } from '../../utils/logger';

interface BudgetItemView {
  accountId: string | null;
  name: string;
  type: RecordType | 'total';
  amountText: string;
}

Page({
  data: {
    compat: null as CompatInfo | null,
    /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
    navSafeTop: 0,
    /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
    pageEnterSeq: 0,
    month: '',
    items: [] as BudgetItemView[],
    selectedIndex: -1,
    selectedName: '',
    keypad: EMPTY_KEYPAD,
    amountText: '0',
  },

  onLoad(options: { month?: string }): void {
    this.setData(getThemeBootstrap());
    const accounts = ensurePresetAccounts();
    const month = options.month ?? monthOf();
    const items: BudgetItemView[] = [
      {
        accountId: null,
        name: '本月总预算',
        type: 'total',
        amountText: this.budgetText(month, null),
      },
      ...accounts
        .filter((a) => a.type === 'expense')
        .map((a: Account) => ({
          accountId: a._id,
          name: a.name,
          type: a.type,
          amountText: this.budgetText(month, a._id),
        })),
    ];
    this.setData({ month, items });
    this.selectItem(0);
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },

  budgetText(month: string, accountId: string | null): string {
    const budget = getBudget(month, accountId);
    return budget ? formatYuan(budget.amountInCents) : '未设置';
  },

  selectItem(index: number): void {
    const item = this.data.items[index];
    if (!item) return;
    const keypad = item.amountText === '未设置' ? EMPTY_KEYPAD : keypadFromString(item.amountText);
    this.setData({
      selectedIndex: index,
      selectedName: item.name,
      keypad,
      amountText: keypad.display,
    });
  },

  onSelect(event: { currentTarget: { dataset: { index: number } } }): void {
    this.selectItem(event.currentTarget.dataset.index);
  },

  onKey(event: { detail: { key: string } }): void {
    const keypad = pressKey(this.data.keypad, event.detail.key);
    this.setData({ keypad, amountText: keypad.display });
  },

  onSave(): void {
    const cents = parseAmountToCents(this.data.amountText);
    if (cents === null) {
      showErrorToast('金额非法');
      return;
    }
    const item = this.data.items[this.data.selectedIndex];
    if (!item) return;
    try {
      upsertBudget(this.data.month, item.accountId, cents);
      const items = [...this.data.items];
      items[this.data.selectedIndex] = { ...item, amountText: formatYuan(cents) };
      this.setData({ items });
      showSuccessToast('预算已保存');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '保存失败');
    }
  },

  onClear(): void {
    const item = this.data.items[this.data.selectedIndex];
    if (!item) return;
    try {
      removeBudget(this.data.month, item.accountId); // 真删除，不写 0（L1 修复）
      const items = [...this.data.items];
      items[this.data.selectedIndex] = { ...item, amountText: '未设置' };
      this.setData({ items, keypad: EMPTY_KEYPAD, amountText: '0' });
      showSuccessToast('已清除预算');
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : '操作失败');
    }
  },
});
