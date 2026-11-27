/**
 * 搜索筛选（阶段 2）：关键字 + 分类 + 类型筛选，复用 queryRecords。
 * 视图层金额在 TS 预格式化。
 */

import type { Account, CompatInfo, RecordType } from '../../types';
import { queryRecords } from '../../services/record.service';
import { listAccounts, ensurePresetAccounts } from '../../services/category.service';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter } from '../../utils/page-transition';
import { formatYuan } from '../../utils/money';

interface ResultItem {
  id: string;
  icon: string;
  name: string;
  note: string;
  date: string;
  type: RecordType;
  amountText: string;
}

Page({
  data: {
    compat: null as CompatInfo | null,
    /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
    navSafeTop: 0,
    /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
    pageEnterSeq: 0,
    keyword: '',
    accounts: [] as Account[],
    accountIndex: -1,
    type: '' as '' | RecordType,
    results: [] as ResultItem[],
    searched: false,
  },

  onLoad(): void {
    ensurePresetAccounts();
    this.setData({ ...getThemeBootstrap(), accounts: listAccounts() });
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },

  onKeywordInput(event: { detail: { value: string } }): void {
    this.setData({ keyword: event.detail.value });
  },

  onAccountChange(event: { detail: { value: string } }): void {
    this.setData({ accountIndex: Number(event.detail.value) });
  },

  onTypeChange(event: { currentTarget: { dataset: { type: '' | RecordType } } }): void {
    const type = event.currentTarget.dataset.type;
    this.setData({ type: this.data.type === type ? '' : type });
  },

  onSearch(): void {
    const account = this.data.accountIndex >= 0 ? this.data.accounts[this.data.accountIndex] : undefined;
    const records = queryRecords({
      keyword: this.data.keyword,
      accountId: account?._id,
      type: this.data.type || undefined,
      page: 0,
      pageSize: 200,
    });
    const map = new Map(this.data.accounts.map((a) => [a._id, a]));
    const results: ResultItem[] = records.map((r) => {
      const acc = map.get(r.accountId);
      return {
        id: r._id,
        icon: acc?.icon ?? '◉',
        name: acc?.name ?? '未分类',
        note: r.note,
        date: r.date,
        type: r.type,
        amountText: formatYuan(r.amountInCents),
      };
    });
    this.setData({ results, searched: true });
  },

  onClear(): void {
    this.setData({ keyword: '', accountIndex: -1, type: '', results: [], searched: false });
  },

  onOpenDetail(event: { currentTarget: { dataset: { id: string } } }): void {
    wx.navigateTo({ url: `/pages/record-detail/index?id=${event.currentTarget.dataset.id}` });
  },
});
