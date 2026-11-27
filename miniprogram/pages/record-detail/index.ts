/**
 * 账单详情（阶段 2）：查看单条记录、编辑、软删除。
 * 视图层金额在 TS 预格式化。
 */

import type { Account, CompatInfo } from '../../types';
import { getRecord, deleteRecord } from '../../services/record.service';
import { listAccounts } from '../../services/category.service';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter, exitAndBack } from '../../utils/page-transition';
import { formatYuan } from '../../utils/money';
import { showSuccessToast } from '../../utils/logger';

interface DetailData {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
  pageEnterSeq: 0 | 1 | 2;
  id: string;
  type: 'income' | 'expense';
  amountText: string;
  accountName: string;
  accountIcon: string;
  date: string;
  note: string;
  images: string[];
  notFound: boolean;
}

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    pageEnterSeq: 0,
    id: '',
    type: 'expense',
    amountText: '0.00',
    accountName: '',
    accountIcon: '',
    date: '',
    note: '',
    images: [],
    notFound: false,
  } as DetailData,

  onLoad(options: { id?: string }): void {
    const record = options.id ? getRecord(options.id) : null;
    if (!record) {
      this.setData({ notFound: true });
      return;
    }
    const account: Account | undefined = listAccounts().find((a) => a._id === record.accountId);
    this.setData({
      ...getThemeBootstrap(),
      id: record._id,
      type: record.type,
      amountText: formatYuan(record.amountInCents),
      accountName: account?.name ?? '未分类',
      accountIcon: account?.icon ?? '◉',
      date: record.date,
      note: record.note,
      images: record.images,
    });
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },

  onEdit(): void {
    wx.navigateTo({ url: `/pages/record-editor/index?id=${this.data.id}` });
  },

  onDelete(): void {
    deleteRecord(this.data.id);
    showSuccessToast('已删除');
    // 阶段二：改走统一退出动画链路（原先裸 setTimeout 无动画、无 timer 清理）
    exitAndBack();
  },

  onPreviewImage(event: { currentTarget: { dataset: { src: string } } }): void {
    wx.previewImage({ current: event.currentTarget.dataset.src, urls: this.data.images });
  },
});
