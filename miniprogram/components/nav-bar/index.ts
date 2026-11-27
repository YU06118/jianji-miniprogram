/**
 * NavBar（交互修复第一批）：二级页返回导航栏。
 * 左侧返回箭头（44×44 热区），中间标题，与胶囊对齐。
 * 返回逻辑统一走 page-transition.exitAndBack：栈深 >1 直接 navigateBack，
 * 栈底（无上级页面）时 reLaunch 回首页兜底（第四轮 A 方案已删自绘退出动画）。
 * 按压态（第二轮 C）：显式 pressed + touch 事件，返回行为零改动。
 * 右侧操作位（第五阶段）：具名 slot "action"，页面按需传入，不传则留白。
 */

import { exitAndBack } from '../../utils/page-transition';

/** 抬起回弹延迟（ms），对齐 theme.wxss --dur-micro */
const PRESS_RELEASE_MS = 120;

interface NavBarInstance {
  _pressTimer?: ReturnType<typeof setTimeout>;
}

Component({
  /** 开启具名 slot：左侧返回 + 右侧 action 操作位 */
  options: { multipleSlots: true },

  properties: {
    /** 居中标题 */
    title: { type: String, value: '' },
    /** 是否显示返回箭头（默认显示） */
    showBack: { type: Boolean, value: true },
  },

  data: {
    pressed: false,
  },

  lifetimes: {
    detached(): void {
      this.clearPressTimer();
    },
  },

  methods: {
    onTouchStart(): void {
      this.clearPressTimer();
      this.setData({ pressed: true });
    },

    onTouchEnd(): void {
      this.scheduleRelease();
    },

    onTouchCancel(): void {
      this.scheduleRelease();
    },

    scheduleRelease(): void {
      const self = this as unknown as NavBarInstance;
      this.clearPressTimer();
      self._pressTimer = setTimeout(() => {
        self._pressTimer = undefined;
        this.setData({ pressed: false });
      }, PRESS_RELEASE_MS);
    },

    clearPressTimer(): void {
      const self = this as unknown as NavBarInstance;
      if (self._pressTimer !== undefined) {
        clearTimeout(self._pressTimer);
        self._pressTimer = undefined;
      }
    },

    onBack(): void {
      exitAndBack();
    },
  },
});
