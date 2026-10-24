# 开发与发布指南

## 1. 本地检查与构建产物

开发与 CI 统一使用 Node.js 24（`.nvmrc`、`.node-version`），插件要求 Paseo 宿主版本 `>= 0.11.4`（`paseo-plugin.json`）。

```bash
npm ci
npm run check
```

- `npm run check` 是本地与 CI 统一的质量检查护栏，依次执行 Portal 产物校验（`check:portal`）、类型检查（`typecheck`）、测试（`test`）、ESLint（`lint`）、Prettier 格式检查（`format:check`）及发布包结构校验（`check:package`）。
- 宽屏 Web 弹窗使用 React DOM 19.1.0 的 `createPortal` 预打包产物（位于 `client/platform/generated/`）。升级 React DOM 或构建脚本后，运行 `npm run build:portal` 重新生成并提交产物。

## 2. 本地宿主调试

1. 确认目标 Paseo 守护进程配置（`<home>/config.json`）已开启 `pluginsEnabled: true`，可通过 `paseo daemon status --json` 检查运行状态。
2. 链接本地源码或安装打包产物：
   ```bash
   # 源码链接调试（修改后可执行 paseo plugin reload paseo-kanban 热重载）
   paseo plugin link /absolute/path/to/paseo-kanban

   # 或安装本地 tarball 验证打包产物
   PACKAGE_TARBALL=$(npm pack --silent)
   paseo plugin install "./$PACKAGE_TARBALL"
   ```
3. 运行 `paseo plugin ls` 确认 `paseo-kanban` 处于 `running` 状态；排障时可执行 `paseo plugin logs paseo-kanban` 查看日志。

## 3. 发布流程

### 3.1 前置准备

发布通过 [GitHub Actions Release 工作流](../.github/workflows/release.yml) 在版本 tag（`v<version>`）上触发，自动发布带有 provenance 的 npm 包并创建 GitHub Release：

1. **NPM 凭据**：仓库 Actions Secret 已配置具备发布权限且开启 Bypass 2FA 的 `NPM_TOKEN`。
2. **质量与宿主验证**：本地通过 `npm run check` 并在 Paseo 宿主中完成冒烟验证。
3. **版本说明**：在 `CHANGELOG.md` 顶部按中英双语规范追加版本说明，按需同步 `README.md`、`README.zh-CN.md` 与 `OVERVIEW.md`。

### 3.2 发布步骤

```bash
VERSION="0.1.4" # 替换为目标版本号

npm version "$VERSION" --no-git-tag-version --ignore-scripts
# 更新 CHANGELOG.md（及 README / OVERVIEW.md）
npm run check
git add package.json package-lock.json CHANGELOG.md README.md README.zh-CN.md OVERVIEW.md
git commit -m "chore(release): $VERSION"
git tag -a "v$VERSION" -m "v$VERSION"
git push --atomic origin main "refs/tags/v$VERSION"
gh workflow run release.yml --ref "v$VERSION"
```

### 3.3 校验与异常恢复

- **本地复核**：发布后可运行 `npm run verify:release`，核对 npm 元数据、tarball 与本地待打包文件的一致性。
- **重试恢复**：若因网络或凭据问题失败，修复后在同一 tag 上重跑工作流；若 npm 已发布成功而后续步骤失败，重跑工作流会自动跳过重复发包并补齐校验与 GitHub Release。
- **版本不可变**：已发布的 npm 版本与 git tag 不可覆盖或移动；如需修正包内容，必须递增版本号发布新版本。
