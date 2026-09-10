# @deepseek-ai/dsh-client-hqst

Web 端「会话历史提问侧栏」插件：在页面右上角贡献一个浮动面板，列出当前会话中所有用户提问，点击任意一条即可跳转到对应消息并短暂高亮。纯 UI 插件，不接触任何提示词、消息、工具结果，也不向提供方发起请求。

## 效果

- **展开态**：右上角 300px 浮动面板（`dsh-hq-root`），标题「历史提问 (N)」，逐条列出提问文本（最多 2 行截断）与时间；点击某条 → 平滑滚动到该消息居中，并以品牌色外圈高亮 1.2s。
- **收起态**：面板右上角「—」按钮折叠为一个浮动胶囊（`dsh-hq-fab`）「历史提问 (N)」，点击重新展开。
- **空态**：当前会话暂无提问时，面板内显示「暂无历史提问」。

## 实现方式

| 半 | 文件 | 职责 |
| --- | --- | --- |
| Node 半 | `lib/index.js` | 空 `apply()`，仅为让插件在宿主 `cordis.yml` / Loader 中可见；无任何宿主侧行为 |
| 客户端半 | `lib/client.js` | 实际 UI，经 `exports["./client"]` + `package.json` 的 `dsh.client` 声明被 Web 宿主发现 |

客户端半行为：

1. 通过 `inject: ["slots", "sessions"]` 取两个必需服务，缺失则打警告并禁用面板。
2. 在 `shell.overlay` 槽位注册 `question-history`（`order: 100`）。
3. 通过 `sessions.binding(currentId)` 取得当前会话 face，`getSnapshot()` 取初始快照、`subscribe()` 跟踪更新。
4. `extractQuestions` 从 `chat.order` × `chat.nodes` 中筛出 `kind === "user" | "steering"` 节点，拼接其文本块并折叠空白。
5. `jumpTo` 优先用 DSH 内部锚点属性 `[data-chat-anchor-key]`，降级尝试 `[data-message-key]`、`[data-node-key]`，避免宿主升级改属性名导致跳转静默失效。
6. 样式全部使用 `dsw-alias-*` / `dsw-shadow-*` 主题令牌，无硬编码色值。

## 安装

本目录即一个**可直接分发的预构建包**（仅含编译产物 `lib/` 与 `package.json`，无源码、无构建脚本、无 `.d.ts`）：

```
node_modules/@deepseek-ai/dsh-client-hqst/
  lib/index.js      # node 半
  lib/client.js     # 客户端半（自包含：CSS 内联，唯一外部依赖为 react）
  package.json
```

放入 dsh 的 `node_modules/@deepseek-ai/dsh-client-hqst/` 即可，宿主按 `dsh.client`（`platform: web`）发现并加载。唯一的 peer 依赖是 `react ^18.2.0`（由宿主提供）。

## 依赖与许可

- peerDependencies：`react ^18.2.0`
- license：MIT

## 已知限制

- 跳转依赖 DSH 内部锚点属性名，若宿主未来整体改属性，需在 `jumpTo` 的候选选择器中追加新名。
- 面板为 fixed 定位，位置（`top: 72px; right: 16px`）写死在 `client.js` 的 `CSS_TEXT` 中，未做可配置。
- 无国际化命名空间，界面文案（「历史提问」等）为硬编码中文。
