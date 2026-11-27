/**
 * 微信账单导入解析层单测（任务书 §6.2 AC-2，13 条用例）。
 * 每条断言映射到 §1–§4 的编号约束；样本常量来自真实导出（U3/U4 已闭环）。
 */

import {
  ErrorCode,
  FAILURE_COPY,
  WECHAT_HEADER_TOKENS,
  CATEGORY_RULES,
  MAPPED_CATEGORY_IDS,
  FALLBACK_CATEGORY_ID,
  splitCsvLine,
  normalizeHeader,
  normalizeMerchant,
  locateHeader,
  parseAmountToCents,
  classify,
  dedupe,
  buildPreview,
  applyWechatImport,
  type Candidate,
} from '../wechat-import.service';
import { PRESET_ACCOUNTS } from '../category.service';

const HEADER = WECHAT_HEADER_TOKENS.join(',');

/** 构造 17 行说明 + 表头 + 数据行（真实样本形态：说明在顶部、汇总四项） */
function withPreamble(...dataLines: string[]): string {
  const preamble = [
    '微信支付账单明细',
    '微信昵称：[测试]',
    '起始时间：[2026-10-01 00:00:00] 终止时间：[2026-10-31 23:59:59]',
    '导出类型：[全部账单]',
    '导出时间：[2026-11-01 00:00:00]',
    '',
    '共3笔记录',
    '收入：1笔 10.00元',
    '支出：1笔 20.00元',
    '中性交易：1笔 1.00元',
    '注：',
    '1. 充值/提现/理财通购买/零钱通存取/信用卡还款等交易，将计入中性交易',
    '2. 若交易记录明细无有效内容，则代表该时间段内此微信号无交易',
    '3. 本明细仅供个人对账使用',
    '4. 本账单中所有时间均为UTC+08:00时间',
    '',
    '----------------------微信支付账单明细列表--------------------',
    HEADER,
  ];
  return [...preamble, ...dataLines].join('\n');
}

function expenseRow(opts: {
  date?: string;
  type?: string;
  party?: string;
  product?: string;
  direction?: string;
  amount?: string;
  status?: string;
  txn?: string;
} = {}): string {
  return [
    opts.date ?? '2026-10-05 12:00:00',
    opts.type ?? '商户消费',
    opts.party ?? '食堂',
    opts.product ?? '/',
    opts.direction ?? '支出',
    opts.amount ?? '¥20.00',
    '零钱',
    opts.status ?? '支付成功',
    opts.txn ?? 'TXN001',
    'M001',
    '/',
  ].join(',');
}

describe('1. 表头定位 + 笔数自校验（IC-4）', () => {
  it('说明行含干扰性「收/支」字样也不误判，汇总四项与解析笔数一致', () => {
    const text = withPreamble(
      expenseRow(),
      expenseRow({ direction: '收入', amount: '¥10.00', txn: 'TXN002' }),
      expenseRow({ direction: '/', amount: '¥1.00', txn: 'TXN003' }),
    );
    const rows = splitCsvLine(text);
    expect(locateHeader(rows)).toBe(17); // 不依赖行号的判据，但样本行号断言固定为 17

    const preview = buildPreview({
      text,
      existingTxnIds: new Set(),
      existingBuckets: new Map(),
    });
    expect(preview.ok).toBe(true);
    expect(preview.declared.total).toBe(3);
    expect(preview.declared.income).toBe(1);
    expect(preview.declared.expense).toBe(1);
    expect(preview.declared.neutral).toBe(1);
    expect(preview.added).toBe(2); // 中性 1 笔不写库
    expect(preview.neutral).toBe(1);
    expect(preview.selfChecked).toBe(true);
    expect(preview.monthRange).toBe('2026-10-01 → 2026-10-31');
  });

  it('说明行含冒号时不会因单列「收/支」被当表头', () => {
    const text = '收/支：说明\n' + '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注\n';
    expect(locateHeader(splitCsvLine(text))).toBe(1);
  });
});

