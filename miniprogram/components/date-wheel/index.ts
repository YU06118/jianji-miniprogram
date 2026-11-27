/**
 * DateWheel（交互修复第二轮 A / 第三轮改造）：
 * - 显隐由页面侧 wx:if 控制（无 show 属性）：关闭时节点不存在，杜绝隐藏层拦截点击；
 * - 节点创建（attached）后下一拍再置 visible=true，让进场过渡生效；
 * - scroll-top 必须在节点渲染之后设置（第三轮 §2.3.6）：初始化定位延后一拍；
 * - 三列 scroll-view，滚动停止 160ms 防抖后吸附最近一项；
 * - 年/月变化重算当月天数（闰年/大小月，复用 utils/date 纯函数），日列越界收拢到月末；
 * - 下限 2015-01-01，上限「今天」在 created 时算好（逻辑层写死）；
 * - 「取消 / 确定 / 今天」：确定回写 value；取消/遮罩关闭不写值；今天立即选中并关闭；
 * - 定时器按列管理，detached 全部清理。
 */

import type { DateParts } from '../../utils/date';
import { clampSelectableDate, daysInMonth, isValidDate, todayISO8 } from '../../utils/date';

/** 单项行高（px），与 .date-wheel__item 的 calc(var(--sp-7) + var(--sp-1)) 一致 */
const ITEM_H = 36;
/** 首尾占位项数量 */
const PAD_COUNT = 2;
/** 滚动停止判定防抖（ms） */
const SETTLE_DEBOUNCE_MS = 160;
/** 可回溯的最早年份（需求：至少 2015-01-01） */
const MIN_YEAR = 2015;
/** 节点创建后延迟一拍再显示/定位（ms）——保证 wx:if 节点完成首帧布局 */
const MOUNT_DELAY_MS = 50;

type ColName = 'year' | 'month' | 'day';

