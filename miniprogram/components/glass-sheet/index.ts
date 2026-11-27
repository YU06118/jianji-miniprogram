/**
 * GlassSheet — 底部抽屉式弹层（阶段 1 §4.4）
 * 打开：translateY + 透明度 + 遮罩同步淡入；关闭：反向播放，禁止瞬时消失。
 * 关闭动画结束后才触发 close 事件并隐藏节点（避免内容闪现）。
 */
Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    /** 是否显示顶部拖拽条 */
    handle: { type: Boolean, value: true },
  },
  data: {
    visible: false,
    animating: false,
  },
  observers: {
    show(value: boolean): void {
      if (value) {
        this.setData({ visible: true });
        // 下一帧置 active，确保初始态先渲染，动画才生效
        wx.nextTick(() => this.setData({ animating: true }));
      } else if (this.data.visible) {
        this.setData({ animating: false });
        // 与退出时长 --dur-medium(320ms) 配对
        setTimeout(() => {
          if (!this.data.animating) {
            this.setData({ visible: false });
            this.triggerEvent('closed');
          }
        }, 320);
      }
    },
  },
  methods: {
    onMaskTap(): void {
      this.triggerEvent('close');
    },
    onSheetTap(): void {
      // 阻止冒泡到遮罩，避免点内容误关闭
    },
    onExit(): void {
      this.triggerEvent('close');
    },
  },
});
