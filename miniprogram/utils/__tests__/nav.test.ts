/**
 * 顶部安全区计算单测（阶段 6）：胶囊矩形优先、异常兜底、statusBar 兜底三分支。
 * nav.ts 依赖 wx 全局，这里直接装配最小 wx 形状。
 */

import { computeNavSafeTop, isRecentTabSwitch } from '../nav';

/** 设置 wx 全局（每次用例重装，避免分支间污染） */
function setupWx(impl: {
  rect?: { top: number; bottom: number; width: number; height: number } | null;
  rectFn?: boolean;
  statusBarHeight?: number;
  hasSnapshotAPIs?: boolean;
}): void {
  const g = globalThis as unknown as { wx?: Record<string, unknown> };
  const wxMock: Record<string, unknown> = {};
  if (impl.rectFn !== false) {
    wxMock.getMenuButtonBoundingClientRect = (): { top: number; bottom: number; width: number; height: number } => {
      if (!impl.rect) throw new Error('rect unavailable');
      return impl.rect;
    };
  }
  if (impl.hasSnapshotAPIs) {
    wxMock.getAppBaseInfo = (): { SDKVersion: string } => ({ SDKVersion: '3.0.0' });
    wxMock.getDeviceInfo = (): { platform: string } => ({ platform: 'devtools' });
    wxMock.getWindowInfo = (): { statusBarHeight: number } => ({ statusBarHeight: impl.statusBarHeight ?? 0 });
  } else {
    wxMock.getSystemInfoSync = (): { platform: string; SDKVersion: string; statusBarHeight: number } => ({
      platform: 'devtools',
      SDKVersion: '3.0.0',
      statusBarHeight: impl.statusBarHeight ?? 0,
    });
  }
  g.wx = wxMock;
}

/** 第七阶段：装配最小 getApp 形状 */
function setupApp(lastTabSwitchAt?: number): void {
  const g = globalThis as unknown as { getApp?: unknown };
  g.getApp = () => ({
    globalData: lastTabSwitchAt === undefined ? {} : { lastTabSwitchAt },
  });
}

afterEach(() => {
  const g = globalThis as unknown as { wx?: unknown; getApp?: unknown };
  delete g.wx;
  delete g.getApp;
});

describe('computeNavSafeTop', () => {
  it('胶囊矩形有效：bottom + 8', () => {
    setupWx({ rect: { top: 47, bottom: 83, width: 87, height: 32 }, statusBarHeight: 47 });
    expect(computeNavSafeTop()).toBe(91);
  });

  it('胶囊矩形异常（width=0）：回退 statusBar + 44', () => {
    setupWx({ rect: { top: 0, bottom: 0, width: 0, height: 0 }, statusBarHeight: 47 });
    expect(computeNavSafeTop()).toBe(91);
  });

  it('胶囊接口不存在：回退 statusBar + 44', () => {
    setupWx({ rectFn: false, statusBarHeight: 54 });
    expect(computeNavSafeTop()).toBe(98);
  });

  it('胶囊抛错 + statusBar 缺失：回退 0 + 44', () => {
    setupWx({ rect: null, statusBarHeight: 0 });
    expect(computeNavSafeTop()).toBe(44);
  });
});

describe('isRecentTabSwitch（第七阶段：tab 切换跳过同月刷新）', () => {
  it('切换后 500ms 内视为 tab 切换窗口', () => {
    setupApp(10_000);
    expect(isRecentTabSwitch(10_500)).toBe(true);
  });

  it('超过 800ms 窗口后不再跳过刷新', () => {
    setupApp(10_000);
    expect(isRecentTabSwitch(10_800)).toBe(false);
  });

  it('从未切换过 tab 时返回 false', () => {
    setupApp();
    expect(isRecentTabSwitch(Date.now())).toBe(false);
  });

  it('异常的未来时间戳不误判为窗口内', () => {
    setupApp(20_000);
    expect(isRecentTabSwitch(10_000)).toBe(false);
  });
});
