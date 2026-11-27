/**
 * 云同步服务（阶段 4）：可插拔、默认关闭、本地 Storage 为唯一真源。
 * - 关闭时所有操作为空操作，绝不影响 P0 记账功能；
 * - 失败保留本地真源，不产生重复记录；
 * - 合并策略由 sync-merge.service 提供，云函数在服务端执行同样策略。
 * 事实：wx.cloud.init 需在调用云能力前执行；env 使用动态当前环境。
 */

import type { Account, BillRecord, Budget } from '../types';
import { mergeByUpdatedAt, pendingUploads } from './sync-merge.service';
import {
  readAllRecords,
  readAllAccounts,
  loadBudgets,
  saveRecords,
  saveAccounts,
  saveBudgets,
  getSetting,
  setSetting,
} from '../utils/storage';
import { reportError } from '../utils/logger';

const SYNC_ENABLED_KEY = 'cloudSyncEnabled';

export interface SyncStatus {
  enabled: boolean;
  lastSyncAt: number;
  lastError: string;
}

/** 读取同步开关（默认关闭） */
export function isSyncEnabled(): boolean {
  return getSetting<boolean>(SYNC_ENABLED_KEY, false) === true;
}

/** 开启/关闭同步（关闭仅停止后续同步，不清本地数据） */
export function setSyncEnabled(enabled: boolean): void {
  setSetting(SYNC_ENABLED_KEY, enabled);
}

/** 获取同步状态摘要 */
export function getSyncStatus(): SyncStatus {
  return {
    enabled: isSyncEnabled(),
    lastSyncAt: getSetting<number>('cloudSyncLastAt', 0),
    lastError: getSetting<string>('cloudSyncLastError', ''),
  };
}

export interface SyncPayload {
  accounts: Account[];
  records: BillRecord[];
  budgets: Budget[];
}

/** 拉取当前本地全量（含墓碑）作为上传载荷 */
export function collectLocalPayload(): SyncPayload {
  return {
    accounts: readAllAccounts(),
    records: readAllRecords(),
    budgets: loadBudgets(),
  };
}

/** 把合并结果写回本地（仅在同步成功时调用；本地真源不被失败操作破坏） */
export function applyRemotePayload(payload: SyncPayload): void {
  const local = collectLocalPayload();
  // 三类实体统一用 updatedAt 提取器合并（Account/Budget 为 ISO 字符串，Record 为双字段）
  const accounts = mergeByUpdatedAt(local.accounts, payload.accounts).merged;
  const records = mergeByUpdatedAt(local.records, payload.records).merged;
  const budgets = mergeByUpdatedAt(local.budgets, payload.budgets).merged;

  saveAccounts(accounts);
  saveRecords(records);
  saveBudgets(budgets);
}

/**
 * 执行一次同步（真实增量）：
 * 1. probe 拉取远端轻量游标（仅 _id + 更新时间）；
 * 2. 用真实远端算 pendingUploads，只上传本地新增/更新记录（含墓碑）；
 * 3. 云函数与云端合并后返回全量，本地合并写回。
 * 失败时记录错误到设置，保留本地真源，不抛出到调用方。
 */
export async function syncOnce(): Promise<boolean> {
  if (!isSyncEnabled()) return false;
  try {
    const local = collectLocalPayload();

    // 步骤 1：拉取远端游标（轻量，不含业务字段）
    const probeRes = await wx.cloud.callFunction({
      name: 'sync',
      data: { action: 'probe' },
    });
    const probe = probeRes.result as { success: boolean; cursor?: SyncPayload };
    if (!probe?.success || !probe.cursor) {
      throw new Error('拉取远端游标失败');
    }

    // 步骤 2：用真实远端算增量（RISK-02：不再传空数组退化成全量）
    const uploads = {
      accounts: pendingUploads(local.accounts, probe.cursor.accounts),
      records: pendingUploads(local.records, probe.cursor.records),
      budgets: pendingUploads(local.budgets, probe.cursor.budgets),
    };

    // 步骤 3：上传增量，云端合并后返回全量
    const res = await wx.cloud.callFunction({
      name: 'sync',
      data: { action: 'sync', payload: uploads },
    });
    const result = res.result as { success: boolean; payload?: SyncPayload };
    if (!result?.success || !result.payload) {
      throw new Error('云端返回失败');
    }
    applyRemotePayload(result.payload);
    setSetting('cloudSyncLastAt', Date.now());
    setSetting('cloudSyncLastError', '');
    return true;
  } catch (error) {
    reportError('cloudSync', error);
    setSetting('cloudSyncLastError', error instanceof Error ? error.message : '同步失败');
    return false; // 保留本地真源
  }
}

/**
 * 初始化云能力（仅在用户开启同步时调用，env 为动态当前环境）。
 * 不主动申请任何权限。
 */
export function initCloudIfNeeded(): void {
  if (!isSyncEnabled()) return;
  if (!wx.cloud) return;
  try {
    wx.cloud.init({ traceUser: true });
  } catch (error) {
    reportError('cloudInit', error);
  }
}
