/**
 * BUG-ALL-01 页面层回归：跨页同日合并时该日小计必须重算。
 *
 * 背景：第七阶段把 onReachBottom 从「整组 setData」改为「路径 setData」，
 * 跨页同一天时只合并 records、漏改 totalText，导致日小计停留在第一页旧值。
 *
 * 本测试用 global.Page 捕获首页配置，mock queryRecords 造数，
 * 复现「同日 25 条（各 100 分）」的上拉场景，断言小计 = 25.00。
 * 注：因静态走查会扫描 pages 目录下 TS 要求四件套，故测试文件置于 utils/__tests__。
 */
import type { BillRecord } from '../../types';
import { queryRecords, PAGE_SIZE } from '../../services/record.service';

jest.mock('../../services/record.service', () => {
  const actual = jest.requireActual('../../services/record.service');
  return { ...actual, queryRecords: jest.fn() };
});

interface ViewGroupLike {
  date: string;
  totalText: string;
  records: Array<{ _id: string; amountText: string }>;
}

interface PageConfigLike {
  data: Record<string, unknown>;
  buildViewGroups(records: BillRecord[]): ViewGroupLike[];
  onReachBottom(): void;
}

interface MockPageThis {
  data: Record<string, unknown>;
  accountMap: Record<string, unknown>;
  buildViewGroups(records: BillRecord[]): ViewGroupLike[];
  setData(patch: Record<string, unknown>): void;
}

let captured: PageConfigLike | null = null;

beforeAll(() => {
  (globalThis as unknown as { Page: (config: PageConfigLike) => void }).Page = (config) => {
    captured = config;
  };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../../pages/index/index');
});

beforeEach(() => {
  jest.clearAllMocks();
});

/** 简易路径 setData：支持 groups[N] / groups[N].records / groups[N].totalText */
function applyPatch(data: Record<string, unknown>, patch: Record<string, unknown>): void {
  Object.keys(patch).forEach((key) => {
    const value = patch[key];
    const match = /^groups\[(\d+)\](?:\.(records|totalText))?$/.exec(key);
    if (!match) {
      data[key] = value;
      return;
    }
    const index = Number(match[1]);
    const field = match[2];
    const groups = data.groups as ViewGroupLike[];
    if (field) {
      (groups[index] as unknown as Record<string, unknown>)[field] = value;
    } else {
      groups[index] = value as ViewGroupLike;
    }
  });
}

function makeRecord(index: number, date: string): BillRecord {
  return {
    _id: `r-${index}`,
    accountId: 'acc-1',
    type: 'expense',
    amountInCents: 100,
    note: '',
    date,
    images: [],
    isDeleted: false,
    createdAt: '2026-11-26T00:00:00.000Z',
    updatedAt: '2026-11-26T00:00:00.000Z',
    createdAtMs: index,
    updatedAtMs: index,
  };
}

function makeContext(config: PageConfigLike, groups: ViewGroupLike[]): MockPageThis {
  const ctx: MockPageThis = {
    data: {
      page: 0,
      hasMore: true,
      loading: false,
      groups,
      currentMonth: '2026-11',
    },
    accountMap: {},
    buildViewGroups: (records) => config.buildViewGroups(records),
    setData: (patch) => applyPatch(ctx.data, patch),
  };
  return ctx;
}

describe('BUG-ALL-01 · 跨页同日小计重算', () => {
  it('同日 25 条：第一页 20 条 20.00 + 上拉 5 条 5.00 → 小计 25.00', () => {
    const config = captured as PageConfigLike;
    const date = '2026-11-26';
    const first = Array.from({ length: PAGE_SIZE }, (_, i) => makeRecord(i, date));
    const second = Array.from({ length: 5 }, (_, i) => makeRecord(PAGE_SIZE + i, date));
    const groups = config.buildViewGroups(first);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalText).toBe('20.00');

    (queryRecords as jest.Mock).mockReturnValue(second);
    const ctx = makeContext(config, groups);
    (config.onReachBottom as (this: MockPageThis) => void).call(ctx);

    const result = ctx.data.groups as ViewGroupLike[];
    expect(result).toHaveLength(1);
    expect(result[0].records).toHaveLength(25);
    expect(result[0].totalText).toBe('25.00');
    expect(ctx.data.page).toBe(1);
    expect(ctx.data.loading).toBe(false);
  });

  it('跨页不同日：追加为新分组，不误改旧组小计', () => {
    const config = captured as PageConfigLike;
    const groups = config.buildViewGroups(Array.from({ length: 3 }, (_, i) => makeRecord(i, '2026-11-26')));
    const nextDay = [makeRecord(3, '2026-11-25')];

    (queryRecords as jest.Mock).mockReturnValue(nextDay);
    const ctx = makeContext(config, groups);
    (config.onReachBottom as (this: MockPageThis) => void).call(ctx);

    const result = ctx.data.groups as ViewGroupLike[];
    expect(result).toHaveLength(2);
    expect(result[0].totalText).toBe('3.00');
    expect(result[1].date).toBe('2026-11-25');
    expect(result[1].totalText).toBe('1.00');
  });

  it('无更多数据：只置 hasMore=false，不动分组', () => {
    const config = captured as PageConfigLike;
    const groups = config.buildViewGroups([makeRecord(0, '2026-11-26')]);

    (queryRecords as jest.Mock).mockReturnValue([]);
    const ctx = makeContext(config, groups);
    (config.onReachBottom as (this: MockPageThis) => void).call(ctx);

    expect(ctx.data.hasMore).toBe(false);
    expect(ctx.data.loading).toBe(false);
    expect((ctx.data.groups as ViewGroupLike[])[0].totalText).toBe('1.00');
  });
});
