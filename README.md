# 简记 · 微信小程序

轻量、克制的个人记账工具。核心体验：打开即记、一眼看清。

## 阶段进度

- [x] 阶段 0：技术方案（`docs/阶段0/阶段0-技术方案.md`）
- [x] 阶段 1：骨架（工程配置 / token / 玻璃组件 / 存储与工具 / 单测）
- [x] 阶段 2：记账与列表（记一笔抽屉 / 账单列表 / 分类管理 / 搜索详情）

- [x] 阶段 3：统计与预算（环形占比 / 趋势柱图 / 预算进度）
- [x] 阶段 4：数据与同步（导出导入 / 隐私合规 / 云同步可插拔 / 云函数）
- [x] 阶段 5：走查交付（真机清单 / 静态走查脚本 / 用户手册 / 最终回归；真机项待用户执行）

## 环境准备

| 项 | 版本 / 说明 |
|---|---|
| 微信开发者工具 | Stable 版（支持 TS 编译插件） |
| Node.js | ≥ 18（项目本地验证使用 v22） |
| npm | ≥ 8 |
| 基础库最低版本 | **2.30.0** |
| 框架 | 原生小程序 + TypeScript |
| 渲染引擎 | WebView（默认，不启用 Skyline） |

## 快速开始

```bash
# 1) 安装开发依赖
npm install

# 2) 类型检查 / 单测 / 代码规范
npm run typecheck
npm test
npm run lint

# 3) 导入微信开发者工具
#    选择本目录为项目根目录；project.config.json 已配置真实 AppID、
#    miniprogramRoot = "miniprogram/"、cloudfunctionRoot = "cloudfunctions/"
#    注意：游客模式 touristappid 无法使用云同步（P0 记账功能不受影响）
```

### TypeScript 编译方式（阶段 1 验证结论）

`project.config.json` 中已配置 `useCompilerPlugins: ["typescript"]`，即由**微信开发者工具内置 TS 编译插件**直接把 `miniprogram/**/*.ts` 编译为同目录 JS，**无需额外的 tsc 预编译步骤**。命令行 `npm run typecheck` 仅用于 CI/本地类型校验，不产出运行文件。

> 阶段 0 方案曾写「tsc 预编译输出 JS」，阶段 1 验证后采用开发者工具内置插件（零构建、导入即编译），这是实现层面的优化，不改变原生 + TS 的技术选型。

### npm 构建

当前阶段无第三方运行时依赖，`miniprogram_npm` 尚未生成。后续引入第三方库时，在微信开发者工具中执行「工具 → 构建 npm」，并把 `miniprogram_npm` 纳入包体积统计。

## 云开发初始化（阶段 4 已接入）

云同步为可插拔模块，默认关闭；不部署云开发也不影响 P0 记账。完整步骤见 **`docs/阶段4/阶段4-云同步部署说明.md`**：

1. 确认 `project.config.json` 已配置真实 AppID 与 `"cloudfunctionRoot": "cloudfunctions/"`（均已就位）；游客模式 `touristappid` 无法用云开发。
2. 创建集合 `accounts` / `records` / `budgets`，按部署说明建索引。
3. 权限设为「仅创建者可读写」：
   ```json
   { "read": "doc._openid == auth.openid", "write": "doc._openid == auth.openid" }
   ```
4. 上传部署 `cloudfunctions/sync` 云函数，再在「我的 → 云同步」开启。

## 兼容与降级

| 能力 | 最低版本 | 降级策略 |
|---|---|---|
| 隐私接口 `wx.requirePrivacyAuthorize` | 2.32.3 | 2.30.0～2.32.2 不调用隐私接口，首次用相册/摄像头前弹窗说明后阻断该能力 |
| 自定义 tabBar | 2.5.0 | 本项目 2.30.0 已覆盖 |
| Canvas 2d（阶段 3 图表） | 2.9.0 | 本项目 2.30.0 已覆盖（2.7.0 是 webgl，非 2d） |
| `backdrop-filter` | 真机差异 | JS 侧判定平台，根节点加 `glass--fallback`，改实色 + 强化描边 |
| Skyline | 3.0.2 | 默认不启用，回退 WebView + CSS 动画 |

精确的平台支持矩阵（`backdrop-filter`）wxss 无法特性检测，列为阶段 5 真机验证项。

## 目录结构

```
├── miniprogram/
│   ├── app.ts / app.json / app.wxss      入口与全局配置
│   ├── theme.wxss                        设计 token 唯一来源
│   ├── sitemap.json
│   ├── custom-tab-bar/                   自定义 tabBar（深色玻璃）
│   ├── components/                       glass-card / glass-button / glass-sheet / glass-cell
│   ├── pages/                            主包页面（index/stats/mine + 二级页）
│   ├── subpackages/cloud/                云同步分包（P1）
│   ├── services/                         统计聚合 / 导入校验 / 同步（纯逻辑）
│   ├── utils/                            金额 / 日期 / 存储 / 迁移 / 兼容 / 日志
│   ├── types/                            全局类型定义
│   └── assets/                           仅 ≤2 KB 噪点纹理（如需）
├── docs/                                 阶段方案文档
├── tests / __tests__                     与被测文件同目录的纯逻辑单测
├── project.config.json / tsconfig.json / jest.config.js / .eslintrc.js / .prettierrc
└── README.md
```

## 设计规范要点

- 所有颜色 / 圆角 / 间距 / 字号 / 阴影 / 动效只来自 `theme.wxss` 的 CSS 变量；页面 wxss 禁止出现十六进制色值、rgba 字面量、写死 duration。
- 金额以「分」整数存储与计算，禁止浮点；展示层才格式化为元（分位截断到两位）。
- 时间存 ISO 8601 字符串 + 毫秒双字段，展示按东八区（UTC+8）。
- 收支区分不仅靠颜色，必须带 `+` / `−` 符号。
- 动效只用 `transform` / `opacity`；长列表不做 `setData` 高频驱动。

## 已知限制（阶段 1）

- 页面除首页外均为骨架占位，业务内容按阶段计划填充。
- 图表、预算、云同步、导入导出 UI 尚未接入（对应阶段 3/4）。
- `backdrop-filter` 的 Android 支持矩阵待阶段 5 真机走查确认，当前保守走降级样式。
