/**
 * 图表几何计算（阶段 3）：纯函数，不依赖 wx/canvas，单测在 Node 覆盖。
 * 环形图分段角度、柱图柱高与坐标均由这里产出。
 */

/** 环形扇区 */
export interface DonutSegment {
  /** 起始角（弧度，从 12 点方向顺时针） */
  startAngle: number;
  /** 结束角 */
  endAngle: number;
  ratio: number;
  value: number;
  color: string;
  label: string;
}

/** 起始角：12 点方向 = -π/2 */
export const DONUT_START = -Math.PI / 2;

/**
 * 把一组数值转为环形图分段角度。
 * - 总和为 0 时不产生分段（调用方画空环）；
 * - 最后一段结束角强制为 3π/2，避免浮点误差留缝。
 */
export function toDonutSegments(
  items: Array<{ value: number; color: string; label: string }>,
): DonutSegment[] {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];
  let cursor = DONUT_START;
  const segments: DonutSegment[] = [];
  items.forEach((item, index) => {
    const ratio = item.value / total;
    const startAngle = cursor;
    const endAngle = index === items.length - 1 ? DONUT_START + Math.PI * 2 : cursor + ratio * Math.PI * 2;
    segments.push({ startAngle, endAngle, ratio, value: item.value, color: item.color, label: item.label });
    cursor = endAngle;
  });
  return segments;
}

/** 柱图单柱数据（含坐标，单位为绘图区逻辑像素） */
export interface BarDatum {
  label: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 计算柱图坐标。
 * @param values 数值数组
 * @param labels 标签数组
 * @param plotWidth 绘图区宽
 * @param plotHeight 绘图区高
 * @param barRatio 柱宽占单槽比例（0~1）
 */
export function toBars(
  values: number[],
  labels: string[],
  plotWidth: number,
  plotHeight: number,
  barRatio = 0.5,
): BarDatum[] {
  if (values.length === 0) return [];
  const max = Math.max(...values, 1);
  const slot = plotWidth / values.length;
  const barWidth = slot * Math.min(Math.max(barRatio, 0.1), 1);
  return values.map((value, index) => {
    const height = (value / max) * plotHeight;
    const x = index * slot + (slot - barWidth) / 2;
    const y = plotHeight - height;
    return { label: labels[index] ?? '', value, x, y, width: barWidth, height };
  });
}

/** 角度转画布坐标（用于分段中点画标签引线） */
export function polarToXY(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}
