/**
 * 首页（阶段 2）：记账主页
 * 顶部玻璃概览卡（数字滚动）+ 悬浮记一笔 + 按日分组吸顶列表 + 月份切换 +
 * 下拉刷新 / 上拉分页（每页 20 条）+ 列表增删动画。
 * 视图层金额全部在 TS 预格式化（WXML 不直接调 JS 函数）。
 */

import type { Account, BillRecord, CompatInfo } from '../../types';
import { summarizeMonth } from '../../services/stats.service';
import { queryRecords, groupByDay, deleteRecord, PAGE_SIZE } from '../../services/record.service';
import { ensurePresetAccounts } from '../../services/category.service';
import { monthOf, shiftMonth } from '../../utils/date';
import { getThemeBootstrap, isRecentTabSwitch } from '../../utils/nav';
import { playTabEnter } from '../../utils/page-transition';
import { formatYuan, parseAmountToCents } from '../../utils/money';
import { showSuccessToast } from '../../utils/logger';

interface ViewRecord {
  /** 用记录主键作 wx:key，避免列表重排时视图复用错行（第七阶段） */
  _id: string;
  icon: string;
  name: string;
  note: string;
  type: 'income' | 'expense';
  amountText: string;
}

interface ViewGroup {
  date: string;
  totalText: string;
  records: ViewRecord[];
}

interface TabBarInstance {
  setData(data: { selected: number }): void;
}

interface IndexData {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** tab 切换入场序号：0 初始不播；每次 tab 切换在 1/2 交替（第三轮双类方案） */
  enterSeq: 0 | 1 | 2;
  currentMonth: string;
  /** 概览金额（分），供 number-roller 滚动 */
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  groups: ViewGroup[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  empty: boolean;
  collapsingId: string;
}

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    enterSeq: 0,
    currentMonth: '',
    incomeCents: 0,
    expenseCents: 0,
    balanceCents: 0,
    groups: [],
    page: 0,
    hasMore: false,
    loading: false,
    empty: true,
    collapsingId: '',
  } as IndexData,

  /** 分类名/图标映射（不进 data，仅构建视图时用） */
  accountMap: {} as Record<string, Account>,

  onLoad(): void {
    const accounts = ensurePresetAccounts();
    const map: Record<string, Account> = {};
    accounts.forEach((a) => {
      map[a._id] = a;
    });
    this.accountMap = map;
    this.setData({
      ...getThemeBootstrap(),
      currentMonth: monthOf(),
    });
    this.refresh();
  },

  onShow(): void {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar() as unknown as TabBarInstance | undefined;
      if (tabBar) tabBar.setData({ selected: 0 });
    }
    playTabEnter(this);
    // 第七阶段：切 tab 时数据未变，跳过同月全量刷新；
    // 从记账页返回不在切换窗口内，仍刷新以显示新增记录。
    if (this.data.currentMonth && !isRecentTabSwitch()) this.refresh();
  },

  /** 把原始记录转成视图结构（金额预格式化） */
  buildViewGroups(records: BillRecord[]): ViewGroup[] {
    return groupByDay(records).map((group) => ({
      date: group.date,
      totalText: formatYuan(group.totalInCents),
      records: group.records.map((r): ViewRecord => {
        const account = this.accountMap[r.accountId];
        return {
          _id: r._id,
          icon: account?.icon ?? '◉',
          name: account?.name ?? '未分类',
          note: r.note,
          type: r.type,
          amountText: formatYuan(r.amountInCents),
        };
      }),
    }));
  },

  refresh(): void {
    const month = this.data.currentMonth;
    // 全量用于概览聚合；分页只影响列表，不影响统计
    // 第七阶段：一次全量读取同时供概览与首页列表，避免重复 queryRecords
    const all = queryRecords({ month, page: 0, pageSize: Number.MAX_SAFE_INTEGER });
    const summary = summarizeMonth(all, month);
    const firstPage = all.slice(0, PAGE_SIZE);
    this.setData({
      incomeCents: summary.incomeInCents,
      expenseCents: summary.expenseInCents,
      balanceCents: summary.balanceInCents,
      groups: this.buildViewGroups(firstPage),
      page: 0,
      hasMore: all.length > firstPage.length,
      empty: firstPage.length === 0,
      loading: false,
    });
  },

  onPrevMonth(): void {
    this.setData({ currentMonth: shiftMonth(this.data.currentMonth, -1) }, () => this.refresh());
  },

  onNextMonth(): void {
    this.setData({ currentMonth: shiftMonth(this.data.currentMonth, 1) }, () => this.refresh());
  },

  onPullDownRefresh(): void {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  onReachBottom(): void {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ loading: true });
    const nextPage = this.data.page + 1;
    const more = queryRecords({ month: this.data.currentMonth, page: nextPage });
    if (more.length === 0) {
      this.setData({ hasMore: false, loading: false });
      return;
    }
    // 第七阶段：只 set 新增分组（路径 setData），不再重取已加载页整组替换。
    // 跨页同一天时把新增记录并入末组，避免重复日期分组。
    const added = this.buildViewGroups(more);
    const groups = this.data.groups;
    const lastIndex = groups.length - 1;
    const patch: Record<string, unknown> = {
      page: nextPage,
      hasMore: more.length >= PAGE_SIZE,
      loading: false,
    };
    if (lastIndex >= 0 && added[0] && groups[lastIndex].date === added[0].date) {
      const firstAdded = added.shift() as ViewGroup;
      const merged = [...groups[lastIndex].records, ...firstAdded.records];
      patch[`groups[${lastIndex}].records`] = merged;
      // BUG-ALL-01：跨页同日合并时重算该日小计，否则小计停留在第一页旧值。
      // totalText 由 formatYuan(非负整数分) 生成，parseAmountToCents 反解安全。
      const oldCents = parseAmountToCents(groups[lastIndex].totalText) ?? 0;
      const addedCents = parseAmountToCents(firstAdded.totalText) ?? 0;
      patch[`groups[${lastIndex}].totalText`] = formatYuan(oldCents + addedCents);
    }
    added.forEach((group, i) => {
      patch[`groups[${groups.length + i}]`] = group;
    });
    this.setData(patch);
  },

  goToEditor(): void {
    wx.navigateTo({ url: '/pages/record-editor/index' });
  },

  onEditRecord(event: { currentTarget: { dataset: { id: string } } }): void {
    wx.navigateTo({ url: `/pages/record-editor/index?id=${event.currentTarget.dataset.id}` });
  },

  /** 删除：先折叠高度（320ms）再移除，避免列表跳动 */
  onDeleteRecord(event: { currentTarget: { dataset: { id: string } } }): void {
    const id = event.currentTarget.dataset.id;
    const self = this as unknown as { _deleteTimer?: ReturnType<typeof setTimeout> };
    if (self._deleteTimer !== undefined) clearTimeout(self._deleteTimer);
    this.setData({ collapsingId: id });
    self._deleteTimer = setTimeout(() => {
      self._deleteTimer = undefined;
      deleteRecord(id);
      this.setData({ collapsingId: '' });
      showSuccessToast('已删除');
      this.refresh();
    }, 320);
  },

  /** 页面卸载时清理删除动画 timer（OBS-S2-01，与 Q6 同类隐患） */
  onUnload(): void {
    const self = this as unknown as { _deleteTimer?: ReturnType<typeof setTimeout> };
    if (self._deleteTimer !== undefined) {
      clearTimeout(self._deleteTimer);
      self._deleteTimer = undefined;
    }
  },

  goToSearch(): void {
    wx.navigateTo({ url: '/pages/search/index' });
  },
});
