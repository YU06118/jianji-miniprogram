/**
 * 数据管理（阶段 4）：导出 JSON 备份、导入恢复（校验失败整体回滚）。
 * 导入覆盖是危险操作，需二次确认；导出含软删除墓碑，不丢删除痕迹。
 */

import type { CompatInfo } from '../../types';
import {
  writeExportFile,
  shareExportFile,
  copyExportJsonToClipboard,
  chooseImportFile,
  readImportFile,
  applyImport,
  exportFileName,
} from '../../services/data-io.service';
import type { ShareResult } from '../../services/data-io.service';
import { readAllRecords, readAllAccounts, loadBudgets } from '../../utils/storage';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter } from '../../utils/page-transition';
import { showErrorToast, showSuccessToast } from '../../utils/logger';
import { TOKEN_EXPENSE } from '../../utils/tokens';

Page({
  data: {
    compat: null as CompatInfo | null,
    /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
    navSafeTop: 0,
    /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
    pageEnterSeq: 0,
    recordCount: 0,
    accountCount: 0,
    budgetCount: 0,
    tombstoneCount: 0,
  },

  onLoad(): void {
    this.setData(getThemeBootstrap());
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },

  onShow(): void {
    this.refreshCounts();
  },

  refreshCounts(): void {
    const records = readAllRecords();
    this.setData({
      recordCount: records.filter((r) => !r.isDeleted).length,
      tombstoneCount: records.filter((r) => r.isDeleted).length,
      accountCount: readAllAccounts().filter((a) => !a.isDeleted).length,
      budgetCount: loadBudgets().length,
    });
  },

  /** 导出并分享（须在用户点击行为中调用 shareFileMessage） */
  async onExport(): Promise<void> {
    let filePath: string;
    try {
      filePath = writeExportFile();
    } catch (error) {
      showErrorToast(`导出失败：${error instanceof Error ? error.message : '本地文件写入失败'}`);
      return;
    }
    const result = await shareExportFile(filePath, exportFileName());
    if (result.ok) {
      showSuccessToast('备份文件已分享');
      return;
    }
    if (result.reason === 'cancel') {
      showSuccessToast('已取消分享，文件已保存到本地');
      return;
    }
    await this.showExportFallback(result);
  },

  /** 分享不可用时的兜底：说明原因 + 可复制路径 + 复制 JSON 最后兜底（第六阶段） */
  async showExportFallback(result: ShareResult): Promise<void> {
    const reasonText =
      result.reason === 'unsupported'
        ? '当前环境不支持直接分享'
        : result.reason === 'invalid-path'
          ? '文件路径不合法，无法分享'
          : '分享未完成';
    const confirmed = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '备份已保存到本地',
        content: `${reasonText}。文件路径：${result.filePath}\n可从聊天文件或文件管理器取回；也可复制 JSON 到剪贴板。`,
        confirmText: '复制 JSON',
        cancelText: '知道了',
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    const ok = await copyExportJsonToClipboard();
    if (!ok) showErrorToast('复制失败，请手动复制弹窗中的文件路径');
  },

  /** 导入：选文件 → 校验 → 二次确认 → 整体覆盖 */
  async onImport(): Promise<void> {
    const path = await chooseImportFile();
    if (!path) return;
    const result = readImportFile(path);
    if (!result.valid) {
      showErrorToast(`文件校验失败：${result.errors[0] ?? '格式非法'}`);
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      wx.showModal({
        title: '确认导入',
        content: `将覆盖当前全部数据（${result.records.length} 条账单、${result.accounts.length} 个分类）。此操作不可撤销，建议先导出备份。`,
        confirmText: '覆盖导入',
        confirmColor: TOKEN_EXPENSE,
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    if (applyImport(result)) {
      showSuccessToast('导入成功');
      this.refreshCounts();
    } else {
      showErrorToast('导入失败，数据已回滚');
    }
  },

  goToCloud(): void {
    wx.navigateTo({ url: '/subpackages/cloud/pages/settings/index' });
  },
});
