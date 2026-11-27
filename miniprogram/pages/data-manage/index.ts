/**
 * 数据管理：JSON 备份（覆盖）+ 微信账单（合并追加）两条路径。
 * 解析层零 wx 依赖（wechat-import.service.ts）；本页只负责文件读取、剪贴板、存储与 UI。
 * 两种语义在弹窗 mode 上可区分：cover=覆盖、merge=合并。
 */

import type { BillRecord, CompatInfo } from '../../types';
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
import type { ImportValidateResult } from '../../services/import.service';
import {
  ErrorCode,
  FAILURE_COPY,
  buildPreview,
  applyWechatImport,
  normalizeMerchant,
  bucketKey,
} from '../../services/wechat-import.service';
import type { PreviewResult, Candidate } from '../../services/wechat-import.service';
import { readAllRecords, readAllAccounts, loadBudgets, saveRecords } from '../../utils/storage';
import { createId } from '../../utils/id';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter } from '../../utils/page-transition';
import { showErrorToast, showSuccessToast, reportError } from '../../utils/logger';

/** 导入互斥：置位期间拒绝第二次导入（W-3.4） */
let isImporting = false;

/** 微信账单写入记录：额外字段持久化 txnId 与原额，供下次重导对齐 */
type ImportedRecord = BillRecord & {
  wechatTxnId?: string;
  originalCents?: number;
};

interface ImportBases {
  txnIds: Set<string>;
  buckets: Map<string, number>;
}

/** 从现有账本构造去重基线（§3.6）：txnId 与原额分两路 */
function buildDedupeBases(records: readonly BillRecord[]): ImportBases {
  const txnIds = new Set<string>();
  const buckets = new Map<string, number>();
  for (const record of records) {
    if (record.isDeleted) continue;
    const extra = record as ImportedRecord;
    if (extra.wechatTxnId) txnIds.add(extra.wechatTxnId);
    const key = bucketKey({
      date: record.date,
      amountCentsOriginal: extra.originalCents ?? record.amountInCents,
      merchant: normalizeMerchant(record.note),
      categoryId: record.accountId,
    });
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return { txnIds, buckets };
}

/** 整数分转展示串（不参与比较/求和，纯字符串拼接，避免浮点） */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 文件扩展名分流（§2.1）：xlsx/zip/其他扩展名分别拒绝，不尝试解压或解析 */
function classifyExtension(fileName: string): ErrorCode | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xls') return ErrorCode.UNSUPPORTED_XLSX;
  if (ext === 'zip') return ErrorCode.UNSUPPORTED_ZIP;
  if (ext !== 'csv') return ErrorCode.UNSUPPORTED_FILE_TYPE;
  return null;
}

/**
 * UTF-8 解码器（纯字符串路径，不依赖 TextDecoder）。
 * U9 仅在开发者工具验证 TextDecoder('gbk') 可用，小程序逻辑层未核实，故自实现避免隐式降级。
 * 非法字节序列返回 U+FFFD，由后续「≥3 列命中」隐式判为 ENCODING_UNSUPPORTED。
 */
function decodeUtf8(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b >= 0xc2 && b <= 0xdf && i + 1 < bytes.length) {
      const b1 = bytes[i + 1];
      if ((b1 & 0xc0) === 0x80) {
        out += String.fromCharCode(((b & 0x1f) << 6) | (b1 & 0x3f));
        i += 1;
        continue;
      }
      out += '\uFFFD';
    } else if (b >= 0xe0 && b <= 0xef && i + 2 < bytes.length) {
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      if ((b1 & 0xc0) === 0x80 && (b2 & 0xc0) === 0x80) {
        out += String.fromCharCode(((b & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
        i += 2;
        continue;
      }
      out += '\uFFFD';
    } else if (b >= 0xf0 && b <= 0xf4 && i + 3 < bytes.length) {
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      const b3 = bytes[i + 3];
      if ((b1 & 0xc0) === 0x80 && (b2 & 0xc0) === 0x80 && (b3 & 0xc0) === 0x80) {
        const cp = ((b & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
        if (cp <= 0x10ffff) {
          const hi = cp - 0x10000;
          out += String.fromCharCode(0xd800 + Math.floor(hi / 0x400), 0xdc00 + (hi % 0x400));
          i += 3;
          continue;
        }
      }
      out += '\uFFFD';
    } else {
      out += '\uFFFD';
    }
  }
  return out;
}

/** 不传 encoding 读 ArrayBuffer，剥一次 UTF-8 BOM，按 UTF-8 解码（§2.3） */
function readCsvText(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => {
        try {
          const bytes = new Uint8Array(res.data as ArrayBuffer);
          const offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
          resolve(decodeUtf8(bytes.subarray(offset)));
        } catch (error) {
          reject(error);
        }
      },
      fail: (err) => reject(err),
    });
  });
}

