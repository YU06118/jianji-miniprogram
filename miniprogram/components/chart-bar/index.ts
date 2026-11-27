/**
 * 趋势柱图（阶段 3）：canvas 2d 自绘，零第三方依赖。
 * 支持 canvas 节点不可用时的降级（wxml 里用 view 柱，由 fallback 属性驱动）。
 * 色值由调用方从 token 传入。
 */

import { toBars } from '../../utils/chart-geometry';
import { TOKEN_ACCENT, TOKEN_DIVIDER, TOKEN_EXPENSE, TOKEN_TEXT_3 } from '../../utils/tokens';
import { raf, cancelRaf } from '../../utils/raf';

interface BarInput {
  label: string;
  value: number;
}

/** 组件实例扩展字段：动画链句柄（页面隐藏/卸载时取消） */
interface ChartBarInstance {
  _rafId?: number;
  /** 已查询到的 canvas 节点（第七阶段：复用，切月只重绘不重建） */
  _canvasNode?: { node: WechatMiniprogram.Canvas; width: number; height: number };
}

Component({
  properties: {
    /** 柱数据 [{label,value}]（避免用保留名 data） */
    bars: { type: Array, value: [] },
    /** 柱色（token 值） */
    barColor: { type: String, value: TOKEN_ACCENT },
    /** 超阈值柱色（token 值） */
    highlightColor: { type: String, value: TOKEN_EXPENSE },
    /** 标签色 */
    labelColor: { type: String, value: TOKEN_TEXT_3 },
    /** 网格线色 */
    gridColor: { type: String, value: TOKEN_DIVIDER },
    /** 值超过该阈值用高亮色；<=0 表示不高亮 */
    highlightThreshold: { type: Number, value: 0 },
  },
  data: {
    fallbackBars: [] as Array<{ label: string; heightPercent: number; highlight: boolean }>,
    canvasReady: false,
  },
  observers: {
    'bars, barColor'(): void {
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
      const self = this as unknown as ChartBarInstance;
      if (self._rafId !== undefined) {
        cancelRaf(self._rafId);
        self._rafId = undefined;
      }
    },

    renderChart(): void {
      this.stopAnim();
      const inputs = this.properties.bars as BarInput[];
      // 降级视图数据：百分比高度，纯 view 绘制
      const max = Math.max(...inputs.map((i) => i.value), 1);
      this.setData({
        fallbackBars: inputs.map((i) => ({
          label: i.label,
          heightPercent: Math.round((i.value / max) * 100),
          highlight: this.properties.highlightThreshold > 0 && i.value >= this.properties.highlightThreshold,
        })),
      });

      const self = this as unknown as ChartBarInstance;
      /** 拿到节点后统一绘制：切月/切页复用缓存节点，不重复 SelectorQuery */
      const paint = (node: { node: WechatMiniprogram.Canvas; width: number; height: number }): void => {
          const canvas = node.node;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            this.setData({ canvasReady: false });
            return;
          }
          this.setData({ canvasReady: true });
          const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 1;
          const width = node.width;
          const height = node.height;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);

          const plotTop = 8;
          const plotHeight = height - 28;
          const bars = toBars(inputs.map((i) => i.value), inputs.map((i) => i.label), width, plotHeight, 0.5);
          ctx.clearRect(0, 0, width, height);

          // 网格线
          ctx.strokeStyle = this.properties.gridColor;
          ctx.lineWidth = 1;
          [0.25, 0.5, 0.75].forEach((p) => {
            const y = plotTop + plotHeight * p;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
          });

          const animate = (progress: number): void => {
            ctx.clearRect(0, 0, width, height);
            [0.25, 0.5, 0.75].forEach((p) => {
              const y = plotTop + plotHeight * p;
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(width, y);
              ctx.strokeStyle = this.properties.gridColor;
              ctx.stroke();
            });
            bars.forEach((bar) => {
              const h = bar.height * progress;
              const highlight =
                this.properties.highlightThreshold > 0 && bar.value >= this.properties.highlightThreshold;
              ctx.fillStyle = highlight ? this.properties.highlightColor : this.properties.barColor;
              ctx.fillRect(bar.x, plotTop + bar.y + (bar.height - h), bar.width, h);
              ctx.fillStyle = this.properties.labelColor;
              ctx.font = '10px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(bar.label, bar.x + bar.width / 2, height - 6);
            });
            if (progress < 1) {
              self._rafId = raf(() => animate(Math.min(progress + 0.08, 1)));
            } else {
              self._rafId = undefined;
            }
          };
          self._rafId = raf(() => animate(0.08));
      };

      if (self._canvasNode) {
        paint(self._canvasNode);
        return;
      }
      this.createSelectorQuery()
        .select('#bar-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const node = res[0] as { node: WechatMiniprogram.Canvas; width: number; height: number } | null;
          if (!node || !node.node) {
            this.setData({ canvasReady: false });
            return;
          }
          self._canvasNode = node;
          paint(node);
        });
    },
  },
});
