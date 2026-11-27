/**
 * 页面转场单测（阶段二建立 / 第四轮 A 方案改写）：
 * 入场双类交替；退出改为直接 navigateBack（不 setData、不起 timer、不比较身份），
 * 含栈底 reLaunch 兜底与连点重入防护；tab 窗口判定。
 * 全局 getCurrentPages / wx / getApp 直接装配最小形状。
 */

import { playPageEnter, exitAndBack, playTabEnter } from '../page-transition';

interface FakePage {
  data: Record<string, unknown>;
  setData: jest.Mock;
  _exitRequested?: boolean;
}

function makePage(data: Record<string, unknown> = {}): FakePage {
  return {
    data: { ...data },
    setData: jest.fn(function (this: FakePage, patch: Record<string, unknown>) {
      Object.assign(this.data, patch);
    }),
  };
}

const g = globalThis as unknown as {
  getCurrentPages?: () => unknown[];
  wx?: Record<string, unknown>;
  getApp?: () => unknown;
};

const original = {
  getCurrentPages: g.getCurrentPages,
  wx: g.wx,
  getApp: g.getApp,
};

/** 装配栈：栈顶为 stack[stack.length - 1] */
function setStack(stack: unknown[]): void {
  g.getCurrentPages = () => stack;
}

function setWx(mock: Record<string, unknown>): void {
  g.wx = mock;
}

afterEach(() => {
  g.getCurrentPages = original.getCurrentPages;
  g.wx = original.wx;
  g.getApp = original.getApp;
});

describe('playPageEnter — 二级页入场', () => {
  it('从 idle(0) 切到 a(1)，setData 一次', () => {
    const page = makePage({ pageEnterSeq: 0 });
    playPageEnter(page);
    expect(page.setData).toHaveBeenCalledTimes(1);
    expect(page.setData).toHaveBeenCalledWith({ pageEnterSeq: 1 });
  });

  it('1→2、2→1 双类交替，保证每次进入必然重播', () => {
    const page = makePage({ pageEnterSeq: 1 });
    playPageEnter(page);
    expect(page.data.pageEnterSeq).toBe(2);
    playPageEnter(page);
    expect(page.data.pageEnterSeq).toBe(1);
  });

  it('data 缺字段时按 0 处理；无 setData 时安全返回', () => {
    const page = makePage();
    playPageEnter(page);
    expect(page.setData).toHaveBeenCalledWith({ pageEnterSeq: 1 });
    expect(() => playPageEnter(null)).not.toThrow();
    expect(() => playPageEnter({})).not.toThrow();
  });
});

describe('exitAndBack — 二级页退出（第四轮 A 方案：直接返回，无动画）', () => {
  it('栈底（仅一页）直接 reLaunch 首页，不 navigateBack', () => {
    const page = makePage();
    setStack([page]);
    const reLaunch = jest.fn();
    const navigateBack = jest.fn();
    setWx({ navigateBack, reLaunch });
    exitAndBack();
    expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/index/index' });
    expect(navigateBack).not.toHaveBeenCalled();
    expect(page.setData).not.toHaveBeenCalled();
  });

  it('栈深>1：立即调用一次 navigateBack，且不 setData（不给页面挂 pageExiting）', () => {
    const home = makePage();
    const detail = makePage();
    setStack([home, detail]);
    const navigateBack = jest.fn();
    setWx({ navigateBack, reLaunch: jest.fn() });

    exitAndBack();
    expect(navigateBack).toHaveBeenCalledTimes(1);
    expect(navigateBack).toHaveBeenCalledWith();
    expect(detail.setData).not.toHaveBeenCalled();
  });

  it('重入防护：连点两次只 navigateBack 一次', () => {
    const detail = makePage();
    setStack([makePage(), detail]);
    const navigateBack = jest.fn();
    setWx({ navigateBack, reLaunch: jest.fn() });

    exitAndBack();
    exitAndBack();
    expect(navigateBack).toHaveBeenCalledTimes(1);
  });

  it('不比较页面身份：栈顶对象每次返回不同引用也照样返回', () => {
    const detail = makePage();
    const navigateBack = jest.fn();
    setWx({ navigateBack, reLaunch: jest.fn() });
    let call = 0;
    g.getCurrentPages = () => (++call === 1 ? [makePage(), detail] : [makePage()]);

    expect(() => exitAndBack()).not.toThrow();
    expect(navigateBack).toHaveBeenCalledTimes(1);
  });
});

describe('playTabEnter — tab 窗口判定（第三轮回归）', () => {
  it('窗口内切 enterSeq 双类；窗口外不动', () => {
    const tab = makePage({ enterSeq: 0 });
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    g.getApp = () => ({ globalData: { lastTabSwitchAt: now - 100 } });
    playTabEnter(tab);
    expect(tab.data.enterSeq).toBe(1);

    g.getApp = () => ({ globalData: { lastTabSwitchAt: now - 2000 } });
    playTabEnter(tab);
    expect(tab.data.enterSeq).toBe(1); // 超窗不动
    jest.restoreAllMocks();
  });
});
