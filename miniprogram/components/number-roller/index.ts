/**
 * NumberRoller — 数字滚动组件（阶段 2）
 * 600ms 内用 requestAnimationFrame 更新文本；只改文本内容，不触发布局属性动画。
 */

import { formatYuan } from '../../utils/money';
import { raf } from '../../utils/raf';

const DURATION = 600;

Component({
  properties: {
    /** 目标金额（分） */
    value: { type: Number, value: 0 },
    /** 前缀符号：+ / − / 空 */
    sign: { type: String, value: '' },
  },
  data: {
    text: '0.00',
  },
  observers: {
    value(next: number): void {
      this.rollTo(next);
    },
  },
  lifetimes: {
    attached(): void {
      this.setData({ text: `${this.properties.sign}${formatYuan(this.properties.value)}` });
    },
  },
  methods: {
    /** generation token：快速切换 value 时作废旧动画链，避免并发写 text 导致终值错误 */
    rollTo(target: number): void {
      const gen = (this as { _rollGen?: number })._rollGen ?? 0;
      const nextGen = gen + 1;
      (this as { _rollGen?: number })._rollGen = nextGen;

      const from = this.data.text.replace(/[^\d.-]/g, '');
      const startValue = Number(from) || 0;
      const startCents = Math.round(startValue * 100);
      const startTime = Date.now();
      const tick = (): void => {
        // 已被更新的 rollTo 取代 → 停止旧链
        if ((this as { _rollGen?: number })._rollGen !== nextGen) return;
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / DURATION, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(startCents + (target - startCents) * eased);
        this.setData({ text: `${this.properties.sign}${formatYuan(current)}` });
        if (progress < 1) {
          raf(tick);
        }
      };
      raf(tick);
    },
  },
});
