/**
 * AmountPad — 自定义金额键盘（阶段 2）
 * 按键按压态（第二轮 C）：显式 pressedKey + touch 事件驱动，不依赖 hover-class；
 * 按压态用 transform，禁止触发重排；定时器可清理。
 */

/** 抬起回弹延迟（ms），对齐 theme.wxss --dur-micro */
const PRESS_RELEASE_MS = 120;

interface AmountPadInstance {
  _pressTimer?: ReturnType<typeof setTimeout>;
}

Component({
  properties: {
    /** 是否显示 */
    show: { type: Boolean, value: true },
  },
  data: {
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'] as string[],
    /** 当前按压的键值，空串表示无 */
    pressedKey: '',
  },
  lifetimes: {
    detached(): void {
      this.clearPressTimer();
    },
  },
  methods: {
    onKeyTouchStart(event: { currentTarget: { dataset: { key: string } } }): void {
      const self = this as unknown as AmountPadInstance;
      this.clearPressTimer();
      self._pressTimer = undefined;
      this.setData({ pressedKey: event.currentTarget.dataset.key });
    },

    onKeyTouchEnd(): void {
      this.scheduleRelease();
    },

    onKeyTouchCancel(): void {
      this.scheduleRelease();
    },

    scheduleRelease(): void {
      const self = this as unknown as AmountPadInstance;
      this.clearPressTimer();
      self._pressTimer = setTimeout(() => {
        self._pressTimer = undefined;
        this.setData({ pressedKey: '' });
      }, PRESS_RELEASE_MS);
    },

    clearPressTimer(): void {
      const self = this as unknown as AmountPadInstance;
      if (self._pressTimer !== undefined) {
        clearTimeout(self._pressTimer);
        self._pressTimer = undefined;
      }
    },

    onKeyTap(event: { currentTarget: { dataset: { key: string } } }): void {
      this.triggerEvent('key', { key: event.currentTarget.dataset.key });
    },
  },
});

/** 使文件成为模块，避免全局作用域常量冲突 */
export {};
