# BUG-ALL-01 修复记录（跨页同日小计重算）

> 触发：用户「按照《全项目代码检查报告》修复，然后自己控制电脑检查」（2026-11-26 23:18）
> 对应：`docs/全项目代码检查报告.md` §3 缺陷清单 BUG-ALL-01（P2，唯一待修项）
> 修复方式：报告建议的**方案 A**（合并时累加小计）
> 结论：**已修复 + 页面层回归 3 例 + 真机取证通过**，`npm run verify:all` EXIT 0。全项目验收可从「附条件通过」转为「通过」。

---

## 一、缺陷回顾

| 项 | 内容 |
|---|---|
| 位置 | `pages/index/index.ts` `onReachBottom()` 跨页同日合并分支 |
| 根因 | 第七阶段性能优化把「整组 setData」改为「路径 setData」；跨页同一天时只写 `patch[groups[i].records]`，**漏写 `groups[i].totalText`**，日小计停在首屏旧值 |
| 触发 | 某一天记录 > 20 条（一页），上拉加载第二页且第二页首条与已加载末组同日 |
| 现象 | 明细合并为 25 条，日小计仍显示 20.00，与明细对不上（用户可见的对账困惑） |
| 影响边界 | 仅展示层；不丢数据、不影响概览卡（全量聚合）、不影响存储与同步 |

---

## 二、修复实施

### 2.1 源码改动（`pages/index/index.ts`）

`onReachBottom()` 跨页同日合并分支：

```ts
if (lastIndex >= 0 && added[0] && groups[lastIndex].date === added[0].date) {
  const firstAdded = added.shift() as ViewGroup;
  const merged = [...groups[lastIndex].records, ...firstAdded.records];
  patch[`groups[${lastIndex}].records`] = merged;
  // BUG-ALL-01：跨页同日合并时重算该日小计，否则小计停留在第一页旧值。
  const oldCents = parseAmountToCents(groups[lastIndex].totalText) ?? 0;
  const addedCents = parseAmountToCents(firstAdded.totalText) ?? 0;
  patch[`groups[${lastIndex}].totalText`] = formatYuan(oldCents + addedCents);
}
```

- `import { formatYuan }` → `import { formatYuan, parseAmountToCents }`。
- **安全性**：`totalText` 由 `formatYuan(非负整数分)` 生成，`amountInCents` 在创建/编辑时均校验为非负整数，`groupByDay.totalInCents` 为纯求和，故 `totalText` 恒为非负，`parseAmountToCents` 反解不会因负号返回 null。`?? 0` 为兜底。
- 全程整数分运算，无浮点参与。

### 2.2 回归测试（新增 `utils/__tests__/index-reachbottom.test.ts`，3 例）

| 用例 | 构造 | 断言 |
|---|---|---|
| 跨页同日小计重算（核心） | 同日 25 条各 100 分，首页 20 条 20.00 + 上拉 5 条 5.00 | 小计 = **25.00**，记录数 25，page=1，loading=false |
| 跨页不同日 | 11-26 三条 + 11-25 一条 | 追加新分组，旧组小计 3.00 不变，新组 1.00 |
| 无更多数据 | queryRecords 返回空 | hasMore=false，分组不动 |

**页面层测试实现**：用 `global.Page` 捕获首页配置对象，mock `queryRecords` 造数，手写支持路径写入的 `setData`，直接调用真实 `onReachBottom`——覆盖报告指出的「现有 166 例无页面层路径 setData 覆盖」缺口。
**落点说明**：静态走查会扫描 `pages/**/*.ts` 要求四件套，故测试文件放 `utils/__tests__`，通过相对路径加载首页模块。

---

## 三、验证

### 3.1 自动化门禁

`npm run verify:all` **EXIT 0**：
- 静态走查 7 项全过
- tsc 0 错误
- ESLint 0 error / 0 warning
- Jest **16 套 / 169 例**全绿（原 166 + 本轮 3）
- 云函数语法通过

### 3.2 真机取证（用户要求「自己控制电脑检查」）

在 Windows 独立桌面的微信开发者工具（WeChatLib **3.18.1**，与真机走查基线一致）完成，全程 GUI 控制：

| 步骤 | 结果 |
|---|---|
| 启动开发者工具、加载项目 | 首页正常显示，热重载开启 |
| 临时注入同日 25 条（各 100 分）取证数据 | 概览支出 ¥25.00；分组标题 `2026-11-26 −¥20.00`（首屏 20 条旧小计）；列表见「取证-24」~「取证-19」 |
| 触发上拉加载第二页 | 分组标题从 `−¥20.00` 变为 **`−¥25.00`** ✅ 修复生效 |
| 清理 | 删除全部临时造数代码（零残留）；Console `wx.clearStorageSync()` 清空取证数据；注销独立桌面 |

**取证方法说明**：GUI 代理无法可靠输入含引号/大括号的长脚本，也无法稳定点击工具栏「编译」按钮，故采用「临时在 `onShow` 注入造数 + 热重载触发 onShow + 代码内自动调用一次 `onReachBottom()` 等价上拉」的方式取证，截图捕获小计从 20.00 → 25.00 的实测变化。临时代码验证后立即删除，`grep` 确认 `JJ-TEMP / jjtemp / seeded / _seedReachTimer` 零残留。

### 3.3 验收对照

| 报告 CONDITIONS | 状态 |
|---|---|
| 修复 BUG-ALL-01 | ✅ 方案 A，源码已改 |
| 补「同日跨页小计」回归用例 | ✅ 3 例页面层测试 |
| 真机取证 | ✅ 开发者工具 3.18.1 截图证明 20.00 → 25.00 |

**全项目验收结论：由「附条件通过」转为「通过」。**（真机 A/B/C 三组 25 项仍按阶段 5 走查清单由用户在自有设备执行，属环境限制非代码阻断。）

---

## 四、可复用经验

1. **路径 setData 的陷阱**：性能优化把整组替换改成路径写入时，任何「组内派生字段」（如小计、合计、计数）都必须同步 patch，否则派生值停留在旧态。这是增量更新的典型回归。
2. **反解展示串要保证非负**：用 `parseAmountToCents(totalText)` 反解小计的前提是 `totalText` 由非负整数分生成——本项目 `amountInCents` 有非负校验，成立；若未来允许负金额，需改存分数值而非反解字符串。
3. **页面层逻辑也能单测**：不必引入 miniprogram-simulate，用 `global.Page` 捕获配置 + mock service + 手写路径 setData，即可对真实页面方法做回归。
4. **真机取证的稳妥路径**：当 GUI 代理无法输入复杂脚本时，用「临时代码注入 + 热重载 + 代码内自动触发目标方法」替代手工操作，取证后立即删除临时代码并 grep 确认零残留。