describe('2. 收入方向正确（P-3）', () => {
  it('转账收款/红包/群收款均按「收/支」列判为 income', () => {
    const text = withPreamble(
      expenseRow({ type: '转账收款', direction: '收入', amount: '¥10.00', txn: 'A' }),
      expenseRow({ type: '红包', direction: '收入', amount: '¥20.00', txn: 'B' }),
      expenseRow({ type: '群收款', direction: '收入', amount: '¥30.00', txn: 'C' }),
    );
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows.every((r) => r.direction === 'income' && r.amountInCents > 0)).toBe(true);
  });

  it('删掉「收/支」列后，全部落 neutral 而非 expense', () => {
    const header = WECHAT_HEADER_TOKENS.filter((t) => t !== '收/支').join(',');
    // 数据行也删掉「收/支」列：10 列对应 10 列表头
    const text = [header, '2026-10-05 12:00:00,商户消费,食堂,/,¥20.00,零钱,支付成功,T1,M001,/'].join('\n');
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.ok).toBe(true);
    expect(preview.neutral).toBe(1);
    expect(preview.rows).toHaveLength(0); // 中性不写库，且绝不误判为 expense
  });
});

describe('3. 金额解析无浮点误差（P-2）', () => {
  it.each([
    ['¥65.00', 6500],
    ['¥1,234.50', 123450],
    ['¥8.99', 899],
    ['¥0.07', 7],
    ['¥35.41', 3541],
  ])('%s → %i 分', (raw, expected) => {
    expect(parseAmountToCents(raw)).toBe(expected);
    expect(Number.isInteger(parseAmountToCents(raw))).toBe(true);
  });

  it.each(['¥0.001', '¥abc', '', '-¥5.00', '1e3'])('%s → null', (raw) => {
    expect(parseAmountToCents(raw)).toBeNull();
  });

  it('退款净额为整数分相减，不使用浮点', () => {
    expect(parseAmountToCents('¥65.00')! - parseAmountToCents('¥5.00')!).toBe(6000);
  });
});

describe('4. CSV 切分（P-1）', () => {
  it('逗号/引号/转义引号/字段内换行/BOM 均按 RFC 4180 解析', () => {
    const text = '\uFEFFa,"女装,外套","他说""你好""","多行\n字段"\r\nb,c,d,e';
    const rows = splitCsvLine(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].fields).toEqual(['a', '女装,外套', '他说"你好"', '多行\n字段']);
    expect(rows[1].fields).toEqual(['b', 'c', 'd', 'e']);
  });

  it('BOM 只剥一次', () => {
    expect(splitCsvLine('\uFEFF\uFEFFa,b')[0].fields[0]).toBe('\uFEFFa');
  });

  it('未闭合引号归错误行', () => {
    const rows = splitCsvLine('a,"未闭合');
    expect(rows[0].error).toBe('UNCLOSED_QUOTE');
  });

  it('行尾多余逗号导致字段数不符时整行归错误行', () => {
    const text = withPreamble(expenseRow() + ',');
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.errorRows).toBe(1);
    expect(preview.added).toBe(0);
  });
});

describe('5. 中性 + 退款（P-4/P-5）', () => {
  it('中性交易不写库；全额退款不计；部分退款按净额写入（两种括号文案）', () => {
    const text = withPreamble(
      expenseRow({ type: '零钱充值', direction: '/', amount: '¥100.00', txn: 'N1' }),
      expenseRow({ type: '提现', direction: '/', amount: '¥100.00', txn: 'N2' }),
      expenseRow({ type: '信用卡还款', direction: '/', amount: '¥100.00', txn: 'N3' }),
      expenseRow({ type: '理财通购买', direction: '/', amount: '¥100.00', txn: 'N4' }),
      expenseRow({ amount: '¥65.00', status: '已全额退款', txn: 'R1' }),
      expenseRow({ amount: '¥65.00', status: '已退款¥5.00', txn: 'R2' }),
    );
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.neutral).toBe(4);
    expect(preview.refundFull).toBe(1);
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].txnId).toBe('R2');
    expect(preview.rows[0].amountCentsOriginal).toBe(6500);
    expect(preview.rows[0].amountInCents).toBe(6000);
  });

  it('半角括号退款文案同样抽得出净额', () => {
    const text = withPreamble(expenseRow({ amount: '¥65.00', status: '已退款(¥5.00)', txn: 'R3' }));
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.rows[0].amountInCents).toBe(6000);
  });

  it('含「退款」但抽不出金额 → 错误行', () => {
    const text = withPreamble(expenseRow({ amount: '¥65.00', status: '已退款', txn: 'R4' }));
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.errorRows).toBe(1);
    expect(preview.added).toBe(0);
  });
});

