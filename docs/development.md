# 开发与发布指南

## 1. 本地检查与构建产物

开发与 CI 统一使用 Node.js 24（`.nvmrc`、`.node-version`），插件要求 Paseo 宿主版本 `>= 0.11.4`（`paseo-plugin.json`）。

```bash
npm ci
npm run check
```

- 运行 `npm run check` 执行全套校验。命令依次执行以下检查：
  1. `check:portal`：校验 Portal 打包产物。
  2. `typecheck`：执行 TypeScript 类型检查。
  3. `test`：运行自动化测试。
  4. `lint`：执行 ESLint 代码检查。
  5. `format:check`：检查 Prettier 代码格式。
  6. `check:package`：校验发布包文件结构。
- 宽屏 Web 弹窗使用 React DOM 19.1.0 的 `createPortal` 预打包产物（位于 `client/platform/generated/`）。升级 React DOM 或修改构建脚本后，运行 `npm run build:portal` 重新生成并提交产物。

## 2. 本地宿主调试

1. 确认目标 Paseo 守护进程配置（`<home>/config.json`）已开启 `pluginsEnabled: true`，可通过 `paseo daemon status --json` 检查运行状态。
2. 链接本地源码或安装打包产物：
   ```bash
   # 源码链接调试
   paseo plugin link .

   # 修改代码后热重载插件
   paseo plugin reload paseo-kanban

   # 或安装本地打包产物验证
   PACKAGE_TARBALL=$(npm pack --silent)
   paseo plugin install "./$PACKAGE_TARBALL"
   ```
3. 运行 `paseo plugin ls` 确认 `paseo-kanban` 处于 `running` 状态。排障时可执行 `paseo plugin logs paseo-kanban` 查看日志。

## 3. 发布流程

### 3.1 前置准备

发布通过 [GitHub Actions Release 工作流](../.github/workflows/release.yml) 在版本 tag（`v<version>`）上触发，自动发布带有 provenance 的 npm 包并创建 GitHub Release：

1. **NPM 凭据**：仓库 Actions Secret 已配置具备发布权限且开启 Bypass 2FA 的 `NPM_TOKEN`。
2. **质量与宿主验证**：本地通过 `npm run check` 并在 Paseo 宿主中完成冒烟验证。
3. **版本说明**：在 `CHANGELOG.md` 顶部按中英双语规范追加版本说明，并在文档中同步更新版本号。

### 3.2 发布步骤

```bash
VERSION="0.1.4" # 替换为目标版本号

# 1. 更新版本号
npm version "$VERSION" --no-git-tag-version --ignore-scripts

# 2. 更新 CHANGELOG.md 与相关文档后执行校验
npm run check

# 3. 提交发布变更并打标签
git add package.json package-lock.json CHANGELOG.md README.md README.zh-CN.md OVERVIEW.md
git commit -m "chore(release): $VERSION"
git tag -a "v$VERSION" -m "v$VERSION"
git push --atomic origin main "refs/tags/v$VERSION"
gh workflow run release.yml --ref "v$VERSION"
```

### 3.3 校验与异常恢复

- **本地复核**：发布后可运行 `npm run verify:release`，核对 npm 元数据、tarball 与本地待打包文件的一致性。
- **重试恢复**：若因网络或凭据问题失败，修复后在同一 tag 上重跑工作流。若 npm 已发布成功而后续步骤失败，重跑工作流会自动跳过重复发包并补齐校验与 GitHub Release。
- **版本不可变**：已发布的 npm 版本与 git tag 不可覆盖或移动。如需修正包内容，必须递增版本号发布新版本。

## 4. 官方市场素材规范

按照 Paseo 官方插件发布规范（Paseo >= 0.11.0），插件展示素材遵循以下约定：

1. **清单声明**：在 `paseo-plugin.json` 中配置 `icon`（512×512 PNG 图标）与 `media` 数组（首张为插件市场卡片缩略图，后续为各核心特性截图）。
2. **发布包包含素材**：`package.json` 的 `files` 字段必须包含 `"assets/"`，确保发布至 npm 的包体包含静态素材文件。
3. **命名约定**：素材文件统一存放于 `assets/marketplace/`，采用语义化命名（如 `board-overview.png`、`send-to-agent.png`、`drag-and-drop.png`、`github-issue-import.png`、`task-editor.png`），不绑定临时版本号。
4. **官方 Registry 映射**：官方插件注册表（`getpaseo/plugins`）在收录或版本更新时，会将媒体素材映射为当前版本固定 commit SHA 的公开 HTTPS URL。截图必须使用虚构示例数据，严禁泄露真实凭据或私有项目内容。
