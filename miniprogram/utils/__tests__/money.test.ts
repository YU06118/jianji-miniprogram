/**
 * 金额换算单测（阶段 0 §3.6 / §8.3）：整数分、非法输入拦截、展示格式化。
 */

import {
  canSaveAmount,
  formatSignedYuan,
  formatYuan,
  parseAmountToCents,
  sanitizeAmountInput,
  sumCents,
} from '../money';

describe('parseAmountToCents', () => {
  it.each([
    ['0', 0],
    ['12', 1200],
    ['12.3', 1230],
    ['12.34', 1234],
    ['0.01', 1],
    ['999999999.99', 99999999999],
  ])('解析 %s -> %i 分', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(['-12', '12.3.4', 'abc', '12a', '+5', '1e3'])('拒绝非法输入 %s', (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });

  it('空输入解析为 0（输入过程中的合法中间态）', () => {
    expect(parseAmountToCents('')).toBe(0);
    expect(parseAmountToCents('  ')).toBe(0);
  });

  it('拒绝超过 9 位整数部分', () => {
    expect(parseAmountToCents('1000000000')).toBeNull();
  });

  it('拒绝超过两位小数', () => {
    expect(parseAmountToCents('12.345')).toBeNull();
  });
});

describe('sanitizeAmountInput', () => {
  it('允许空串与小数点', () => {
    expect(sanitizeAmountInput('')).toBe('');
    expect(sanitizeAmountInput('.')).toBe('.');
  });

  it('拒绝负号与多小数点', () => {
    expect(sanitizeAmountInput('-1')).toBeNull();
    expect(sanitizeAmountInput('1.2.3')).toBeNull();
  });
});

describe('formatYuan', () => {
  it.each([
    [0, '0.00'],
    [1, '0.01'],
    [1200, '12.00'],
    [123456, '1234.56'],
    [-50, '-0.50'],
  ])('格式化 %i 分 -> %s 元', (cents, expected) => {
    expect(formatYuan(cents)).toBe(expected);
  });

  it('亿元级金额不丢精度', () => {
    expect(formatYuan(99999999999)).toBe('999999999.99');
  });
});

describe('formatSignedYuan', () => {
  it('收入带 + 号，支出带 U+2212 减号（不依赖颜色区分）', () => {
    expect(formatSignedYuan(100, 'income')).toContain('+');
    expect(formatSignedYuan(100, 'expense')).toContain('\u2212');
  });
});

describe('sumCents', () => {
  it('整数分求和无浮点误差', () => {
    expect(sumCents([10, 20, 30])).toBe(60);
    expect(sumCents([199, 199, 199])).toBe(597);
  });
});

describe('canSaveAmount（第三阶段：保存按钮实时置灰）', () => {
  it.each([
    ['0', false],
    ['0.00', false],
    ['', false],
    ['.', false],
    ['-1', false],
    ['12.345', false],
    ['0.01', true],
    ['12', true],
    ['12.34', true],
  ])('金额 %s 且已选分类 -> canSave=%s', (amount, expected) => {
    expect(canSaveAmount(amount, true)).toBe(expected);
  });

  it('未选分类时金额再合法也不可保存', () => {
    expect(canSaveAmount('12.34', false)).toBe(false);
  });
});