/** 选择 csv 聊天文件；cancel 静默返回 null（§2.2） */
function chooseCsvFile(): Promise<{ path: string; name: string } | null> {
  return new Promise((resolve) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv'],
      success: (res) => {
        const file = res.tempFiles[0];
        resolve(file ? { path: file.path, name: file.name } : null);
      },
      fail: (err) => {
        const msg = typeof err?.errMsg === 'string' ? err.errMsg : '';
        if (!msg.toLowerCase().includes('cancel')) reportError('chooseCsvFile', err);
        resolve(null);
      },
    });
  });
}

Page({
  data: {
    compat: null as CompatInfo | null,
    navSafeTop: 0,
    pageEnterSeq: 0,
    recordCount: 0,
    accountCount: 0,
    budgetCount: 0,
    /** 覆盖确认弹窗（mode=cover） */
    coverShow: false,
    coverRecordCount: 0,
    coverAccountCount: 0,
    /** 微信账单预览弹窗（mode=merge） */
    mergeShow: false,
    preview: null as PreviewResult | null,
    previewTitle: '微信账单',
    expanded: false,
    pasteMode: false,
    pasteText: '',
    importing: false,
  },

  onLoad(): void {
    this.setData(getThemeBootstrap());
    playPageEnter(this);
  },

  onShow(): void {
    this.refreshCounts();
  },

  refreshCounts(): void {
    const records = readAllRecords();
    this.setData({
      recordCount: records.filter((r) => !r.isDeleted).length,
      accountCount: readAllAccounts().filter((a) => !a.isDeleted).length,
      budgetCount: loadBudgets().length,
    });
  },

  // ===== JSON 备份：覆盖语义 =====

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

  /** 选 JSON → 校验 → 覆盖确认弹窗（mode=cover）→ 整体覆盖 */
  async onImport(): Promise<void> {
    if (isImporting) return;
    const path = await chooseImportFile();
    if (!path) return;
    const result = readImportFile(path);
    if (!result.valid) {
      showErrorToast(`文件校验失败：${result.errors[0] ?? '格式非法'}`);
      return;
    }
    this.pendingCoverImport = result;
    this.setData({
      coverShow: true,
      coverRecordCount: result.records.length,
      coverAccountCount: result.accounts.length,
    });
  },

  pendingCoverImport: null as ImportValidateResult | null,

  onCoverCancel(): void {
    this.pendingCoverImport = null;
    this.setData({ coverShow: false });
  },

  onCoverConfirm(): void {
    const pending = this.pendingCoverImport;
    if (!pending) return;
    isImporting = true;
    try {
      if (applyImport(pending)) {
        showSuccessToast('导入成功');
        this.refreshCounts();
      } else {
        showErrorToast('导入失败，数据已回滚');
      }
    } finally {
      this.pendingCoverImport = null;
      this.setData({ coverShow: false });
      isImporting = false;
    }
  },

  // ===== 微信账单：合并语义 =====

  /** 从聊天文件选 csv → 分流 → 解析 → 预览（零写入） */
  async onImportWechat(): Promise<void> {
    if (isImporting) return;
    const picked = await chooseCsvFile();
    if (!picked) return;
    const bad = classifyExtension(picked.name);
    if (bad) {
      showErrorToast(FAILURE_COPY[bad]);
      return;
    }
    try {
      const text = await readCsvText(picked.path);
      this.showPreview(text, false);
    } catch (error) {
      reportError('readCsvText', error, FAILURE_COPY[ErrorCode.PARSE_ABORTED]);
    }
  },

  /** 粘贴兜底：textarea 是主路径，剪贴板仅一键填入 */
  onPasteInput(event: { detail: { value: string } }): void {
    this.setData({ pasteText: event.detail.value });
  },

  async onFillClipboard(): Promise<void> {
    try {
      const res = await new Promise<{ data: string }>((resolve, reject) => {
        wx.getClipboardData({ success: resolve, fail: reject });
      });
      this.setData({ pasteText: res.data });
    } catch (error) {
      reportError('getClipboardData', error, '剪贴板读取失败');
    }
  },

  onPreviewPaste(): void {
    const text = this.data.pasteText;
    if (!text.trim()) {
      showErrorToast(FAILURE_COPY[ErrorCode.NO_FILE]);
      return;
    }
    this.showPreview(text, true);
  },

  showPreview(text: string, fromPaste: boolean): void {
    const bases = buildDedupeBases(readAllRecords());
    const preview = buildPreview({
      text,
      existingTxnIds: bases.txnIds,
      existingBuckets: bases.buckets,
      fromPaste,
    });
    if (!preview.ok) {
      const code = preview.code ?? ErrorCode.HEADER_UNRECOGNIZED;
      if (fromPaste && code === ErrorCode.HEADER_UNRECOGNIZED) {
        showErrorToast(FAILURE_COPY[ErrorCode.CONTENT_INCOMPLETE]);
      } else {
        showErrorToast(FAILURE_COPY[code]);
      }
      return;
    }
    if (preview.added === 0) {
      showErrorToast(FAILURE_COPY[ErrorCode.NO_IMPORTABLE_ROW]);
      return;
    }
    this.setData({
      mergeShow: true,
      preview,
      previewTitle: preview.monthRange ? `微信账单 ${preview.monthRange}` : '微信账单',
      expanded: false,
    });
  },

  onToggleExpand(): void {
    this.setData({ expanded: !this.data.expanded });
  },

  onMergeCancel(): void {
    this.setData({ mergeShow: false, preview: null, pasteMode: false });
  },

  /** 确认后写 preview 快照：一次 saveRecords + 笔数校验 + 失败回滚 */
  onMergeConfirm(): void {
    const preview = this.data.preview;
    if (!preview || isImporting) return;
    isImporting = true;
    this.setData({ importing: true });
    try {
      const current = readAllRecords();
      const now = new Date().toISOString();
      const nowMs = Date.now();
      const makeRecord = (candidate: Candidate): ImportedRecord => ({
        _id: createId('r'),
        accountId: candidate.categoryId,
        type: candidate.direction,
        amountInCents: candidate.amountInCents,
        note: candidate.merchant,
        date: candidate.date,
        images: [],
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        createdAtMs: nowMs,
        updatedAtMs: nowMs,
        originalCents: candidate.amountCentsOriginal,
        ...(candidate.txnId ? { wechatTxnId: candidate.txnId } : {}),
      });
      const candidates = preview.rows as readonly Candidate[];
      const result = applyWechatImport({
        currentRecords: current,
        rows: candidates,
        expectedAdded: preview.added,
        saveRecords: (records) => saveRecords(records as BillRecord[]),
        readRecords: () => readAllRecords(),
        makeRecord,
      });
      if (!result.ok) {
        showErrorToast(FAILURE_COPY[result.code ?? ErrorCode.WRITE_FAILED]);
        return;
      }
      showSuccessToast(`导入 ${result.actualAdded} 笔`);
      this.setData({ mergeShow: false, preview: null, pasteMode: false });
      try {
        this.refreshCounts();
      } catch (error) {
        // 刷新失败不影响导入结果（W-3.6）
        console.error('[JJ] refreshCounts after import failed', error);
      }
    } catch (error) {
      reportError('wechatImport', error, FAILURE_COPY[ErrorCode.PARSE_ABORTED]);
    } finally {
      isImporting = false;
      this.setData({ importing: false });
    }
  },

  /** 展开层文案：差异按分类列，格式统一 */
  formatCents(cents: number): string {
    return formatCents(cents);
  },

  goToCloud(): void {
    wx.navigateTo({ url: '/subpackages/cloud/pages/settings/index' });
  },
});
