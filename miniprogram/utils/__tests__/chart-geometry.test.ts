/**
 * 图表几何单测（阶段 3）：环形分段角度、柱图坐标、零值边界。
 */

import { DONUT_START, polarToXY, toBars, toDonutSegments } from '../chart-geometry';

describe('toDonutSegments', () => {
  it('按占比分配角度，末段闭合整圆', () => {
    const segments = toDonutSegments([
      { value: 50, color: 'a', label: 'A' },
      { value: 30, color: 'b', label: 'B' },
      { value: 20, color: 'c', label: 'C' },
    ]);
    expect(segments).toHaveLength(3);
    expect(segments[0].startAngle).toBe(DONUT_START);
    expect(segments[0].ratio).toBeCloseTo(0.5);
    expect(segments[2].endAngle).toBeCloseTo(DONUT_START + Math.PI * 2);
  });

  it('总和为 0 返回空数组（不产生 NaN 角度）', () => {
    expect(toDonutSegments([{ value: 0, color: 'a', label: 'A' }])).toEqual([]);
  });

  it('单段占满整圆', () => {
    const segments = toDonutSegments([{ value: 100, color: 'a', label: 'A' }]);
    expect(segments[0].endAngle - segments[0].startAngle).toBeCloseTo(Math.PI * 2);
  });
});

describe('toBars', () => {
  it('按最大值归一化高度，最小值不为负', () => {
    const bars = toBars([100, 50, 0], ['1月', '2月', '3月'], 300, 100, 0.5);
    expect(bars).toHaveLength(3);
    expect(bars[0].height).toBe(100);
    expect(bars[1].height).toBe(50);
    expect(bars[2].height).toBe(0);
    expect(bars[0].y).toBe(0);
    expect(bars[2].y).toBe(100);
  });

  it('全 0 数据不除零（max 兜底为 1）', () => {
    const bars = toBars([0, 0], ['a', 'b'], 100, 50);
    expect(bars.every((b) => Number.isFinite(b.height))).toBe(true);
  });

  it('空数组返回空', () => {
    expect(toBars([], [], 100, 100)).toEqual([]);
  });
});

describe('polarToXY', () => {
  it('12 点方向为 (cx, cy-r)', () => {
    const p = polarToXY(100, 100, 50, -Math.PI / 2);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50);
  });
});
