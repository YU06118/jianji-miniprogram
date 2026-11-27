/**
 * GlassButton — 玻璃质感按钮（阶段 1 §4）
 * 按压态（交互修复第二轮 C）：显式 pressed 状态 + touch 事件驱动，
 * 不依赖 hover-class（重渲染即丢、快速点按不触发）；抬起延迟 120ms（--dur-micro）回弹，
 * 定时器可清理；variant/loading/disabled 变化不打断按压态，disabled 无按压不闪。
 */

/** 抬起回弹延迟（ms），对齐 theme.wxss --dur-micro */
const PRESS_RELEASE_MS = 120;

interface GlassButtonInstance {
  _pressTimer?: ReturnType<typeof setTimeout>;
}

Component({
  properties: {
    /** 主按钮 / 次级按钮 */
    variant: { type: String, value: 'primary' },
    /** 是否禁用 */
    disabled: { type: Boolean, value: false },
    /** 是否为块级（占满宽度） */
    block: { type: Boolean, value: false },
    /** 加载态 */
    loading: { type: Boolean, value: false },
    /** 开放能力：如 phoneNumber / agreePrivacyAuthorization；空串表示无 */
    openType: { type: String, value: '' },
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
      if (this.properties.disabled || this.properties.loading) return;
      this.clearPressTimer();
      this.setData({ pressed: true });
    },

    onTouchEnd(): void {
      this.scheduleRelease();
    },

    onTouchCancel(): void {
      this.scheduleRelease();
    },

    /** 抬起后延迟 120ms 释放按压态（回弹可见），定时器可清理 */
    scheduleRelease(): void {
      const self = this as unknown as GlassButtonInstance;
      this.clearPressTimer();
      self._pressTimer = setTimeout(() => {
        self._pressTimer = undefined;
        this.setData({ pressed: false });
      }, PRESS_RELEASE_MS);
    },

    clearPressTimer(): void {
      const self = this as unknown as GlassButtonInstance;
      if (self._pressTimer !== undefined) {
        clearTimeout(self._pressTimer);
        self._pressTimer = undefined;
      }
    },

    onTap(): void {
      if (this.properties.disabled || this.properties.loading) return;
      this.triggerEvent('tapbutton');
    },
  },
});

/** 使文件成为模块，避免全局作用域常量冲突 */
export {};
