/**
 * 全局类型定义（阶段 1 §3）
 * 约定：所有涉及金额字段均为「分」整数；时间字段同时存 ISO 字符串与毫秒数字。
 * 禁止 any；第三方库边界如有必要须单独注释来源。
 */

/** 记账类型 */
export type RecordType = 'income' | 'expense';

/** 分类账户 */
export interface Account {
  _id: string;
  name: string;
  type: RecordType;
  icon: string;
  color: string;
  sortOrder: number;
  /** 预设分类：不可删除，仅可隐藏 */
  builtIn: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 账单记录 */
export interface BillRecord {
  _id: string;
  accountId: string;
  type: RecordType;
  /** 金额，单位：分，整数 */
  amountInCents: number;
  note: string;
  /** YYYY-MM-DD（东八区） */
  date: string;
  /** 云存储 fileID 或本地临时路径，禁止 base64 */
  images: string[];
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  /** 同步游标（毫秒） */
  createdAtMs: number;
  updatedAtMs: number;
}

/** 预算：accountId 为 null 表示月度总预算 */
export interface Budget {
  _id: string;
  month: string;
  accountId: string | null;
  amountInCents: number;
  createdAt: string;
  updatedAt: string;
}

/** 设置项 */
export interface Setting<T = unknown> {
  _id: string;
  key: string;
  value: T;
}

/** 存储 schema 版本记录 */
export interface SchemaMeta {
  schemaVersion: number;
  migratedAt: string;
}

/** 统计聚合结果 */
export interface MonthSummary {
  month: string;
  incomeInCents: number;
  expenseInCents: number;
  balanceInCents: number;
}

/** 分类占比 */
export interface CategoryRatio {
  accountId: string;
  name: string;
  color: string;
  amountInCents: number;
  ratio: number;
}

/** 云函数通用出入参 */
export interface CloudResult<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

/** 云同步拉取入参 */
export interface SyncPullInput {
  cursor: number;
  limit: number;
}

/** 云同步拉取出参 */
export interface SyncPullOutput {
  records: BillRecord[];
  nextCursor: number;
  hasMore: boolean;
}

/** 云同步推送入参 */
export interface SyncPushInput {
  records: BillRecord[];
}

/** 云同步推送出参 */
export interface SyncPushOutput {
  accepted: number;
  rejected: string[];
}

/** 导入校验结果 */
export interface ImportCheckResult {
  valid: boolean;
  errors: string[];
  recordCount: number;
}

/** 兼容能力检测结果 */
export interface CompatInfo {
  platform: string;
  sdkVersion: string;
  /** 是否支持 backdrop-filter（JS 侧推断） */
  glassSupported: boolean;
  /** 根节点应附加的降级类名 */
  rootClass: string;
}
