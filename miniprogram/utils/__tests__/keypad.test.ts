/**
 * 金额键盘状态机单测（阶段 2 §3.3）：非法输入拦截、两位小数、9 位整数上限。
 */

import { EMPTY_KEYPAD, keypadFromString, pressKey } from '../keypad';
import { formatYuan, parseAmountToCents } from '../money';
import type { KeypadState } from '../keypad';

function type(state: KeypadState, keys: string[]): KeypadState {
  return keys.reduce((s, k) => pressKey(s, k), state);
}

describe('pressKey', () => {
  it('输入整数与小数', () => {
    const s = type(EMPTY_KEYPAD, ['1', '2', '.', '3', '4']);
    expect(s.display).toBe('12.34');
    expect(s.decimalDigits).toBe(2);
  });

  it('前导 0 被替换', () => {
    expect(type(EMPTY_KEYPAD, ['5']).display).toBe('5');
  });

  it('最多两位小数，第三位被忽略', () => {
    const s = type(EMPTY_KEYPAD, ['1', '.', '2', '3', '4']);
    expect(s.display).toBe('1.23');
  });

  it('不允许第二个小数点（第二个点被忽略，后续数字仍合法）', () => {
    const s = type(EMPTY_KEYPAD, ['1', '.', '2', '.', '3']);
    expect(s.display).toBe('1.23');
  });

  it('整数最多 9 位', () => {
    const s = type(EMPTY_KEYPAD, Array(12).fill('9'));
    expect(s.display).toHaveLength(9);
  });

  it('退格正确处理', () => {
    const s = type(EMPTY_KEYPAD, ['1', '2', '.', '3', 'backspace', 'backspace']);
    expect(s.display).toBe('12');
    expect(s.hasDot).toBe(false);
  });

  it('拒绝非数字/非功能键', () => {
    expect(type(EMPTY_KEYPAD, ['a', '-', '+']).display).toBe('0');
  });
});

describe('编辑回填：整数分 → 键盘显示（BUG-02 回归）', () => {
  it('1234 分回填为 12.34', () => {
    const cents = 1234;
    const yuan = formatYuan(cents);
    expect(yuan).toBe('12.34');
    expect(keypadFromString(yuan).display).toBe('12.34');
  });

  it('888000 分回填为 8880.00', () => {
    const cents = 888000;
    const yuan = formatYuan(cents);
    expect(yuan).toBe('8880.00');
    expect(keypadFromString(yuan).display).toBe('8880.00');
  });

  it('1 分回填为 0.01，round-trip 回整数分无损', () => {
    const yuan = formatYuan(1);
    expect(yuan).toBe('0.01');
    expect(parseAmountToCents(keypadFromString(yuan).display)).toBe(1);
  });
});

describe('keypadFromString', () => {
  it('编辑态回填合法金额', () => {
    const s = keypadFromString('88.80');
    expect(s.display).toBe('88.80');
    expect(s.decimalDigits).toBe(2);
  });

  it('非法字符串回退为 0', () => {
    expect(keypadFromString('-12').display).toBe('0');
    expect(keypadFromString('1.2.3').display).toBe('0');
  });
});
