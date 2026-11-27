/** 隐私指引页（阶段 4）：独立可访问，说明数据用途与用户权利。 */

import type { CompatInfo } from '../../types';
import { getThemeBootstrap } from '../../utils/nav';
import { playPageEnter } from '../../utils/page-transition';

interface PrivacyData {
  compat: CompatInfo | null;
  /** 顶部安全偏移（px），注入为 --nav-safe-top（阶段 6） */
  navSafeTop: number;
  /** 入场序列：0=idle 隐藏，1/2=a/b 双类交替重播（阶段二） */
  pageEnterSeq: 0 | 1 | 2;
}

Page({
  data: {
    compat: null,
    navSafeTop: 0,
    pageEnterSeq: 0,
  } as PrivacyData,

  onLoad(): void {
    this.setData(getThemeBootstrap());
    playPageEnter(this); // 入场动画在 onLoad 末尾即触发，不等 onReady（第四轮 2.3）
  },
});
