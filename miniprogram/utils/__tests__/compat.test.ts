/**
 * 兼容判断单测（阶段 0 R1/R2）：版本号比较、隐私接口门槛、玻璃材质降级判定。
 */

import { compareVersion, supportsBackdropFilter, supportsPrivacyApi } from '../compat';

describe('compareVersion', () => {
  it.each([
    ['2.32.3', '2.30.0', 1],
    ['2.30.0', '2.32.3', -1],
    ['2.30.0', '2.30.0', 0],
    ['3.0.2', '2.32.3', 1],
    ['2.32', '2.32.0', 0],
  ])('%s vs %s', (a, b, expected) => {
    expect(compareVersion(a, b)).toBe(expected);
  });
});

describe('supportsPrivacyApi', () => {
  it('2.32.3+ 支持隐私接口', () => {
    expect(supportsPrivacyApi('2.32.3')).toBe(true);
    expect(supportsPrivacyApi('3.0.2')).toBe(true);
  });

  it('2.30.0 不支持，需降级', () => {
    expect(supportsPrivacyApi('2.30.0')).toBe(false);
  });
});

describe('supportsBackdropFilter', () => {
  it('iOS / devtools 视为支持', () => {
    expect(supportsBackdropFilter('ios')).toBe(true);
    expect(supportsBackdropFilter('devtools')).toBe(true);
  });

  it('Android 一律走降级（保守策略，真机验证前）', () => {
    expect(supportsBackdropFilter('android')).toBe(false);
  });
});