/** 组件实例扩展字段（避免 any） */
interface DateWheelInstance {
  _max: DateParts;
  _scrollTop: Record<ColName, number>;
  _settleTimers: Record<ColName, ReturnType<typeof setTimeout> | undefined>;
  _mountTimer: ReturnType<typeof setTimeout> | undefined;
  /** 初始化定位（mount 后一拍再写入 scroll-top） */
  _pendingTop: { year: number; month: number; day: number };
  _suppressDayRebuild: boolean;
  setData(data: Partial<{ visible: boolean; years: number[]; months: number[]; days: number[]; selYear: number; selMonth: number; selDay: number; yearTop: number; monthTop: number; dayTop: number }>): void;
  clearSettle(col: ColName): void;
  buildYearList(): number[];
  buildDays(year: number, month: number): number[];
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 取实例扩展字段（created 时已初始化） */
function ext(instance: unknown): DateWheelInstance {
  return instance as DateWheelInstance;
}

Component({
  properties: {
    /** 当前日期 YYYY-MM-DD */
    value: { type: String, value: '' },
  },

  data: {
    /** 两段式显隐：attached 后下一拍置 true，触发 opacity/transform 过渡 */
    visible: false,
    years: [] as number[],
    /** 月份列数据源（1..12）——修复：WXML 引用 {{months}} 但原 data 未声明，月列空白 */
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as number[],
    days: [] as number[],
    selYear: MIN_YEAR,
    selMonth: 1,
    selDay: 1,
    yearTop: 0,
    monthTop: 0,
    dayTop: 0,
  },

  lifetimes: {
    created(): void {
      const s = ext(this);
      const today = todayISO8();
      s._max = {
        year: Number(today.slice(0, 4)),
        month: Number(today.slice(5, 7)),
        day: Number(today.slice(8, 10)),
      };
      s._scrollTop = { year: 0, month: 0, day: 0 };
      s._settleTimers = { year: undefined, month: undefined, day: undefined };
      s._mountTimer = undefined;
      s._pendingTop = { year: 0, month: 0, day: 0 };
      s._suppressDayRebuild = false;
    },
    attached(): void {
      const s = ext(this);
      s.setData({ years: s.buildYearList() });
      // 先按 value 初始化选中值与目标定位（纯数据）；scroll-top 延后一拍——
      // wx:if 刚创建时节点尚未完成布局，立即设置 scroll-top 无效（第三轮 §2.3.6）
      this.initFromValue();
      s._mountTimer = setTimeout(() => {
        s._mountTimer = undefined;
        s.setData({
          visible: true,
          yearTop: s._pendingTop.year,
          monthTop: s._pendingTop.month,
          dayTop: s._pendingTop.day,
        });
      }, MOUNT_DELAY_MS);
    },
    detached(): void {
      const s = ext(this);
      if (s._mountTimer !== undefined) {
        clearTimeout(s._mountTimer);
        s._mountTimer = undefined;
      }
      (['year', 'month', 'day'] as ColName[]).forEach((col) => ext(this).clearSettle(col));
    },
  },

  methods: {
    /** 年份序列：2015..今天所在年份 */
    buildYearList(): number[] {
      const years: number[] = [];
      for (let y = MIN_YEAR; y <= ext(this)._max.year; y += 1) years.push(y);
      return years;
    },

    /** 某年某月的天数序列（1..N）——闰年与大小月规则由 utils/date 提供 */
    buildDays(year: number, month: number): number[] {
      const total = daysInMonth(year, month);
      const days: number[] = [];
      for (let i = 1; i <= total; i += 1) days.push(i);
      return days;
    },

    /** 清理某列吸附定时器 */
    clearSettle(col: ColName): void {
      const s = ext(this);
      const timer = s._settleTimers[col];
      if (timer !== undefined) {
        clearTimeout(timer);
        s._settleTimers[col] = undefined;
      }
    },

    /** 按 value（非法则用今天，且夹到 [2015-01-01, today]）初始化选中值 */
    initFromValue(): void {
      const s = ext(this);
      const max = s._max;
      const raw = this.properties.value;
      let y: number;
      let m: number;
      let d: number;
      if (typeof raw === 'string' && isValidDate(raw)) {
        y = Number(raw.slice(0, 4));
        m = Number(raw.slice(5, 7));
        d = Number(raw.slice(8, 10));
      } else {
        y = max.year;
        m = max.month;
        d = max.day;
      }
      // 夹取范围：早于 2015-01-01 → 2015-01-01；晚于今天 → 今天；日越界收拢月末
      // （第四阶段抽为 utils/date 纯函数，初始化与滚动吸附共用同一套边界规则）
      const clamped = clampSelectableDate(y, m, d, MIN_YEAR, max);
      y = clamped.year;
      m = clamped.month;
      d = clamped.day;
      const days = this.buildDays(y, m);
      s._suppressDayRebuild = true;
      s.setData({
        days,
        selYear: y,
        selMonth: m,
        selDay: d,
      });
      s._suppressDayRebuild = false;
      // 记录初始定位，attached 的 mount timer 里再写入 scroll-top
      s._pendingTop = {
        year: (y - MIN_YEAR + PAD_COUNT) * ITEM_H,
        month: (m - 1 + PAD_COUNT) * ITEM_H,
        day: (d - 1 + PAD_COUNT) * ITEM_H,
      };
    },

    /** 统一滚动处理：记录最新位置，160ms 防抖后吸附 */
    onColScroll(event: { currentTarget: { dataset: { col: string } }; detail: { scrollTop: number } }): void {
      const s = ext(this);
      const col = event.currentTarget.dataset.col;
      if (col !== 'year' && col !== 'month' && col !== 'day') return;
      s._scrollTop[col] = event.detail.scrollTop;
      this.clearSettle(col);
      s._settleTimers[col] = setTimeout(() => {
        s._settleTimers[col] = undefined;
        this.settle(col);
      }, SETTLE_DEBOUNCE_MS);
    },

    /** 吸附到最近项：更新选中值；年/月变化时重算日列并收拢越界日 */
    settle(col: ColName): void {
      const s = ext(this);
      const d = this.data;
      const index = Math.max(0, Math.round(s._scrollTop[col] / ITEM_H) - PAD_COUNT);
      let selYear = d.selYear;
      let selMonth = d.selMonth;
      let selDay = d.selDay;
      let days = d.days;
      const patch: { days?: number[]; selYear?: number; selMonth?: number; selDay?: number; yearTop?: number; monthTop?: number; dayTop?: number } = {};

      if (col === 'year') {
        selYear = d.years[Math.min(index, d.years.length - 1)];
      } else if (col === 'month') {
        selMonth = Math.min(12, Math.max(1, index + 1));
      } else {
        selDay = Math.min(d.days.length, Math.max(1, index + 1));
      }

      // 统一边界（第四阶段）：2015 下限 + 今天上限 + 大小月/闰年越界收拢。
      // 滚动吸附与初始化共用 clampSelectableDate，避免两处规则漂移。
      const clamped = clampSelectableDate(selYear, selMonth, selDay, MIN_YEAR, s._max);
      selYear = clamped.year;
      selMonth = clamped.month;
      selDay = clamped.day;
      patch.selYear = selYear;
      patch.selMonth = selMonth;
      patch.selDay = selDay;

      // 年/月变化 → 重算日列；越界收拢到月末
      if (!s._suppressDayRebuild && (col === 'year' || col === 'month')) {
        const rebuilt = this.buildDays(selYear, selMonth);
        if (rebuilt.length !== days.length) {
          days = rebuilt;
          patch.days = rebuilt;
        }
        if (selDay > days.length) {
          selDay = days.length;
          patch.selDay = selDay;
        }
      }

      const yearTop = (d.years.indexOf(selYear) + PAD_COUNT) * ITEM_H;
      const monthTop = (selMonth - 1 + PAD_COUNT) * ITEM_H;
      const dayTop = (selDay - 1 + PAD_COUNT) * ITEM_H;
      if (col === 'year') patch.yearTop = yearTop;
      if (col === 'month') patch.monthTop = monthTop;
      patch.dayTop = dayTop;

      this.setData(patch);

      // 吸附回弹：当前滚动位置与目标不一致时，setData scroll-top 触发对齐
      const target = col === 'year' ? yearTop : col === 'month' ? monthTop : dayTop;
      if (Math.abs(s._scrollTop[col] - target) > 0.5) {
        this.setData(col === 'year' ? { yearTop: target } : col === 'month' ? { monthTop: target } : { dayTop: target });
      }
    },

    /** 确定：回写选中日期 */
    onOk(): void {
      const d = this.data;
      const value = `${d.selYear}-${pad2(d.selMonth)}-${pad2(d.selDay)}`;
      if (!isValidDate(value)) return;
      this.triggerEvent('change', { value });
    },

    /** 取消 / 遮罩：关闭且不写值 */
    onCancel(): void {
      this.triggerEvent('close');
    },

    onMask(): void {
      this.triggerEvent('close');
    },

    /** 阻止冒泡占位 */
    noop(): void {
      // no-op
    },

    /** 今天：立即选中并关闭（与第一版「今天」快捷入口行为一致） */
    onToday(): void {
      this.triggerEvent('change', { value: todayISO8() });
    },
  },
});
