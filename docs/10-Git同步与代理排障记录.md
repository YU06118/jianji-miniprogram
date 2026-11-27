# Git 同步与代理排障记录

## 背景

将本地「简记」微信小程序（TypeScript 重构版，阶段 1–7 交付）同步到 GitHub 仓库 `YU06118/jianji-miniprogram`。

## 关键发现

### 1. 远端与本地是两套结构

- 远端（v1.0.3 旧版）：原生 JS，`app.js` / `pages/` / `utils/` 在根目录，含 99KB 预览版 HTML + 10+ 份历史文档。
- 本地（新版）：TypeScript + 云函数，`miniprogram/` / `cloudfunctions/` / `docs/` / `scripts/`。

**处理**：用户确认「只同步和小程序有关的」→ 采用覆盖式同步，保留 git 历史可回溯，排除 `node_modules` / `project.private.config.json` / `.workbuddy`。

### 2. Windows Git 在代理环境下 HTTPS 推送失败

现象：

- `git clone`、`git ls-remote` 首次成功；
- 推送时 `schannel: server closed abruptly (missing close_notify)`；
- 切 `http.sslBackend=openssl` → `CONNECT tunnel failed, response 502`；
- `curl -x <proxy> https://github.com` 返回 200，说明代理本身正常；
- `git config --global http.proxy` 为空，但环境变量 `HTTPS_PROXY=http://127.0.0.1:55214` 生效。

**根因**：Git 的 schannel/openssl 与本地代理的 CONNECT 隧道兼容性问题，非网络中断、非认证问题。

**解决方案**：走 SSH 通道。

```bash
git remote set-url origin git@github.com:YU06118/jianji-miniprogram.git
GIT_SSH_COMMAND="ssh -o ConnectTimeout=15" git push origin main
```

推送成功：`1e33a8b..acb6bfd  main -> main`。

## 可复用检查清单

1. 推送前先 `git remote -v` 确认通道；HTTPS 反复报 schannel/502 → 直接切 SSH。
2. SSH 可用性预检：`ssh -o ConnectTimeout=10 -T git@github.com` 或 `git ls-remote git@github.com:...`。
3. 跨版本结构同步：先 clone 保留历史 → 清空工作树（保留 `.git`）→ 复制新代码 → 写 `.gitignore` → `add -A` → 核对 `A/D/M` 统计 → 提交推送。
4. 若 GitHub 凭据存于 Windows 凭据管理器：`printf "protocol=https\nhost=github.com\n\n" | git credential fill`。

## 结果

- 提交：`acb6bfd feat: 同步简记小程序 TypeScript 重构版（阶段1-7交付）`
- 变更：263 文件（新增 187 / 删除 73 / 修改 3），+19071 / −11242 行
- 仓库文件：190 个；本地与远端 HEAD 一致；`git status` 干净
- 仓库地址：https://github.com/YU06118/jianji-miniprogram
