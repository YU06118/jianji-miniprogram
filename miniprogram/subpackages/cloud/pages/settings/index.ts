/**
 * 云同步设置页（阶段 4）：默认关闭的 P1 可插拔模块。
 * 关闭时不影响任何 P0 记账功能；开启后才初始化云能力并允许同步。
 */

import type { CompatInfo } from '../../../../types';
import {
  isSyncEnabled,
  setSyncEnabled,
  getSyncStatus,
  initCloudIfNeeded,
  syncOnce,
} from '../../../../services/cloud-sync.service';
import { getThemeBootstrap } from '../../../../utils/nav';
import { playPageEnter } from '../../../../utils/page-transition';
import { showSuccessToast, showErrorToast } from '../../../../utils/logger';

interface SyncStatusView {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
  pageEnterSeq: 0 | 1 | 2;
  enabled: boolean;
  lastSyncText: string;
  lastError: string;
  syncing: boolean;
}

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    pageEnterSeq: 0,
    enabled: false,
    lastSyncText: '从未同步',
    lastError: '',
    syncing: false,
  } as SyncStatusView,

  onLoad(): void {
    this.setData(getThemeBootstrap());
    this.refresh();
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },

  refresh(): void {
    const status = getSyncStatus();
    this.setData({
      enabled: status.enabled,
      lastSyncText: status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString('zh-CN') : '从未同步',
      lastError: status.lastError,
    });
  },

  onToggle(): void {
    const next = !this.data.enabled;
    if (next) {
      wx.showModal({
        title: '开启云同步',
        content: '开启后数据将同步到你本人名下的云开发空间，遵循「仅创建者可读写」。本地数据始终是唯一真源，关闭同步不影响记账。',
        success: (res) => {
          if (!res.confirm) return;
          setSyncEnabled(true);
          initCloudIfNeeded();
          this.refresh();
          showSuccessToast('云同步已开启，请先在云开发控制台初始化集合');
        },
      });
      return;
    }
    setSyncEnabled(false);
    this.refresh();
    showSuccessToast('云同步已关闭');
  },

  async onSyncNow(): Promise<void> {
    if (!isSyncEnabled()) {
      showErrorToast('请先开启云同步');
      return;
    }
    if (this.data.syncing) return;
    this.setData({ syncing: true });
    const ok = await syncOnce();
    this.setData({ syncing: false });
    this.refresh();
    if (ok) showSuccessToast('同步完成');
    else showErrorToast('同步失败，本地数据已保留');
  },

  goToPrivacy(): void {
    wx.navigateTo({ url: '/pages/privacy/index' });
  },
});
