/**
 * 统计页（阶段 3）：月份切换、概览数字滚动、环形分类占比、6 月趋势柱图、预算进度。
 * 数据全部复用 stats.service / budget.service 聚合；金额在 TS 预格式化，色值来自 tokens。
 */

import type { CompatInfo } from '../../types';
import { summarizeMonth, categoryRatios, monthlyTrend } from '../../services/stats.service';
import { queryRecords } from '../../services/record.service';
import { listAccounts, ensurePresetAccounts } from '../../services/category.service';
import { computeProgress, budgetsOfMonth } from '../../services/budget.service';
import type { BudgetProgress } from '../../services/budget.service';
import { monthOf, shiftMonth } from '../../utils/date';
import { getThemeBootstrap, isRecentTabSwitch } from '../../utils/nav';
import { playTabEnter } from '../../utils/page-transition';
import { formatYuan, ratioOf } from '../../utils/money';
import { TOKEN_ACCENT, TOKEN_EXPENSE } from '../../utils/tokens';

interface TabBarInstance {
  setData(data: { selected: number }): void;
}
interface SegmentView {
  value: number;
  color: string;
  label: string;
}
interface RatioView {
  name: string;
  color: string;
  amountText: string;
  percent: number;
}
interface ProgressView {
  name: string;
  color: string;
  spentText: string;
  budgetText: string;
  remainText: string;
  percent: number;
  warning: boolean;
  over: boolean;
}

Page({
  data: {
    compat: null as CompatInfo | null,
    /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
    navSafeTop: 0,
    /** tab 切换入场动画触发器 */
    enterSeq: 0,
    currentMonth: '',
    expenseCents: 0,
    incomeCents: 0,
    balanceCents: 0,
    segments: [] as SegmentView[],
    centerLabel: '本月支出',
    centerValue: '0.00',
    ratios: [] as RatioView[],
    barData: [] as Array<{ label: string; value: number }>,
    barColor: TOKEN_ACCENT,
    barHighlightColor: TOKEN_EXPENSE,
    progresses: [] as ProgressView[],
    hasBudget: false,
    empty: true,
  },

  onLoad(): void {
    ensurePresetAccounts();
    this.setData({
      ...getThemeBootstrap(),
      currentMonth: monthOf(),
    });
    this.refresh();
  },

  onShow(): void {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar() as unknown as TabBarInstance | undefined;
      if (tabBar) tabBar.setData({ selected: 1 });
    }
    playTabEnter(this);
    // 第七阶段：切 tab 不重复全量聚合；从编辑页返回仍刷新。
    if (this.data.currentMonth && !isRecentTabSwitch()) this.refresh();
  },

  refresh(): void {
    const month = this.data.currentMonth;
    const all = queryRecords({ month, page: 0, pageSize: Number.MAX_SAFE_INTEGER });
    const accounts = listAccounts();
    const summary = summarizeMonth(all, month);

    // 环形分类占比（支出）
    const ratios = categoryRatios(all, accounts, month, 'expense');
    const segmentViews: SegmentView[] = ratios.map((r) => ({ value: r.amountInCents, color: r.color, label: r.name }));
    const ratioViews: RatioView[] = ratios.map((r) => ({
      name: r.name,
      color: r.color,
      amountText: formatYuan(r.amountInCents),
      percent: Math.round(r.ratio * 100),
    }));

    // 6 月趋势（柱高用分，比例计算不受单位影响）
    const trend = monthlyTrend(all, month, 6);
    const barData = trend.map((t) => ({
      label: `${t.month.slice(5)}月`,
      value: t.expenseInCents,
    }));

    // 预算进度
    const budgets = budgetsOfMonth(month);
    const progress: BudgetProgress[] = computeProgress(month, all, accounts, budgets);
    const progressViews: ProgressView[] = progress.map((p) => ({
      name: p.name,
      color: p.color || TOKEN_ACCENT,
      spentText: formatYuan(p.spentInCents),
      budgetText: formatYuan(p.budgetInCents),
      remainText: formatYuan(Math.abs(p.remainInCents)),
      percent: Math.min(Math.round(ratioOf(p.spentInCents, p.budgetInCents) * 100), 100),
      warning: p.warning,
      over: p.over,
    }));

    this.setData({
      expenseCents: summary.expenseInCents,
      incomeCents: summary.incomeInCents,
      balanceCents: summary.balanceInCents,
      centerValue: formatYuan(summary.expenseInCents),
      segments: segmentViews,
      ratios: ratioViews,
      barData,
      progresses: progressViews,
      hasBudget: progressViews.length > 0,
      empty: all.length === 0,
    });
  },

  onPrevMonth(): void {
    this.setData({ currentMonth: shiftMonth(this.data.currentMonth, -1) }, () => this.refresh());
  },

  onNextMonth(): void {
    this.setData({ currentMonth: shiftMonth(this.data.currentMonth, 1) }, () => this.refresh());
  },

  goToBudget(): void {
    wx.navigateTo({ url: `/pages/budget-manage/index?month=${this.data.currentMonth}` });
  },
});
