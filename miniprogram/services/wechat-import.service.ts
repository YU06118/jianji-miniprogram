/**
 * 微信账单导入解析层（纯函数，不 import 任何 wx.*）。
 *
 * 证据档位：列名/说明行/退款文案/取值域来自真实样本（2026-08-27~2026-11-27，
 * 11 列、说明行 17 行、表头第 18 行、汇总在顶部），全部沉淀为下方常量表，
 * 可替换、不散进解析逻辑。fallback 分类 _id 来自用户账号内新建的「其他」支出分类。
 *
 * INV-1 金额一律整数分；INV-2 日期只截取不构造 Date；INV-5 解析层零 wx 依赖。
 */

// ===== 错误码与文案（§2.6：键集合必须完全相等，AC-3 有单测） =====

export const ErrorCode = {
  NO_FILE: 'NO_FILE',
  UNSUPPORTED_ZIP: 'UNSUPPORTED_ZIP',
  UNSUPPORTED_XLSX: 'UNSUPPORTED_XLSX',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  ENCODING_UNSUPPORTED: 'ENCODING_UNSUPPORTED',
  HEADER_UNRECOGNIZED: 'HEADER_UNRECOGNIZED',
  CONTENT_INCOMPLETE: 'CONTENT_INCOMPLETE',
  NO_IMPORTABLE_ROW: 'NO_IMPORTABLE_ROW',
  PARSE_ABORTED: 'PARSE_ABORTED',
  WRITE_FAILED: 'WRITE_FAILED',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const FAILURE_COPY: Readonly<Record<ErrorCode, string>> = {
  NO_FILE: '未选择文件',
  UNSUPPORTED_ZIP: '改用微信接收，无需解压码',
  UNSUPPORTED_XLSX: '暂只支持 csv，请另存后重试',
  UNSUPPORTED_FILE_TYPE: '不支持该文件类型',
  ENCODING_UNSUPPORTED: '文件编码不支持',
  HEADER_UNRECOGNIZED: '不像微信账单，检查是否选错文件',
  CONTENT_INCOMPLETE: '内容不完整，请重新复制',
  NO_IMPORTABLE_ROW: '这批都已记过',
  PARSE_ABORTED: '解析中断，未写入任何数据',
  WRITE_FAILED: '写入失败，已回滚',
  ROLLBACK_FAILED: '回滚失败，请检查账本',
};

// ===== 样本驱动常量表（§0.3：可替换，不写死在逻辑里） =====

/** 表头完整列名（去空白、括号归一后比对）。样本为 11 列。 */
export const WECHAT_HEADER_TOKENS: readonly string[] = [
  '交易时间',
  '交易类型',
  '交易对方',
  '商品',
  '收/支',
  '金额(元)',
  '支付方式',
  '当前状态',
  '交易单号',
  '商户单号',
  '备注',
];

/** 表头命中下限：单列模糊匹配会把说明行当表头，必须 ≥3 完整列名 */
export const HEADER_HIT_MIN = 3;

/** 缺任一列即无法定位日期/金额/状态/单号，拒绝解析。收/支列缺失时按 §6.2 用例 2 落 neutral */
export const HEADER_REQUIRED_TOKENS: readonly string[] = [
  '交易时间',
  '金额(元)',
  '当前状态',
  '交易单号',
];

/** 收/支中性取值：闭集正向匹配之外一律中性（§2.5） */
export const NEUTRAL_DIRECTION_TOKENS: readonly string[] = ['/', '-', '—', '', '不计收支'];
export const INCOME_TOKEN = '收入';
export const EXPENSE_TOKEN = '支出';

/** 退款文案（样本实测：无括号与半角括号两套并存，¥ 与金额无空格） */
export const REFUND_FULL_TOKEN = '已全额退款';
export const REFUND_PARTIAL_TOKEN = '退款';
export const REFUND_AMOUNT_RE = /[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/;

/** 样本中出现的非退款状态；不在表且不含「退款」→ 错误行（§2.5 未知状态显式归宿） */
export const KNOWN_STATUS_TOKENS: readonly string[] = [
  '支付成功',
  '充值完成',
  '已存入零钱',
  '已到账',
  '对方已收钱',
  '提现已到账',
  '已转账',
  '已收钱',
  '对方已退还',
];

/** 说明行笔数声明（样本位于表格顶部第 7~10 行，不依赖行号） */
export const DECLARED_TOTAL_RE = /共\s*(\d+)\s*笔记录/;
export const DECLARED_INCOME_RE = /收入[：:]\s*(\d+)\s*笔\s*([\d,]+(?:\.\d{1,2})?)?\s*元?/;
export const DECLARED_EXPENSE_RE = /支出[：:]\s*(\d+)\s*笔\s*([\d,]+(?:\.\d{1,2})?)?\s*元?/;
export const DECLARED_NEUTRAL_RE = /中性交易[：:]\s*(\d+)\s*笔\s*([\d,]+(?:\.\d{1,2})?)?\s*元?/;

/** 月份区间：仅原样截取两个 YYYY-MM-DD 供展示，不构造 Date（§2.4） */
export const DATE_TOKEN_RE = /\d{4}-\d{2}-\d{2}/g;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 去重 key 里的零宽字符与全角空格规范化 */
function stripZeroWidth(raw: string): string {
  return raw
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\uFEFF/g, '');
}

// ===== 分类映射（§3.5：纯数据 + 纯函数，顺序固定） =====

export interface CategoryRule {
  id: string;
  /** 交易类型完整相等 */
  exact: readonly string[];
  /** 交易类型/商品/交易对方模糊包含 */
  contains: readonly string[];
}

/**
 * 现有分类 id：preset-0..7 来自 category.service.ts PRESET_ACCOUNTS 顺序。
 * fallback 为用户账号内新建的「其他」支出分类（2026-11-27 开发者工具取证）。
 */
export const FALLBACK_CATEGORY_ID = 'acc-mwvg2u9-0-qtmy';

export const CATEGORY_RULES: readonly CategoryRule[] = [
  { id: 'preset-0', exact: ['餐饮'], contains: ['餐饮', '食堂', '餐厅', '外卖', '美食', '饭店', '菜馆'] },
  { id: 'preset-1', exact: ['交通'], contains: ['交通', '公交', '地铁', '打车', '滴滴', '出租', '加油', '停车', '高铁', '火车', '机票'] },
  { id: 'preset-2', exact: ['购物'], contains: ['购物', '淘宝', '京东', '拼多多', '超市', '商场', '服饰', '女装', '外套'] },
  { id: 'preset-3', exact: ['居住'], contains: ['居住', '房租', '水电', '燃气', '物业', '宽带'] },
  { id: 'preset-4', exact: ['娱乐'], contains: ['娱乐', '电影', '游戏', 'KTV', '音乐', '视频', '会员'] },
  { id: 'preset-5', exact: ['医疗'], contains: ['医疗', '医院', '药店', '诊所', '挂号'] },
  { id: 'preset-6', exact: ['工资'], contains: ['工资', '薪资', '薪酬'] },
  { id: 'preset-7', exact: ['理财'], contains: ['理财', '基金', '股票', '零钱通', '理财通'] },
];

/** 映射表涉及的既有分类 id（供单测断言「每个 categoryId ∈ 既有清单」） */
export const MAPPED_CATEGORY_IDS: readonly string[] = [
  ...CATEGORY_RULES.map((r) => r.id),
  FALLBACK_CATEGORY_ID,
];

/** 精确 → 模糊 → fallback；未命中不新建分类 */
export function classify(transactionType: string, product: string, merchant: string): string {
  const type = transactionType.trim();
  for (const rule of CATEGORY_RULES) {
    if (rule.exact.some((word) => type === word)) return rule.id;
  }
  const haystack = `${type} ${product} ${merchant}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.contains.some((word) => haystack.includes(word))) return rule.id;
  }
  return FALLBACK_CATEGORY_ID;
}

// ===== CSV 切分（§3.2：字符级状态机，行与字段同时产出） =====

export interface CsvRow {
  fields: string[];
  /** 逻辑行序（从 0 开始） */
  index: number;
  /** 未闭合引号 */
  error?: 'UNCLOSED_QUOTE';
}

type ScanState = 'start' | 'plain' | 'quoted' | 'afterQuote';

/**
 * 严格 RFC 4180：逗号分隔、双引号包裹、"" 转义、CRLF/裸 LF/裸 CR 行分隔。
 * 首字符 U+FEFF 只剥一次；未闭合引号归错误行；不 split(',')、不全局 trim。
 */
export function splitCsvLine(input: string): CsvRow[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: CsvRow[] = [];
  let fields: string[] = [];
  let field = '';
  let state: ScanState = 'start';
  let unclosed = false;

  const pushField = (): void => {
    fields.push(field);
    field = '';
    state = 'start';
  };
  const pushRow = (): void => {
    pushField();
    rows.push({
      fields,
      index: rows.length,
      ...(unclosed ? { error: 'UNCLOSED_QUOTE' as const } : {}),
    });
    fields = [];
    unclosed = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          state = 'afterQuote';
        }
      } else {
        // 字段内 \r / \n 原样保留，不结束行
        field += ch;
      }
      continue;
    }

    if (ch === ',') {
      pushField();
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
      continue;
    }
    if (ch === '"' && state === 'start') {
      state = 'quoted';
      continue;
    }
    if (ch === '"' && state === 'afterQuote') {
      // 闭合引号后紧跟字面引号，按转义处理并回到 quoted
      field += '"';
      state = 'quoted';
      continue;
    }
    field += ch;
    state = 'plain';
  }

  if (state === 'quoted') unclosed = true;
  if (field.length > 0 || fields.length > 0 || state !== 'start' || unclosed) pushRow();
  return rows;
}

/** 列名归一化：去空白 + 全角括号转半角 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/[\s\u00A0\u3000]/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

/** 商户规范化（§3.6.2）：写入与去重必须共用同一函数 */
export function normalizeMerchant(raw: string): string {
  return stripZeroWidth(raw).replace(/\u3000/g, ' ').trim();
}

/** 表头定位：≥3 完整列名命中且整行无冒号；返回 -1 表示未找到 */
export function locateHeader(rows: readonly CsvRow[]): number {
  const tokens = new Set(WECHAT_HEADER_TOKENS.map(normalizeHeader));
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.error) continue;
    const line = row.fields.join(',');
    if (line.includes(':') || line.includes('：')) continue;
    let hits = 0;
    for (const field of row.fields) {
      if (tokens.has(normalizeHeader(field))) hits += 1;
    }
    if (hits >= HEADER_HIT_MIN) return i;
  }
  return -1;
}

// ===== 金额（§3.3：纯字符串路径，实现中零 "* 100"） =====

export function parseAmountToCents(raw: string): number | null {
  const s = raw.replace(/[¥￥]/g, '').replace(/,/g, '').replace(/[\s\u00A0\u3000]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const dot = s.indexOf('.');
  const intPart = dot < 0 ? s : s.slice(0, dot);
  const fracPart = dot < 0 ? '' : s.slice(dot + 1);
  const centsText = intPart + fracPart.padEnd(2, '0');
  const cents = Number(centsText);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

// ===== 候选与去重（§3.6） =====

export interface Candidate {
  txnId?: string;
  date: string;
  /** 去重口径：原始金额分 */
  amountCentsOriginal: number;
  /** 写入口径：部分退款为净额分 */
  amountInCents: number;
  merchant: string;
  categoryId: string;
  direction: 'income' | 'expense';
  rawIndex: number;
}

export function bucketKey(
  item: Pick<Candidate, 'date' | 'amountCentsOriginal' | 'merchant' | 'categoryId'>,
): string {
  return `${item.date}|${item.amountCentsOriginal}|${normalizeMerchant(item.merchant)}|${item.categoryId}`;
}

export interface DedupeInput {
  candidates: readonly Candidate[];
  existingTxnIds: ReadonlySet<string>;
  existingBuckets: ReadonlyMap<string, number>;
}

export interface DedupeResult {
  accepted: Candidate[];
  skippedByTxnId: number;
  skippedByCount: number;
}

/** 两类键分开计数，顺序固定；txnId 命中不消耗 bucket 名额 */
export function dedupe(input: DedupeInput): DedupeResult {
  const accepted: Candidate[] = [];
  const batchTxnIds = new Set<string>();
  const seenInBatch = new Map<string, number>();
  let skippedByTxnId = 0;
  let skippedByCount = 0;

  for (const candidate of input.candidates) {
    if (candidate.txnId) {
      if (input.existingTxnIds.has(candidate.txnId) || batchTxnIds.has(candidate.txnId)) {
        skippedByTxnId += 1;
        continue;
      }
      batchTxnIds.add(candidate.txnId);
      accepted.push(candidate);
      continue;
    }
    const key = bucketKey(candidate);
    const n = (seenInBatch.get(key) ?? 0) + 1;
    if (n <= (input.existingBuckets.get(key) ?? 0)) {
      skippedByCount += 1;
    } else {
      accepted.push(candidate);
    }
    seenInBatch.set(key, n);
  }

  return { accepted, skippedByTxnId, skippedByCount };
}

// ===== 预览（§3.1 / §3.7） =====

export interface DeclaredCounts {
  total?: number;
  income?: number;
  expense?: number;
  neutral?: number;
  incomeAmount?: number;
  expenseAmount?: number;
  neutralAmount?: number;
}

export interface PreviewDifference {
  category: 'income' | 'expense' | 'neutral' | 'refund' | 'total';
  declaredCount?: number;
  parsedCount: number;
  declaredAmount?: number;
  parsedAmount?: number;
}

export interface PreviewResult {
  ok: boolean;
  code?: ErrorCode;
  /** 不可变快照：确认后写入这一份，不重新解析 */
  rows: readonly Candidate[];
  added: number;
  skippedByTxnId: number;
  skippedByCount: number;
  neutral: number;
  refundFull: number;
  errorRows: number;
  declared: DeclaredCounts;
  monthRange?: string;
  selfChecked: boolean;
  differences: PreviewDifference[];
  /** 粘贴路径无说明行，跳过笔数自校验 */
  fromPaste: boolean;
}

export interface BuildPreviewInput {
  text: string;
  existingTxnIds: ReadonlySet<string>;
  existingBuckets: ReadonlyMap<string, number>;
  fromPaste?: boolean;
}

function readDeclared(rows: readonly CsvRow[], headerIndex: number): DeclaredCounts {
  const declared: DeclaredCounts = {};
  for (let i = 0; i < headerIndex; i += 1) {
    const line = rows[i].fields.join(' ');
    const total = DECLARED_TOTAL_RE.exec(line);
    if (total) declared.total = Number(total[1]);
    const income = DECLARED_INCOME_RE.exec(line);
    if (income) {
      declared.income = Number(income[1]);
      if (income[2]) declared.incomeAmount = parseAmountToCents(income[2]) ?? undefined;
    }
    const expense = DECLARED_EXPENSE_RE.exec(line);
    if (expense) {
      declared.expense = Number(expense[1]);
      if (expense[2]) declared.expenseAmount = parseAmountToCents(expense[2]) ?? undefined;
    }
    const neutral = DECLARED_NEUTRAL_RE.exec(line);
    if (neutral) {
      declared.neutral = Number(neutral[1]);
      if (neutral[2]) declared.neutralAmount = parseAmountToCents(neutral[2]) ?? undefined;
    }
  }
  return declared;
}

function readMonthRange(rows: readonly CsvRow[], headerIndex: number): string | undefined {
  for (let i = 0; i < headerIndex; i += 1) {
    const matches = rows[i].fields.join(' ').match(DATE_TOKEN_RE);
    if (matches && matches.length >= 2) return `${matches[0]} → ${matches[1]}`;
  }
  return undefined;
}

const EMPTY_PREVIEW = (code: ErrorCode, fromPaste: boolean): PreviewResult => ({
  ok: false,
  code,
  rows: [],
  added: 0,
  skippedByTxnId: 0,
  skippedByCount: 0,
  neutral: 0,
  refundFull: 0,
  errorRows: 0,
  declared: {},
  selfChecked: false,
  differences: [],
  fromPaste,
});

/**
 * 纯函数：文本 → 预览结构，零写入。
 * 表头不命中 → HEADER_UNRECOGNIZED；抛异常 → PARSE_ABORTED。
 */
export function buildPreview(input: BuildPreviewInput): PreviewResult {
  const fromPaste = input.fromPaste === true;
  try {
    const rows = splitCsvLine(input.text);
    const headerIndex = locateHeader(rows);
    if (headerIndex < 0) return EMPTY_PREVIEW(ErrorCode.HEADER_UNRECOGNIZED, fromPaste);

    const header = rows[headerIndex].fields.map(normalizeHeader);
    const indexOf = (token: string): number => header.indexOf(normalizeHeader(token));
    const iTime = indexOf('交易时间');
    const iType = indexOf('交易类型');
    const iParty = indexOf('交易对方');
    const iProduct = indexOf('商品');
    const iDirection = indexOf('收/支');
    const iAmount = indexOf('金额(元)');
    const iStatus = indexOf('当前状态');
    const iTxn = indexOf('交易单号');
    if ([iTime, iType, iParty, iProduct, iAmount, iStatus, iTxn].some((i) => i < 0)) {
      return EMPTY_PREVIEW(ErrorCode.HEADER_UNRECOGNIZED, fromPaste);
    }

    const declared = fromPaste ? {} : readDeclared(rows, headerIndex);
    const monthRange = fromPaste ? undefined : readMonthRange(rows, headerIndex);
    const candidates: Candidate[] = [];
    let neutral = 0;
    let refundFull = 0;
    let errorRows = 0;
    const parsedCount = { income: 0, expense: 0, neutral: 0 };
    const parsedAmount = { income: 0, expense: 0, neutral: 0, refund: 0 };

    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (row.error || row.fields.length !== header.length) {
        errorRows += 1;
        continue;
      }
      const fields = row.fields;
      const date = fields[iTime].slice(0, 10);
      if (!DATE_RE.test(date)) {
        errorRows += 1;
        continue;
      }
      const original = parseAmountToCents(fields[iAmount]);
      if (original === null) {
        errorRows += 1;
        continue;
      }
      const directionRaw = iDirection < 0 ? '' : fields[iDirection].trim();
      const statusRaw = fields[iStatus].trim();
      const direction: 'income' | 'expense' | 'neutral' =
        directionRaw === INCOME_TOKEN
          ? 'income'
          : directionRaw === EXPENSE_TOKEN
            ? 'expense'
            : 'neutral';

      // 退款三分支：全额不计 / 部分净额 / 抽不出金额归错误行
      let writeAmount = original;
      if (statusRaw.includes(REFUND_FULL_TOKEN)) {
        refundFull += 1;
        parsedCount[direction] += 1;
        parsedAmount.refund += original;
        continue;
      }
      if (statusRaw.includes(REFUND_PARTIAL_TOKEN)) {
        const match = REFUND_AMOUNT_RE.exec(statusRaw);
        if (!match) {
          errorRows += 1;
          continue;
        }
        const refundCents = parseAmountToCents(match[1]);
        if (refundCents === null) {
          errorRows += 1;
          continue;
        }
        writeAmount = original - refundCents;
        if (writeAmount <= 0) {
          refundFull += 1;
          parsedCount[direction] += 1;
          parsedAmount.refund += original;
          continue;
        }
      } else if (
        !KNOWN_STATUS_TOKENS.includes(statusRaw) &&
        direction !== 'neutral'
      ) {
        // 未知状态显式归错误行，不得默认按支出处理；中性交易状态不参与此判定
        errorRows += 1;
        continue;
      }

      if (direction === 'neutral') {
        neutral += 1;
        parsedCount.neutral += 1;
        parsedAmount.neutral += original;
        continue;
      }

      parsedCount[direction] += 1;
      parsedAmount[direction] += original;

      const rawTxnId = fields[iTxn].trim();
      const txnId = rawTxnId && rawTxnId !== '/' && rawTxnId.trim().length > 0 ? rawTxnId : undefined;
      const rawMerchant = fields[iParty];
      const merchant = normalizeMerchant(rawMerchant && rawMerchant !== '/' ? rawMerchant : fields[iProduct]);

      candidates.push({
        ...(txnId ? { txnId } : {}),
        date,
        amountCentsOriginal: original,
        amountInCents: writeAmount,
        merchant,
        categoryId: classify(fields[iType], fields[iProduct], merchant),
        direction,
        rawIndex: row.index,
      });
    }

    const deduped = dedupe({
      candidates,
      existingTxnIds: input.existingTxnIds,
      existingBuckets: input.existingBuckets,
    });
    const added = deduped.accepted.length;

    // 笔数自校验：按收入/支出/中性分别断言；粘贴路径无说明行则跳过
    const differences: PreviewDifference[] = [];
    let selfChecked = true;
    if (!fromPaste && declared.total !== undefined) {
      const checks: Array<{ key: 'income' | 'expense' | 'neutral'; label: 'income' | 'expense' | 'neutral' }> = [
        { key: 'income', label: 'income' },
        { key: 'expense', label: 'expense' },
        { key: 'neutral', label: 'neutral' },
      ];
      for (const check of checks) {
        const declaredCount = declared[check.key];
        const parsedN = parsedCount[check.key];
        const declaredAmount = declared[`${check.key}Amount`];
        const parsedM = parsedAmount[check.key];
        const mismatch =
          (declaredCount !== undefined && declaredCount !== parsedN) ||
          (declaredAmount !== undefined && declaredAmount !== parsedM);
        if (mismatch) {
          selfChecked = false;
          differences.push({
            category: check.label,
            ...(declaredCount !== undefined ? { declaredCount } : {}),
            parsedCount: parsedN,
            ...(declaredAmount !== undefined ? { declaredAmount } : {}),
            parsedAmount: parsedM,
          });
        }
      }
      const declaredTotal = declared.income && declared.expense && declared.neutral
        ? declared.income + declared.expense + declared.neutral
        : undefined;
      if (declaredTotal !== undefined && declaredTotal !== declared.total) {
        selfChecked = false;
        differences.push({ category: 'total', declaredCount: declared.total, parsedCount: declaredTotal });
      }
      if (refundFull > 0) {
        differences.push({ category: 'refund', parsedCount: refundFull, parsedAmount: parsedAmount.refund });
      }
    }

    return {
      ok: true,
      rows: deduped.accepted,
      added,
      skippedByTxnId: deduped.skippedByTxnId,
      skippedByCount: deduped.skippedByCount,
      neutral,
      refundFull,
      errorRows,
      declared,
      ...(monthRange ? { monthRange } : {}),
      selfChecked,
      differences,
      fromPaste,
    };
  } catch {
    return EMPTY_PREVIEW(ErrorCode.PARSE_ABORTED, fromPaste);
  }
}

// ===== 写库流程（依赖注入纯函数，U7 退化落点：service 层可测） =====

export interface WriteInput<T> {
  currentRecords: readonly T[];
  rows: readonly Candidate[];
  expectedAdded: number;
  saveRecords: (records: readonly T[]) => void;
  readRecords: () => readonly T[];
  makeRecord: (candidate: Candidate) => T;
}

export interface WriteResult {
  ok: boolean;
  code?: (typeof ErrorCode)['WRITE_FAILED' | 'ROLLBACK_FAILED'];
  actualAdded: number;
}

/**
 * 一次 saveRecords 整体写入 + 写失败回滚 + added 校验（W-3 / INV-9）。
 * 备份不跨进程持久化：小程序被杀掉时无恢复能力（一期显式边界）。
 * saveRecords 无单次上限（U6 已核实：writeJSON 一次 setStorageSync）；触顶需分批改造，一期不做。
 */
export function applyWechatImport<T>(input: WriteInput<T>): WriteResult {
  const backup = input.currentRecords.map((r) => ({ ...r }));
  const rowsToAdd = input.rows.map(input.makeRecord);
  try {
    input.saveRecords([...backup, ...rowsToAdd]);
    const after = input.readRecords();
    const actualAdded = after.length - backup.length;
    if (actualAdded !== input.expectedAdded) throw new Error('added mismatch');
    return { ok: true, actualAdded };
  } catch {
    try {
      input.saveRecords(backup);
    } catch {
      return { ok: false, code: ErrorCode.ROLLBACK_FAILED, actualAdded: 0 };
    }
    return { ok: false, code: ErrorCode.WRITE_FAILED, actualAdded: 0 };
  }
}
