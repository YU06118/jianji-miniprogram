/**
 * 金额键盘输入状态机（阶段 2）：纯函数，可被单测覆盖。
 * 规则与 money.ts 一致：整数≤9位、小数≤2位、禁止负号/多小数点。
 */

export interface KeypadState {
  /** 显示串，如 "12.3" */
  display: string;
  /** 是否有小数点 */
  hasDot: boolean;
  /** 小数位数 */
  decimalDigits: number;
  /** 整数位数 */
  integerDigits: number;
}

export const EMPTY_KEYPAD: KeypadState = {
  display: '0',
  hasDot: false,
  decimalDigits: 0,
  integerDigits: 1,
};

/** 按键：数字 0-9 / '.' / 'backspace' */
export function pressKey(state: KeypadState, key: string): KeypadState {
  if (key === 'backspace') {
    if (state.display === '0') return { ...EMPTY_KEYPAD };
    const next = state.display.slice(0, -1);
    if (next === '' || next === '0') return { ...EMPTY_KEYPAD };
    const hasDot = next.includes('.');
    const decimalDigits = hasDot ? next.split('.')[1].length : 0;
    const integerDigits = hasDot ? next.split('.')[0].length : next.length;
    return { display: next, hasDot, decimalDigits, integerDigits };
  }

  if (key === '.') {
    if (state.hasDot) return state;
    return { ...state, display: `${state.display}.`, hasDot: true };
  }

  if (!/^\d$/.test(key)) return state;

  if (state.hasDot) {
    if (state.decimalDigits >= 2) return state;
    return {
      ...state,
      display: `${state.display}${key}`,
      decimalDigits: state.decimalDigits + 1,
    };
  }

  if (state.display === '0') {
    // 前导 0 直接替换为输入数字
    return { ...state, display: key, integerDigits: 1 };
  }
  if (state.integerDigits >= 9) return state;
  return {
    ...state,
    display: `${state.display}${key}`,
    integerDigits: state.integerDigits + 1,
  };
}

/** 从字符串初始化键盘状态（编辑态回填） */
export function keypadFromString(value: string): KeypadState {
  const clean = /^\d*\.?\d{0,2}$/.test(value) && value !== '' && value !== '.' ? value : '0';
  const hasDot = clean.includes('.');
  const parts = clean.split('.');
  return {
    display: clean,
    hasDot,
    decimalDigits: hasDot ? parts[1].length : 0,
    integerDigits: hasDot ? parts[0].length : clean.length,
  };
}
