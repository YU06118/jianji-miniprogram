/**
 * 数据导出/导入服务（阶段 4）：文件 IO + 结构校验 + 整体回滚。
 * 导出必须包含软删除墓碑（读全量），否则删除痕迹丢失、云同步会复活已删记录。
 * 事实：wx.getFileSystemManager 基础库 1.9.9；wx.shareFileMessage 2.16.1；项目最低 2.30.0 覆盖。
 */

import { buildExportPayload, validateImport } from './import.service';
import { migratePayload } from '../utils/migration';
import { CURRENT_SCHEMA_VERSION } from '../utils/migration';
import {
  readAllRecords,
  readAllAccounts,
  loadBudgets,
  saveRecords,
  saveAccounts,
  saveBudgets,
} from '../utils/storage';
import { reportError } from '../utils/logger';

/** 导出文件名（带日期，便于用户识别） */
export function exportFileName(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `简记备份-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
}

/** 组装导出载荷（含墓碑全量）——纯函数，单测覆盖 */
export function buildExportFromStorage(): ReturnType<typeof buildExportPayload> {
  return buildExportPayload(
    readAllAccounts(),
    readAllRecords(),
    loadBudgets(),
    CURRENT_SCHEMA_VERSION,
  );
}

/** 写入导出文件到用户数据目录，返回本地路径 */
export function writeExportFile(): string {
  const fs = wx.getFileSystemManager();
  const filePath = `${wx.env.USER_DATA_PATH}/${exportFileName()}`;
  fs.writeFileSync(filePath, JSON.stringify(buildExportFromStorage(), null, 2), 'utf8');
  return filePath;
}

/** 分享失败分类（第六阶段）：决定用户看到哪句提示，不再一律「操作失败，请重试」 */
export type ShareFailReason = 'success' | 'cancel' | 'unsupported' | 'invalid-path' | 'unknown';

export interface ShareResult {
  ok: boolean;
  reason: ShareFailReason;
  filePath: string;
  /** 原始 errMsg，打控制台供真机取证 */
  errMsg: string;
}

/** 纯函数：按 errMsg 区分「工具不支持 / 用户取消 / 文件路径不合法 / 未知」 */
export function classifyShareError(errMsg: string): ShareFailReason {
  const msg = errMsg.toLowerCase();
  if (msg.includes('cancel')) return 'cancel';
  if (
    msg.includes('not supported') ||
    msg.includes('notsupported') ||
    msg.includes('can only be invoked by user tap gesture') ||
    (msg.includes('sharefilemessage') && msg.includes('permission'))
  ) {
    return 'unsupported';
  }
  if (
    msg.includes('file not exist') ||
    msg.includes('filenotfound') ||
    msg.includes('no such file') ||
    msg.includes('invalid path')
  ) {
    return 'invalid-path';
  }
  return 'unknown';
}

/** 分享导出文件到聊天（须在用户点击行为中调用）；失败不弹无信息 toast，返回分类结果 */
export function shareExportFile(filePath: string, fileName: string): Promise<ShareResult> {
  return new Promise<ShareResult>((resolve) => {
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => resolve({ ok: true, reason: 'success', filePath, errMsg: '' }),
      fail: (err) => {
        const errMsg = typeof err?.errMsg === 'string' ? err.errMsg : String(err ?? '');
        // 提示词第六阶段：把失败码打到控制台，真机可据此区分三种情况
        console.error('[JJ] shareFileMessage fail', errMsg);
        resolve({
          ok: false,
          reason: classifyShareError(errMsg),
          filePath,
          errMsg,
        });
      },
    });
  });
}

/** 最后兜底：把导出 JSON 内容复制到剪贴板（不依赖文件分享能力） */
export function copyExportJsonToClipboard(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const data = JSON.stringify(buildExportFromStorage(), null, 2);
    wx.setClipboardData({
      data,
      success: () => resolve(true),
      fail: (err) => {
        console.error('[JJ] setClipboardData fail', String(err?.errMsg ?? err));
        resolve(false);
      },
    });
  });
}

/** 读取并校验导入文件：返回校验结果，不写入 */
export function readImportFile(filePath: string): ReturnType<typeof validateImport> {
  try {
    const text = wx.getFileSystemManager().readFileSync(filePath, 'utf8') as string;
    const parsed: unknown = JSON.parse(text);
    const migrated = migratePayload(parsed as Parameters<typeof migratePayload>[0]);
    return validateImport(migrated);
  } catch (error) {
    reportError('readImportFile', error);
    return { valid: false, errors: ['文件读取或解析失败'], accounts: [], records: [], budgets: [] };
  }
}

/**
 * 执行导入：仅在校验通过时整体覆盖写入；失败不触碰任何存储（整体回滚语义）。
 * 返回是否成功。
 */
export function applyImport(result: ReturnType<typeof validateImport>): boolean {
  if (!result.valid) return false;
  // 校验通过后再写入，任一写入失败都尽量回滚到导入前
  const backup = {
    accounts: readAllAccounts(),
    records: readAllRecords(),
    budgets: loadBudgets(),
  };
  try {
    saveAccounts(result.accounts);
    saveRecords(result.records);
    saveBudgets(result.budgets);
    return true;
  } catch (error) {
    reportError('applyImport', error);
    // 回滚
    saveAccounts(backup.accounts);
    saveRecords(backup.records);
    saveBudgets(backup.budgets);
    return false;
  }
}

/** 选择本地 JSON 文件（用于导入） */
export function chooseImportFile(): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => resolve(res.tempFiles[0]?.path ?? null),
      fail: (err) => {
        reportError('chooseMessageFile', err);
        resolve(null);
      },
    });
  });
}
