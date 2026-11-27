/**
 * 迁移函数单测（阶段 0 §3.3 / §8.4）：幂等、不丢字段、老版本补字段。
 */

import { CURRENT_SCHEMA_VERSION, migratePayload } from '../migration';

describe('migratePayload', () => {
  it('v0 老数据补齐 v1 字段', () => {
    const old = {
      schemaVersion: 0,
      accounts: [{ _id: 'a1', name: '餐饮' }],
      records: [{ _id: 'r1', amountInCents: 100, date: '2026-01-01' }],
      budgets: [{ _id: 'b1', month: '2026-01', accountId: null }],
    };
    const result = migratePayload(old);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    const account = result.accounts?.[0];
    expect(account?.type).toBe('expense');
    expect(account?.isDeleted).toBe(false);
    const record = result.records?.[0];
    expect(record?.images).toEqual([]);
    expect(typeof record?.createdAtMs).toBe('number');
    expect(typeof record?.updatedAtMs).toBe('number');
  });

  it('不丢已有字段（含自定义扩展字段）', () => {
    const old = {
      schemaVersion: 0,
      accounts: [{ _id: 'a1', name: '餐饮', customField: 'keep-me' }],
      records: [],
      budgets: [],
    };
    const result = migratePayload(old);
    expect((result.accounts?.[0] as { customField?: string }).customField).toBe('keep-me');
  });

  it('幂等：连续两次迁移结果等价', () => {
    const input = {
      accounts: [{ _id: 'a1', name: '餐饮' }],
      records: [{ _id: 'r1', amountInCents: 100, date: '2026-01-01' }],
    };
    const first = migratePayload(input);
    const second = migratePayload(first);
    expect(second).toEqual(first);
  });

  it('已是目标版本时不重复补字段', () => {
    const input = { schemaVersion: CURRENT_SCHEMA_VERSION, accounts: [{ _id: 'a1', name: '餐饮' }] };
    const result = migratePayload(input);
    expect(result.accounts).toEqual(input.accounts);
  });

  it('遇到更高版本数据原样保留，避免丢字段', () => {
    const future = { schemaVersion: 99, unknownField: 'keep' };
    const result = migratePayload(future);
    expect(result).toEqual(future);
  });
});
