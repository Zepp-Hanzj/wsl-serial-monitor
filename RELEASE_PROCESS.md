# VS Code 插件推送远端与商城发版流程

## 适用场景

用于维护 `wsl-serial-monitor` 这类 VS Code 扩展时，完成以下两项发布动作：

- 推送最新代码到 GitHub 远端
- 更新 Visual Studio Code Marketplace 中的扩展版本

## 仓库信息

- 仓库目录：`/home/hanzj/workspace/tools/serial-monitor`
- GitHub 仓库：`https://github.com/Zepp-Hanzj/wsl-serial-monitor`
- 商店扩展 ID：`Roger-Han.wsl-serial-monitor`

## 发布前检查

1. 进入仓库目录。
2. 确认工作区改动符合预期。
3. 更新扩展版本号。
4. 检查 `package.json` 中的 `repository`、`bugs`、`homepage` 是否指向正确仓库。
5. 检查 `README.md` 中的版本号、VSIX 文件名、仓库链接是否已同步。

建议先执行：

```bash
cd /home/hanzj/workspace/tools/serial-monitor
git status --short
git branch --show-current
git remote -v
```

## 修改版本号

编辑 `package.json`：

- 将 `version` 从旧版本递增为新版本，例如 `0.2.10` -> `0.2.11`
- 确认以下字段正确：

```json
"repository": {
  "type": "git",
  "url": "https://github.com/Zepp-Hanzj/wsl-serial-monitor"
},
"bugs": {
  "url": "https://github.com/Zepp-Hanzj/wsl-serial-monitor/issues"
},
"homepage": "https://github.com/Zepp-Hanzj/wsl-serial-monitor#readme"
```

同时更新 `README.md` 中：

- 首页版本徽章
- VSIX 文件名
- 仓库 clone 地址

## 构建与打包验证

先编译，再打包：

```bash
cd /home/hanzj/workspace/tools/serial-monitor
npm run compile
npx @vscode/vsce package
```

期望结果：

- 编译成功，无 TypeScript 错误
- 生成新的 VSIX，例如 `wsl-serial-monitor-0.2.11.vsix`

如需本地安装验证，可执行：

```bash
code --install-extension wsl-serial-monitor-0.2.11.vsix --force
```

## 提交并推送远端

确认需要提交的文件后执行：

```bash
cd /home/hanzj/workspace/tools/serial-monitor
git add package.json README.md media/serial-monitor.js src/extension.ts src/serialMonitorView.ts src/serialPort.ts
git commit -m "Release 0.2.11"
git push origin master
```

说明：

- `git add` 中文件列表可按实际变更调整
- `commit message` 建议直接使用版本号，便于后续检索
- 当前分支示例为 `master`，如果以后改为 `main`，命令也要同步修改

## 发布到 VS Code Marketplace

在仓库目录执行：

```bash
cd /home/hanzj/workspace/tools/serial-monitor
npx @vscode/vsce publish
```

成功后通常会看到类似输出：

```text
Publishing 'Roger-Han.wsl-serial-monitor v0.2.11'...
Extension URL: https://marketplace.visualstudio.com/items?itemName=Roger-Han.wsl-serial-monitor
DONE Published Roger-Han.wsl-serial-monitor v0.2.11.
```

## 本次实操记录

本次实际发布使用的是以下版本与结果：

- 发布版本：`0.2.11`
- Git 提交：`待本次发布后更新`
- 推送分支：`origin/master`
- 商店发布结果：成功

本次发布命令顺序为：

```bash
cd /home/hanzj/workspace/tools/serial-monitor
npm run compile
npx @vscode/vsce package
git add package.json README.md media/serial-monitor.js src/extension.ts src/serialMonitorView.ts src/serialPort.ts
git commit -m "Release 0.2.11"
git push origin master
npx @vscode/vsce publish
```

## 常见问题

### 1. `vsce publish` 成功，但商店页面没立刻刷新

这是正常现象，Marketplace 通常会有几分钟延迟。

### 2. 提示凭据存储失败

可能出现类似提示：

```text
Failed to open credential store. Falling back to storing secrets clear-text in: /home/hanzj/.vsce
```

说明：

- 不影响本次发布成功
- 但表示本机的发布凭据回退到了明文存储
- 如果后续需要加强安全性，应单独处理本机 `vsce` 凭据配置

### 3. 打包成功但发布失败

优先检查：

- `publisher` 是否正确
- 本机是否已配置可用的 Marketplace token
- 版本号是否已递增，Marketplace 不允许重复发布同一版本

### 4. 推送失败

优先检查：

- 当前分支是否正确
- GitHub 远端权限是否正常
- 本地是否存在未解决冲突

## 建议的固定发布清单

每次发布前按下面顺序执行：

1. 更新 `package.json` 版本号。
2. 同步 `README.md` 中的版本号和仓库信息。
3. 运行 `npm run compile`。
4. 运行 `npx @vscode/vsce package`。
5. 提交并推送 Git。
6. 运行 `npx @vscode/vsce publish`。
7. 打开 Marketplace 页面确认版本已更新。

## 参考链接

- GitHub：`https://github.com/Zepp-Hanzj/wsl-serial-monitor`
- Marketplace：`https://marketplace.visualstudio.com/items?itemName=Roger-Han.wsl-serial-monitor`
- Publisher Hub：`https://marketplace.visualstudio.com/manage/publishers/Roger-Han/extensions/wsl-serial-monitor/hub`
