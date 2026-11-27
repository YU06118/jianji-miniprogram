/**
 * GlassCard — 液态玻璃四层基础容器（阶段 1 §4）
 * 四层：渐变底 + 毛玻璃填充 + 伪元素渐变描边/顶高光 + 噪点质感。
 * 降级：根节点 glass--fallback 时改用实色（见 wxss）。
 */
Component({
  /**
   * apply-shared：允许页面 wxss 命中组件内部节点。
   * extClass（home-overview / stats-overview 等 11 处）依赖页面样式注入布局，
   * 默认 isolated 会导致 flex 等布局失效（阶段 6 页面显示问题根因 1）。
   */
  options: {
    styleIsolation: 'apply-shared',
  },
  properties: {
    /** 是否显示内边距 */
    padded: { type: Boolean, value: true },
    /** 是否可点击（按压态反馈） */
    interactive: { type: Boolean, value: false },
    /** 自定义类名 */
    extClass: { type: String, value: '' },
  },
  methods: {
    onTap(): void {
      if (this.properties.interactive) {
        this.triggerEvent('tapcard');
      }
    },
  },
});