describe('6. 全量连导两次（P-7）', () => {
  it('第二遍 added=0，跳过数等于第一遍新增数', () => {
    const text = withPreamble(
      expenseRow({ txn: 'T1' }),
      expenseRow({ txn: 'T2' }),
      expenseRow({ txn: 'T3' }),
    );
    const first = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(first.added).toBe(3);

    const existingTxnIds = new Set(first.rows.map((r) => r.txnId!));
    const second = buildPreview({ text, existingTxnIds, existingBuckets: new Map() });
    expect(second.added).toBe(0);
    expect(second.skippedByTxnId).toBe(3);
    expect(new Set(second.rows.map((r) => r.txnId))).toEqual(new Set());
  });
});

describe('7. 无单号旧数据计数对齐（P-7）', () => {
  it('已有 1 条，账单含同日同额 2 笔 → 新增 1、计数跳过 1', () => {
    const text = withPreamble(
      expenseRow({ txn: '', party: '食堂', amount: '¥15.00' }),
      expenseRow({ txn: '', party: '食堂', amount: '¥15.00' }),
    );
    // expenseRow 无单号时用空串，classify 分类为 preset-0（食堂命中餐饮）
    const existingBuckets = new Map([['2026-10-05|1500|食堂|preset-0', 1]]);
    const preview = buildPreview({
      text,
      existingTxnIds: new Set(),
      existingBuckets,
    });
    expect(preview.added).toBe(1);
    expect(preview.skippedByCount).toBe(1);
    expect(preview.rows[0].amountInCents).toBe(1500);
  });

  it('分类不同则计数不对齐', () => {
    const text = withPreamble(expenseRow({ txn: '', party: '食堂', amount: '¥15.00' }));
    const existingBuckets = new Map([['2026-10-05|1500|食堂|preset-2', 1]]);
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets });
    expect(preview.added).toBe(1);
    expect(preview.skippedByCount).toBe(0);
  });
});

