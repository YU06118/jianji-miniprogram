/**
 * 导出/导入服务单测（阶段 4）：导出含墓碑、校验失败整体回滚、往返一致。
 */

import { setStorageAdapter, STORAGE_KEYS } from '../../utils/storage';
import type { StorageAdapter } from '../../utils/storage';
import { buildExportFromStorage, applyImport, classifyShareError } from '../data-io.service';
import { validateImport } from '../import.service';
import type { BillRecord } from '../../types';

function memoryAdapter(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}

let adapter: ReturnType<typeof memoryAdapter>;

beforeEach(() => {
  adapter = memoryAdapter();
  setStorageAdapter(adapter);
  adapter.setItem(STORAGE_KEYS.records, '[]');
  adapter.setItem(STORAGE_KEYS.accounts, '[]');
  adapter.setItem(STORAGE_KEYS.budgets, '[]');
});

function tombstone(id: string): BillRecord {
  return {
    _id: id,
    accountId: 'a',
    type: 'expense',
    amountInCents: 100,
    note: 'deleted',
    date: '2026-01-01',
    images: [],
    isDeleted: true,
    createdAt: '',
    updatedAt: '',
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

describe('buildExportFromStorage', () => {
  it('导出包含软删除墓碑（防止云同步复活已删记录）', () => {
    adapter.setItem(STORAGE_KEYS.records, JSON.stringify([tombstone('r1')]));
    const payload = buildExportFromStorage();
    expect(payload.records).toHaveLength(1);
    expect(payload.records?.[0].isDeleted).toBe(true);
    expect(payload.schemaVersion).toBe(1);
  });
});

describe('classifyShareError（第六阶段：分享失败分类）', () => {
  it.each([
    ['shareFileMessage:fail cancel', 'cancel'],
    ['shareFileMessage:fail not supported', 'unsupported'],
    ['shareFileMessage:fail can only be invoked by user TAP gesture', 'unsupported'],
    ['shareFileMessage:fail permission denied', 'unsupported'],
    ['shareFileMessage:fail file not exist', 'invalid-path'],
    ['shareFileMessage:fail invalid path', 'invalid-path'],
    ['shareFileMessage:fail some new error', 'unknown'],
  ])('%s -> %s', (errMsg, expected) => {
    expect(classifyShareError(errMsg)).toBe(expected);
  });
});

describe('applyImport', () => {
  it('校验失败不写入任何数据（整体回滚）', () => {
    const before = adapter.getItem(STORAGE_KEYS.records);
    const result = validateImport({ records: [{ _id: '', bad: true }] });
    expect(result.valid).toBe(false);
    expect(applyImport(result)).toBe(false);
    expect(adapter.getItem(STORAGE_KEYS.records)).toBe(before);
  });

  it('校验通过整体覆盖写入', () => {
    const payload = buildExportFromStorage();
    const valid = validateImport({ ...payload, records: [tombstone('r2')] });
    expect(applyImport(valid)).toBe(true);
    const stored = JSON.parse(adapter.getItem(STORAGE_KEYS.records) ?? '[]') as BillRecord[];
    expect(stored).toHaveLength(1);
    expect(stored[0]._id).toBe('r2');
  });
});
