/**
 * 自定义 tabBar（阶段 1）：深色玻璃底 + 顶部渐变描边。
 * 基础库 2.5.0+ 支持；本项目最低 2.30.0 已覆盖（阶段 0 R5）。
 * 每个 tab 页下的实例不同，选中态由页面 onShow 通过 getTabBar 设置。
 * 阶段 6：attached 读取全局 compat 决定毛玻璃降级——组件 wxss 的
 * 跨界祖先选择器（.glass--fallback .tabbar）因样式隔离从未生效，改为组件内 class。
 * 按压态（第二轮 B / 第四轮重做）：hover（hover-start-time=0）+ touch 维护 pressedIndex 双保险，
 * 点已选中 tab 也播按压反馈（onTap 的 return 只阻止重复切页，不阻止按压）。
 * 第四轮：抬指后延迟 180ms 再清 pressedIndex、切页延后 160ms，让按压至少走完一帧；
 * 定时器挂实例并在 detached 清理，避免切页后残留。
 */

/** 抬指后按压态保持时长（ms），需 > hover-stay-time 才能与 hover 视觉重叠 */
const PRESS_RELEASE_DELAY_MS = 180;
/** 按下到切页的延迟（ms），让按压动画先播完再 switchTab */
const TAB_SWITCH_DELAY_MS = 160;

interface TabItem {
  pagePath: string;
  text: string;
  icon: string;
}

interface TabBarData {
  selected: number;
  /** 毛玻璃降级：不支持 backdrop-filter 的平台用实色底 */
  fallback: boolean;
  /** 当前按压项索引，-1 表示无按压 */
  pressedIndex: number;
  list: TabItem[];
}

/** 组件实例扩展字段（避免 any）：按压释放与切页延后定时器 */
interface TabBarInstance {
  _pressReleaseTimer: ReturnType<typeof setTimeout> | undefined;
  _switchTimer: ReturnType<typeof setTimeout> | undefined;
  setData(data: Partial<TabBarData>): void;
}

/** 取实例扩展字段（created 时已初始化） */
function ext(instance: unknown): TabBarInstance {
  return instance as TabBarInstance;
}

Component({
  data: {
    selected: 0,
    fallback: false,
    pressedIndex: -1,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '⌂' },
      { pagePath: '/pages/stats/index', text: '统计', icon: '◔' },
      { pagePath: '/pages/mine/index', text: '我的', icon: '○' },
    ] as TabItem[],
  } as TabBarData,
  lifetimes: {
    created(): void {
      const s = ext(this);
      s._pressReleaseTimer = undefined;
      s._switchTimer = undefined;
    },
    attached(): void {
      const app = getApp<{ globalData?: { compat?: { glassSupported?: boolean } | null } | undefined }>();
      const supported = app.globalData?.compat?.glassSupported;
      if (supported === false) {
        this.setData({ fallback: true });
      }
    },
    detached(): void {
      // 切页后清掉按压/切页定时器，避免旧实例残留（第四轮）
      const s = ext(this);
      if (s._pressReleaseTimer !== undefined) clearTimeout(s._pressReleaseTimer);
      if (s._switchTimer !== undefined) clearTimeout(s._switchTimer);
      s._pressReleaseTimer = undefined;
      s._switchTimer = undefined;
    },
  },
  methods: {
    onTouchStart(event: { currentTarget: { dataset: { index: number } } }): void {
      // 连点时重置清按压定时器，保证本次按下状态稳定渲染
      const s = ext(this);
      if (s._pressReleaseTimer !== undefined) clearTimeout(s._pressReleaseTimer);
      s._pressReleaseTimer = undefined;
      this.setData({ pressedIndex: event.currentTarget.dataset.index });
    },

    onTouchEnd(): void {
      // 不立即清：延迟 180ms，让按压动画走完（第四轮 3.2）
      const s = ext(this);
      if (s._pressReleaseTimer !== undefined) clearTimeout(s._pressReleaseTimer);
      s._pressReleaseTimer = setTimeout(() => {
        s._pressReleaseTimer = undefined;
        s.setData({ pressedIndex: -1 });
      }, PRESS_RELEASE_DELAY_MS);
    },

    onTouchCancel(): void {
      const s = ext(this);
      if (s._pressReleaseTimer !== undefined) clearTimeout(s._pressReleaseTimer);
      s._pressReleaseTimer = undefined;
      this.setData({ pressedIndex: -1 });
    },

    onTap(event: { currentTarget: { dataset: { index: number; path: string } } }): void {
      const { index, path } = event.currentTarget.dataset;
      if (index === this.data.selected) return; // 按压反馈已由 touch 层给出，这里只阻止重复切页
      // 切页延后 160ms：先让"按下去"渲染出来，再 switchTab（第四轮 3.2）
      const s = ext(this);
      if (s._switchTimer !== undefined) clearTimeout(s._switchTimer);
      s._switchTimer = setTimeout(() => {
        s._switchTimer = undefined;
        // 记录切换时间戳：目标 tab 页 onShow 据此判定是否播切换入场动画（page-transition.playTabEnter）
        const app = getApp<{ globalData?: { lastTabSwitchAt?: number } }>();
        if (app.globalData) app.globalData.lastTabSwitchAt = Date.now();
        wx.switchTab({ url: path });
      }, TAB_SWITCH_DELAY_MS);
    },
  },
});
