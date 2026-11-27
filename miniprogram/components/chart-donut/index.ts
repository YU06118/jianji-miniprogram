/**
 * 环形占比图（阶段 3）：canvas 2d 自绘，零第三方依赖。
 * 事实依据：canvas 组件 type="2d" 自基础库 2.9.0 支持（官方文档《canvas》）；
 * 通过 SelectorQuery.fields({node:true,size:true}) 获取节点，dpr 适配后 ctx.scale。
 * 色值由调用方从 theme token 组装后传入，组件内不硬编码。
 */

import { DONUT_START, polarToXY, toDonutSegments } from '../../utils/chart-geometry';
import { TOKEN_DIVIDER, TOKEN_TEXT_1, TOKEN_TEXT_2 } from '../../utils/tokens';
import { raf, cancelRaf } from '../../utils/raf';

interface SegmentInput {
  value: number;
  color: string;
  label: string;
}

/** 组件实例扩展字段：动画链句柄（页面隐藏/卸载时取消） */
interface ChartDonutInstance {
  _rafId?: number;
  /** 已查询到的 canvas 节点（第七阶段：复用，切月只重绘不重建） */
  _canvasNode?: { node: WechatMiniprogram.Canvas; width: number; height: number };
}

Component({
  properties: {
    /** 分段数据 [{value,color,label}] */
    segments: { type: Array, value: [] },
    /** 环中心显示标题 */
    centerLabel: { type: String, value: '' },
    /** 环中心显示数值（已格式化字符串） */
    centerValue: { type: String, value: '' },
    /** 轨道色（token 值，由调用方传） */
    trackColor: { type: String, value: TOKEN_DIVIDER },
    /** 文字主色 */
    textColor: { type: String, value: TOKEN_TEXT_1 },
    /** 文字次色 */
    textSubColor: { type: String, value: TOKEN_TEXT_2 },
  },
  data: {
    canvasId: 'donut-canvas',
  },
  observers: {
    'segments, centerValue'(): void {
      this.renderChart();
    },
  },
  lifetimes: {
    ready(): void {
      this.renderChart();
    },
    detached(): void {
      this.stopAnim();
    },
  },
  pageLifetimes: {
    /** 页面隐藏时停止动画链，回到前台重绘最终帧 */
    hide(): void {
      this.stopAnim();
    },
    show(): void {
      this.renderChart();
    },
  },
  methods: {
    /** 取消进行中的入场动画链 */
    stopAnim(): void {
      const self = this as unknown as ChartDonutInstance;
      if (self._rafId !== undefined) {
        cancelRaf(self._rafId);
        self._rafId = undefined;
      }
    },

    renderChart(): void {
      this.stopAnim();
      const self = this as unknown as ChartDonutInstance;
      /** 拿到节点后统一绘制：切月/切页直接复用缓存节点，只重绘不重建 */
      const paint = (node: { node: WechatMiniprogram.Canvas; width: number; height: number }): void => {
        const canvas = node.node;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 1;
        const width = node.width;
        const height = node.height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        // 入场动画：0→1 逐帧绘制
        let progress = 0;
        const animate = (): void => {
          this.draw(ctx, width, height, this.properties.segments as SegmentInput[], progress);
          if (progress < 1) {
            progress = Math.min(progress + 0.08, 1);
            self._rafId = raf(animate);
          } else {
            self._rafId = undefined;
          }
        };
        self._rafId = raf(animate);
      };

      // 第七阶段：节点只查一次并缓存，后续切月/切页直接重绘
      if (self._canvasNode) {
        paint(self._canvasNode);
        return;
      }
      this.createSelectorQuery()
        .select('#donut-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const node = res[0] as { node: WechatMiniprogram.Canvas; width: number; height: number } | null;
          if (!node || !node.node) return;
          self._canvasNode = node;
          paint(node);
        });
    },

    /** 逐帧绘制（progress 0~1 驱动入场动画） */
    draw(
      ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
      width: number,
      height: number,
      inputs: SegmentInput[],
      progress: number,
    ): void {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - 10;
      const lineWidth = Math.max(12, radius * 0.32);
      ctx.clearRect(0, 0, width, height);

      // 轨道
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = this.properties.trackColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      const segments = toDonutSegments(inputs.map((s) => ({ value: s.value * progress, color: s.color, label: s.label })));
      segments.forEach((seg) => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, seg.startAngle, seg.endAngle);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'butt';
        ctx.stroke();
      });

      // 中心文字
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.properties.textSubColor;
      ctx.font = '12px sans-serif';
      ctx.fillText(this.properties.centerLabel, cx, cy - 12);
      ctx.fillStyle = this.properties.textColor;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(this.properties.centerValue, cx, cy + 12);

      // 分段引线端点（供视觉校验，极简：在环外画小圆点）
      segments.forEach((seg) => {
        const mid = (seg.startAngle + seg.endAngle) / 2;
        const p = polarToXY(cx, cy, radius + lineWidth / 2, mid);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = seg.color;
        ctx.fill();
      });
      // 保留起始角常量引用，明确角度约定（12 点方向）
      void DONUT_START;
    },
  },
});
