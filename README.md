# dsh-conversation

Web 端「会话大纲」插件：在页面右上角贡献一个浮动面板，把当前会话组织成一棵大纲树 —— **用户提问**是根节点（带序号与提问时间），**助手回复里的 Markdown 标题**按其层级挂到最近的提问下。点击任意一行跳到正文并短暂高亮。纯 UI 插件，不接触任何提示词、消息、工具结果，也不向提供方发起请求。

1.1.0 起合并了原 `dsh-outline` 插件的全部能力（标题树、层级滑块、搜索、收藏、复制、阅读位置跟随），两者不再并存；1.1.0 同时把包名/仓库名从 `dsh-client-hqst` 改为 `dsh-conversation`。

## 效果

- **常驻态（默认）**：右上角 320px 浮动面板（`dsh-conv-panel`），标题「历史提问 · 大纲」。
  - 标题栏是拖拽把手（4px 阈值，拖动后位置持久化）；
  - 工具行：展开/收起全部、只看收藏、复制大纲（Markdown 缩进文本进剪贴板）、搜索框（命中片段高亮）；
  - 层级滑块：0 = 仅显示提问，1~6 = 展开到对应标题层级，圆点 tooltip 显示各层级数量；
  - 列表行：折叠箭头 / `Q1` 序号徽标 / 文本 / 提问时间 / 收藏星（hover 或已收藏时显示）；当前阅读位置的行自动浅底高亮并滚入可视区；
  - 底部：回到顶部 / 回到底部。
- **收起态**：点标题栏右侧的 × 折叠为右上角胶囊（`dsh-conv-fab`）「历史提问 · 大纲 (N)」，点击重新展开。
- **空态**：会话里还没有提问/标题时显示「暂无大纲内容」。
- 状态持久化：`pinned`/拖拽位置、默认展开层级、每个会话的收藏，全部走 `localStorage`（键前缀 `dsh-conversation:`）。

## 实现方式

| 半 | 文件 | 职责 |
| --- | --- | --- |
| Node 半 | `lib/index.js` | 空 `apply()`，仅为让插件在宿主 `cordis.yml` / Loader 中可见；无任何宿主侧行为 |
| 客户端半 | `lib/client.js` | 实际 UI，经 `exports["./client"]` + `package.json` 的 `dsh.client` 声明被 Web 宿主发现 |

客户端半行为：

1. 通过 `inject: ["slots", "sessions"]` 取两个必需服务，缺失则打警告并禁用面板。
2. 在 `shell.overlay` 槽位注册 `question-history`（`order: 100`），并把 `store` / `sessions` 透传给面板，不依赖 face 注入。
3. `sessions.binding(id)` 取当前会话 face，用 `useSyncExternalStore` 订阅 `getSnapshot()`。
4. `buildOutlineItems` 把快照摊平成大纲项：user/steering → level 0；assistant 的 text block 按 ATX 标题（`^#{1,6}\s+`，跳过围栏代码块内的 `#`）→ level 1~6；流式中的 `partial` 标题实时出现并带呼吸动画；tool-call / context 等非正文节点不进大纲。
5. `OutlineManager` 持有层级、搜索、收藏状态并与 localStorage 同步；`outline-tree` 的纯函数负责建树、折叠恢复、可见行压平、定位揭示。
6. 点击定位：先用宿主内部锚点属性 `[data-chat-anchor-key]` → `[data-message-key]` → `[data-node-key]`，命不中再按 `data-chat-flow-kind` 顺序匹配 + 文本校验；始终找不到就提示「当前节点暂不可定位」，绝不静默错位滚动。
7. 样式全部使用 `dsw-alias-*` / `dsw-shadow-*` 主题令牌，无硬编码色值。

## 兼容性

- **快照契约双支持**：新结构 `snapshot.nodes[]` + `snapshot.partial`；旧结构 `snapshot.chat.{order, nodes(Map)}` + `node.data.content`。结构不符时返回空列表而不是抛错。
- **宿主 API 降级**：`slots` / `sessions` 的形状、face 的 `getSnapshot` / `subscribe` 都逐层探测；任一改名或缺失只让本面板消失，不会拖垮同槽位的其它插件。
- **文案双语**：自带 zh/en 字典，按 `navigator.language` 回落；宿主若注入了可用的 `t` 则优先使用。

## 安装

本目录即一个**可直接分发的预构建包**（仅含编译产物 `lib/` 与 `package.json`，无源码、无构建脚本、无 `.d.ts`）：

```
node_modules/dsh-conversation/
  lib/index.js      # node 半
  lib/client.js     # 客户端半（自包含：CSS 内联，唯一外部依赖为 react）
  package.json
```

放入 dsh 的 `node_modules/dsh-conversation/` 即可，宿主按 `dsh.client`（`platform: web`）发现并加载。唯一的 peer 依赖是 `react ^18.2.0`（由宿主提供）。

本插件没有 `dsh.bundle.patch`，需要在 profile 的 `cordis.patch.yml` 里显式 insert：

```yaml
- insert:
    - id: dsh-conversation
      name: dsh-conversation
```

## 依赖与许可

- peerDependencies：`react ^18.2.0`
- license：MIT

## 已知限制

- 点击定位依赖宿主的 DOM 契约（`data-chat-anchor-key` 或 `data-chat-flow-kind`）；若未来整体改属性，需在 `locateByKey` / `collectUserRows` 里追加新候选。
- panel 为 fixed 定位，与其它右上角悬浮插件共存时可能重叠，需各自错开 `top`。
