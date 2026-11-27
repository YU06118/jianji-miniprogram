/** 我的页（阶段 4）：分类/预算/数据/同步入口，隐私与协议可访问。 */

import type { CompatInfo } from '../../types';
import { getThemeBootstrap } from '../../utils/nav';
import { playTabEnter } from '../../utils/page-transition';

interface TabBarInstance {
  setData(data: { selected: number }): void;
}

interface MineData {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** tab 切换入场动画触发器 */
  /** tab 切换入场序号：0 初始不播；每次 tab 切换在 1/2 交替（第三轮双类方案） */
  enterSeq: 0 | 1 | 2;
  cloudEnabled: boolean;
}

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    enterSeq: 0,
    cloudEnabled: false,
  } as MineData,

  onLoad(): void {
    this.setData(getThemeBootstrap());
  },

  onShow(): void {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar() as unknown as TabBarInstance | undefined;
      if (tabBar) tabBar.setData({ selected: 2 });
    }
    playTabEnter(this);
  },

  goTo(event: { currentTarget: { dataset: { url: string } } }): void {
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },
});
