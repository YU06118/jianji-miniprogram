/** 关于页（阶段 4）：版本与说明。 */

import type { CompatInfo } from '../../types';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter } from '../../utils/page-transition';

interface AboutData {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
  pageEnterSeq: 0 | 1 | 2;
  version: string;
}

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    pageEnterSeq: 0,
    version: '1.0.0',
  } as AboutData,

  onLoad(): void {
    this.setData(getThemeBootstrap());
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },
});
