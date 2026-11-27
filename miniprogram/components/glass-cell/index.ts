/**
 * GlassCell — 设置项玻璃单元格（阶段 1 §4）
 * 按压态（交互修复第二轮 C）：显式 pressed 状态 + touch 事件驱动，不依赖 hover-class。
 */

/** 抬起回弹延迟（ms），对齐 theme.wxss --dur-micro */
const PRESS_RELEASE_MS = 120;

interface GlassCellInstance {
  _pressTimer?: ReturnType<typeof setTimeout>;
}

Component({
  properties: {
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    icon: { type: String, value: '' },
    /** 是否显示右侧箭头 */
    arrow: { type: Boolean, value: true },
    /** 右侧值文本 */
    value: { type: String, value: '' },
    /** 危险操作（红色文字） */
    danger: { type: Boolean, value: false },
    /** 自定义右侧插槽 */
    useSlot: { type: Boolean, value: false },
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
      const self = this as unknown as GlassCellInstance;
      this.clearPressTimer();
      self._pressTimer = setTimeout(() => {
        self._pressTimer = undefined;
        this.setData({ pressed: false });
      }, PRESS_RELEASE_MS);
    },

    clearPressTimer(): void {
      const self = this as unknown as GlassCellInstance;
      if (self._pressTimer !== undefined) {
        clearTimeout(self._pressTimer);
        self._pressTimer = undefined;
      }
    },

    onTap(): void {
      this.triggerEvent('tapcell');
    },
  },
});

/** 使文件成为模块，避免全局作用域常量冲突 */
export {};
