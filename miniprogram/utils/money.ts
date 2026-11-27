/**
 * 金额工具：一律以「分」为单位的整数存储与计算，禁止浮点参与金额运算。
 * 展示层才格式化为元；小数位规则固定为「分位截断到两位」（不做四舍五入）。
 */

/** 整数部分最大位数（9 位元，即至多 999999999 元） */
const MAX_INTEGER_DIGITS = 9;

/**
 * 清洗输入串：只保留数字与最多一个小数点，用于输入实时拦截。
 * 负号、字母、空格、多个小数点一律拒绝（返回 null）。
 */
export function sanitizeAmountInput(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length === 0) return '';
  // 白名单：数字与单个小数点
  if (!/^\d*\.?\d*$/.test(value)) return null;
  if ((value.match(/\./g) ?? []).length > 1) return null;
  const [integer = '', decimal = ''] = value.split('.');
  if (integer.length > MAX_INTEGER_DIGITS) return null;
  if (decimal.length > 2) return null;
  return value;
}

/**
 * 解析金额字符串为「分」整数。
 * - "12"      -> 1200
 * - "12.3"    -> 1230
 * - "12.34"   -> 1234
 * - "0.01"    -> 1
 * - 非法输入（负号/多小数点/超长/非数字）-> null
 */
export function parseAmountToCents(raw: string): number | null {
  const clean = sanitizeAmountInput(raw);
  if (clean === null) return null;
  if (clean === '' || clean === '.') return 0;
  const [integerPart = '0', decimalPart = ''] = clean.split('.');
  const integer = integerPart === '' ? 0 : Number(integerPart);
  const centsFromDecimal = (decimalPart + '00').slice(0, 2);
  const cents = Number(centsFromDecimal || '0');
  const total = integer * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * 保存按钮可用性：金额为正且已选分类。
 * 供编辑器实时置灰，避免用户点了才提示「请输入有效金额」（交互修复第三阶段）。
 */
export function canSaveAmount(raw: string, categorySelected: boolean): boolean {
  if (!categorySelected) return false;
  const cents = parseAmountToCents(raw);
  return cents !== null && cents > 0;
}

/**
 * 把「分」整数格式化为元字符串（两位小数，展示用）。
 * 全程整数运算：整数部分与小数部分分别由整除和取余得到。
 */
export function formatYuan(cents: number): string {
  if (!Number.isSafeInteger(cents)) return '0.00';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const fraction = abs % 100;
  return `${sign}${yuan}.${fraction < 10 ? '0' : ''}${fraction}`;
}

/**
 * 格式化为带符号的金额文本（收支区分不仅靠颜色）。
 * type='income' 前缀 '+'，type='expense' 前缀 '−'（U+2212）。
 */
export function formatSignedYuan(cents: number, type: 'income' | 'expense'): string {
  const prefix = type === 'income' ? '+' : '\u2212';
  return `${prefix}\u00a0¥${formatYuan(cents)}`;
}

/** 整数分求和（纯整数运算） */
export function sumCents(values: number[]): number {
  return values.reduce((acc, item) => acc + item, 0);
}

/**
 * 计算占比（0~1），仅用于展示层。
 * 分母为 0 时返回 0，避免 NaN / Infinity 进入视图层。
 */
export function ratioOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return part / total;
}
