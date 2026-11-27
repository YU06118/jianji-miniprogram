/**
 * 导入校验单测（阶段 0 §3.6 / §4.4）：结构校验失败即整体回滚（valid=false）。
 */

import { buildExportPayload, validateImport } from '../import.service';
import type { Account, BillRecord, Budget } from '../../types';

const validAccount: Account = {
  _id: 'a1',
  name: '餐饮',
  type: 'expense',
  icon: 'x',
  color: '#8B7BE8',
  sortOrder: 0,
  builtIn: true,
  isDeleted: false,
  createdAt: '',
  updatedAt: '',
};

const validRecord: BillRecord = {
  _id: 'r1',
  accountId: 'a1',
  type: 'expense',
  amountInCents: 100,
  note: '',
  date: '2026-01-01',
  images: [],
  isDeleted: false,
  createdAt: '',
  updatedAt: '',
  createdAtMs: 0,
  updatedAtMs: 0,
};

const validBudget: Budget = {
  _id: 'b1',
  month: '2026-01',
  accountId: null,
  amountInCents: 100000,
  createdAt: '',
  updatedAt: '',
};

describe('validateImport', () => {
  it('合法数据通过校验', () => {
    const result = validateImport({ schemaVersion: 1, accounts: [validAccount], records: [validRecord], budgets: [validBudget] });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.records).toHaveLength(1);
  });

  it('根节点非对象直接失败', () => {
    expect(validateImport(null).valid).toBe(false);
    expect(validateImport('x').valid).toBe(false);
  });

  it('缺少数组字段标记失败', () => {
    const result = validateImport({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('非法日期被拒绝', () => {
    const result = validateImport({
      accounts: [validAccount],
      records: [{ ...validRecord, date: '2025-02-29' }],
      budgets: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('date'))).toBe(true);
  });

  it('非整数金额被拒绝', () => {
    const result = validateImport({
      accounts: [validAccount],
      records: [{ ...validRecord, amountInCents: 1.5 }],
      budgets: [],
    });
    expect(result.valid).toBe(false);
  });

  it('重复 _id 被拒绝', () => {
    const result = validateImport({
      accounts: [validAccount, { ...validAccount }],
      records: [],
      budgets: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('重复'))).toBe(true);
  });
});

describe('buildExportPayload', () => {
  it('导出结构可被自身校验通过（往返一致）', () => {
    const payload = buildExportPayload([validAccount], [validRecord], [validBudget], 1);
    expect(validateImport(payload).valid).toBe(true);
  });
});