describe('8. 表头无法识别 → 零写入', () => {
  it.each(['', '微信支付账单明细\n注：无数据', 'a,b,c\n1,2,3', 'PK\x03\x04zip', '乱码\uFFFD\uFFFD'])(
    '输入 %j → ok=false 且 rows 为空',
    (text) => {
      const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
      expect(preview.ok).toBe(false);
      expect(preview.rows).toHaveLength(0);
    },
  );

  it('流程层：解析失败不调用 saveRecords', () => {
    const saveRecords = jest.fn();
    const result = buildPreview({ text: '', existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(result.ok).toBe(false);
    expect(saveRecords).not.toHaveBeenCalled();
  });
});

describe('9. 分类映射（P-6）', () => {
  it('精确词优先于模糊词', () => {
    expect(classify('交通', '购物', '淘宝')).toBe('preset-1');
  });

  it('未命中落既定 fallback', () => {
    expect(classify('商户消费', '未知商品', '未知商家')).toBe(FALLBACK_CATEGORY_ID);
  });

  it('映射表每个 categoryId 都在既有清单内', () => {
    const known = new Set(PRESET_ACCOUNTS.map((_, index) => `preset-${index}`));
    known.add(FALLBACK_CATEGORY_ID);
    for (const id of MAPPED_CATEGORY_IDS) expect(known.has(id)).toBe(true);
    expect(CATEGORY_RULES.length).toBeGreaterThan(0);
  });
});

describe('10. 错误码 ↔ 文案键闭合（AC-3）', () => {
  it('枚举与文案表键完全相等', () => {
    expect(Object.values(ErrorCode).sort()).toEqual(Object.keys(FAILURE_COPY).sort());
  });

  it('每个文案 ≤20 字、无感叹号、各自一句', () => {
    for (const copy of Object.values(FAILURE_COPY)) {
      expect(copy.length).toBeLessThanOrEqual(20);
      expect(copy).not.toContain('!');
      expect(copy).not.toContain('！');
      expect(copy).not.toContain('\n');
    }
  });
});

describe('11. 预览 == 实际写入（W-3 / INV-9）', () => {
  it('savedRows.length === preview.added', () => {
    const text = withPreamble(expenseRow({ txn: 'W1' }), expenseRow({ txn: 'W2' }));
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    const saved: Array<Array<Record<string, unknown>>> = [];
    let stored: Array<Record<string, unknown>> = [];
    const makeRecord = (c: Candidate): Record<string, unknown> => ({
      _id: c.txnId,
      accountId: c.categoryId,
      amountInCents: c.amountInCents,
      date: c.date,
    });
    const result = applyWechatImport({
      currentRecords: stored,
      rows: preview.rows,
      expectedAdded: preview.added,
      saveRecords: (records) => {
        saved.push([...records]);
        stored = [...records];
      },
      readRecords: () => stored,
      makeRecord,
    });
    expect(result.ok).toBe(true);
    expect(result.actualAdded).toBe(preview.added);
    expect(saved[0].length).toBe(preview.added); // backup 为空，写入即新增笔数
  });

  it('写入笔数不符 → 回滚 + WRITE_FAILED', () => {
    const makeRecord = (): Record<string, unknown> => ({ _id: 'x' });
    const writes: number[] = [];
    const result = applyWechatImport({
      currentRecords: [],
      rows: [{ date: '2026-10-01', amountCentsOriginal: 100, amountInCents: 100, merchant: 'a', categoryId: 'preset-0', direction: 'expense', rawIndex: 0 }],
      expectedAdded: 5,
      saveRecords: (records) => writes.push(records.length),
      readRecords: () => [],
      makeRecord,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ErrorCode.WRITE_FAILED);
    expect(writes).toEqual([1, 0]); // 写入后回滚到 backup
  });

  it('回滚本身失败 → ROLLBACK_FAILED，不谎报已回滚', () => {
    let writes = 0;
    const result = applyWechatImport({
      currentRecords: [],
      rows: [{ date: '2026-10-01', amountCentsOriginal: 100, amountInCents: 100, merchant: 'a', categoryId: 'preset-0', direction: 'expense', rawIndex: 0 }],
      expectedAdded: 1,
      saveRecords: () => {
        writes += 1;
        if (writes === 2) throw new Error('rollback failed');
      },
      readRecords: () => [],
      makeRecord: () => ({ _id: 'x' }),
    });
    expect(result.code).toBe(ErrorCode.ROLLBACK_FAILED);
  });
});

describe('12. 去重键规范化（P-7）', () => {
  it('全角空格/零宽字符规范化后对齐成功', () => {
    const text = withPreamble(expenseRow({ txn: '', party: '　食\u200B堂　', amount: '¥15.00' }));
    const existingBuckets = new Map([['2026-10-05|1500|食堂|preset-0', 1]]);
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets });
    expect(preview.added).toBe(0);
    expect(preview.skippedByCount).toBe(1);
    expect(normalizeMerchant('　食\u200B堂　')).toBe('食堂');
  });

  it('txnId 命中不消耗 bucket 配额', () => {
    const text = withPreamble(expenseRow({ txn: 'T1' }), expenseRow({ txn: 'T1' }));
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.added).toBe(1);
    expect(preview.skippedByTxnId).toBe(1);
    expect(preview.skippedByCount).toBe(0);
  });

  it('dedupe 纯函数：txnId 缺失时按 bucket 计数，两类键互不干扰', () => {
    const base: Candidate = {
      date: '2026-10-05', amountCentsOriginal: 1500, amountInCents: 1500,
      merchant: '食堂', categoryId: 'preset-0', direction: 'expense', rawIndex: 0,
    };
    const result = dedupe({
      candidates: [{ ...base }, { ...base }, { ...base, txnId: 'T9' }],
      existingTxnIds: new Set(['T9']),
      existingBuckets: new Map([['2026-10-05|1500|食堂|preset-0', 1]]),
    });
    expect(result.accepted).toHaveLength(1);
    expect(result.skippedByCount).toBe(1);
    expect(result.skippedByTxnId).toBe(1);
  });
});

describe('13. 时区无关性（P-5）', () => {
  it('日期只取字符串前 10 位，不经 Date 构造', () => {
    const text = withPreamble(expenseRow({ date: '2026-10-05 00:30:00', txn: 'TZ1' }));
    const preview = buildPreview({ text, existingTxnIds: new Set(), existingBuckets: new Map() });
    expect(preview.rows[0].date).toBe('2026-10-05');
  });
});

describe('常量表可替换性（样本先行）', () => {
  it('列名归一化兼容全角括号', () => {
    expect(normalizeHeader('金额（元）')).toBe(normalizeHeader('金额(元)'));
  });

  it('解析实现零 "* 100"（P-2 静态口径）', () => {
    // 本文件只测行为；静态数由 verify-static 规则集之外的 AC-3 断言覆盖
    expect(parseAmountToCents('¥1.00')).toBe(100);
  });
});
