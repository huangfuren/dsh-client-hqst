/**
 * dsh-conversation client half — 会话大纲面板（历史提问 + Markdown 标题树）。
 *
 * 由两个插件合并而来（2026-09-20）：
 * - 原 dsh-client-hqst：右上浮动面板，列出本会话的用户提问，点击跳转并高亮；
 * - 原 dsh-outline：大纲树（用户提问为 level 0，Assistant 回复里的 ATX 标题为
 *   level 1~6），含层级滑块、搜索、收藏、复制、阅读位置跟随、DOM 顺序锚定。
 *
 * 融合后的可见性只有两态（localStorage 持久化）：
 * - pinned = true（默认）：右上常驻面板，标题栏可拖动；
 * - pinned = false：右上角胶囊「历史提问 · 大纲 (N)」，点一下回来。
 *
 * 与 dsh-outline 的差异（有意保留原 hqst 的性格）：
 * - 用户提问行额外显示提问时间；
 * - 面板默认常驻（原 outline 默认是右缘触发条 + hover 预览）；
 * - 不依赖宿主 i18n 命名空间（原 hqst 也没有）：宿主若注入了可用的 `t`
 *   就优先用它，否则按 navigator.language 在自带 zh/en 字典间回落。
 */
window.__ModuleLoader__.load({
	id: "dsh-conversation",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const h = React.createElement;
		const {
			useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore,
		} = React;

		// 包自带样式：materialize 时注入一次，交给模块系统用 data-plugin 认领
		// （随插件一起卸载）。全部走 dsw-alias-* / dsw-shadow-* 主题令牌。
		const CSS_TEXT = `
      .dsh-conv-panel {
        position: fixed;
        display: flex;
        flex-direction: column;
        height: min(75vh, calc(100vh - 100px));
        pointer-events: auto;
        background: var(--dsw-alias-bg-layer-1, #fff);
        border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
        border-radius: 12px;
        box-shadow: 0 1px 2px rgba(15, 17, 21, 0.04), 0 8px 28px rgba(15, 17, 21, 0.1);
        color: var(--dsw-alias-label-primary, #0f1115);
        font-family: var(--dsw-font-family, sans-serif);
        font-size: 14px;
        line-height: 1.5;
        overflow: hidden;
        z-index: 1000;
      }
      .dsh-conv-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 8px 10px 12px;
        cursor: grab;
        user-select: none;
        flex-shrink: 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.05));
      }
      .dsh-conv-header:active { cursor: grabbing; }
      .dsh-conv-headerglyph {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--dsw-alias-state-business-primary, #4176e6);
      }
      .dsh-conv-title {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        font-size: 14px;
        letter-spacing: 0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dsh-conv-iconbtn {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: none;
        color: var(--dsw-alias-label-tertiary, #65666b);
        cursor: pointer;
        text-decoration: none;
        transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
      }
      .dsh-conv-iconbtn:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
        color: var(--dsw-alias-label-primary, #0f1115);
      }
      .dsh-conv-iconbtn:active { transform: scale(0.9); }
      .dsh-conv-iconbtn:focus-visible {
        outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
        outline-offset: 1px;
      }
      .dsh-conv-iconbtn-active {
        color: var(--dsw-alias-state-business-primary, #4176e6);
        background: var(--dsw-alias-state-business-tertiary, #e4edfd);
      }
      .dsh-conv-iconbtn-copied { color: var(--dsw-alias-state-success-primary, #18a058); }
      .dsh-conv-toolbar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 8px 10px 4px;
        flex-shrink: 0;
      }
      .dsh-conv-searchbox {
        position: relative;
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        margin-left: 4px;
      }
      .dsh-conv-searchicon {
        position: absolute;
        left: 9px;
        display: inline-flex;
        color: var(--dsw-alias-label-caption, #adb2b8);
        pointer-events: none;
      }
      .dsh-conv-search {
        width: 100%;
        height: 30px;
        padding: 0 26px 0 28px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
        border-radius: 8px;
        background: var(--dsw-alias-bg-base, #fff);
        color: var(--dsw-alias-label-primary, #0f1115);
        font-size: 13px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .dsh-conv-search::-webkit-search-cancel-button,
      .dsh-conv-search::-webkit-search-decoration {
        -webkit-appearance: none;
        appearance: none;
        display: none;
      }
      .dsh-conv-search::placeholder { color: var(--dsw-alias-label-caption, #adb2b8); }
      .dsh-conv-search:hover { border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14)); }
      .dsh-conv-search:focus {
        border-color: var(--dsw-alias-state-business-primary, #4176e6);
        box-shadow: 0 0 0 3px var(--dsw-alias-state-business-tertiary, #e4edfd);
      }
      .dsh-conv-searchclear {
        position: absolute;
        right: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        padding: 0;
        border: none;
        border-radius: 5px;
        background: none;
        color: var(--dsw-alias-label-tertiary, #65666b);
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .dsh-conv-searchclear:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
        color: var(--dsw-alias-label-primary, #0f1115);
      }
      .dsh-conv-slider {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 16px 10px;
        flex-shrink: 0;
      }
      .dsh-conv-sliderdots {
        position: relative;
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 20px;
      }
      .dsh-conv-slidertrack {
        position: absolute;
        left: 6px;
        right: 6px;
        top: 50%;
        height: 3px;
        transform: translateY(-50%);
        background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.1));
        border-radius: 2px;
      }
      .dsh-conv-sliderprogress {
        height: 100%;
        background: var(--dsw-alias-state-business-primary, #4176e6);
        border-radius: 2px;
        transition: width 0.18s ease;
      }
      .dsh-conv-dot {
        position: relative;
        width: 12px;
        height: 12px;
        padding: 0;
        border: 2px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.16));
        border-radius: 50%;
        background: var(--dsw-alias-bg-layer-1, #fff);
        cursor: pointer;
        transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .dsh-conv-dot:hover {
        transform: scale(1.3);
        border-color: var(--dsw-alias-state-business-primary, #4176e6);
      }
      .dsh-conv-dot-active {
        border-color: var(--dsw-alias-state-business-primary, #4176e6);
        background: var(--dsw-alias-state-business-primary, #4176e6);
      }
      .dsh-conv-dot-current { box-shadow: 0 0 0 3px var(--dsw-alias-state-business-tertiary, #e4edfd); }
      .dsh-conv-sliderlabel {
        flex: none;
        min-width: 34px;
        text-align: right;
        font-size: 12px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        color: var(--dsw-alias-label-tertiary, #65666b);
      }
      .dsh-conv-list {
        flex: 1;
        min-height: 80px;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 2px 6px 8px;
        scrollbar-width: thin;
        scrollbar-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.18)) transparent;
      }
      .dsh-conv-list::-webkit-scrollbar { width: 8px; }
      .dsh-conv-list::-webkit-scrollbar-thumb {
        background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.18));
        border: 2px solid transparent;
        border-radius: 4px;
        background-clip: content-box;
      }
      .dsh-conv-item {
        display: flex;
        align-items: center;
        gap: 5px;
        min-height: 30px;
        padding-right: 6px;
        border-radius: 6px;
        cursor: pointer;
        color: var(--dsw-alias-label-secondary, #3c3d43);
        transition: background-color 0.12s ease;
      }
      .dsh-conv-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06)); }
      .dsh-conv-item:focus-visible {
        outline: 2px solid var(--dsw-alias-state-business-primary, #4176e6);
        outline-offset: -2px;
      }
      .dsh-conv-item-active {
        background: var(--dsw-alias-state-business-tertiary, #e4edfd);
        color: var(--dsw-alias-label-primary, #0f1115);
      }
      .dsh-conv-item-user { color: var(--dsw-alias-label-primary, #0f1115); font-weight: 500; }
      .dsh-conv-chevron {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        color: var(--dsw-alias-label-caption, #adb2b8);
        transition: transform 0.15s ease, color 0.15s ease;
      }
      .dsh-conv-item:hover .dsh-conv-chevron { color: var(--dsw-alias-label-tertiary, #65666b); }
      .dsh-conv-chevron-open { transform: rotate(90deg); }
      .dsh-conv-chevron-hidden { visibility: hidden; }
      .dsh-conv-badge {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: 5px;
        background: var(--dsw-alias-state-business-tertiary, #e4edfd);
        color: var(--dsw-alias-state-business-primary, #4176e6);
        font-size: 12px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .dsh-conv-item-active .dsh-conv-badge {
        background: var(--dsw-alias-state-business-primary, #4176e6);
        color: var(--dsw-alias-label-on-accent, #fff);
      }
      .dsh-conv-itemtext {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
      }
      .dsh-conv-itemstreaming { animation: dsh-conv-streaming 1.4s ease-in-out infinite alternate; }
      @keyframes dsh-conv-streaming {
        from { opacity: 0.45; }
        to { opacity: 0.7; }
      }
      .dsh-conv-time {
        flex: none;
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary, #65666b);
        font-variant-numeric: tabular-nums;
      }
      .dsh-conv-bookmark {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 5px;
        color: var(--dsw-alias-label-tertiary, #65666b);
        opacity: 0;
        transition: opacity 0.15s ease, color 0.15s ease, transform 0.1s ease;
      }
      .dsh-conv-item:hover .dsh-conv-bookmark,
      .dsh-conv-item:focus-within .dsh-conv-bookmark { opacity: 1; }
      .dsh-conv-bookmark:active { transform: scale(0.85); }
      .dsh-conv-bookmark-active { opacity: 1; color: var(--dsw-alias-state-warn-primary, #f59e0b); }
      .dsh-conv-mark {
        background: var(--dsw-alias-state-warn-tertiary, #fef5e7);
        color: inherit;
        padding: 0 1px;
        border-radius: 3px;
      }
      .dsh-conv-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 40px 16px;
        text-align: center;
        color: var(--dsw-alias-label-tertiary, #65666b);
      }
      .dsh-conv-emptyglyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.05));
        color: var(--dsw-alias-label-caption, #adb2b8);
        margin-bottom: 6px;
      }
      .dsh-conv-emptyglyph > svg { width: 20px; height: 20px; }
      .dsh-conv-emptyhint {
        font-size: 13px;
        line-height: 1.6;
        color: var(--dsw-alias-label-caption, #adb2b8);
      }
      .dsh-conv-footer {
        display: flex;
        gap: 8px;
        padding: 8px 10px;
        flex-shrink: 0;
        border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.05));
      }
      .dsh-conv-footbtn {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 32px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1, #fff);
        color: var(--dsw-alias-label-secondary, #3c3d43);
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
      }
      .dsh-conv-footbtn:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
        color: var(--dsw-alias-label-primary, #0f1115);
      }
      .dsh-conv-footbtn:active { transform: translateY(1px); }
      .dsh-conv-toast {
        position: absolute;
        left: 50%;
        bottom: 46px;
        transform: translateX(-50%);
        padding: 6px 12px;
        border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-1, #fff);
        box-shadow: 0 4px 16px rgba(15, 17, 21, 0.12);
        color: var(--dsw-alias-label-secondary, #3c3d43);
        font-size: 13px;
        z-index: 1;
        pointer-events: none;
      }
      .dsh-conv-fab {
        position: fixed;
        top: 72px;
        right: 16px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-layer-1, #fff);
        border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.08));
        box-shadow: 0 2px 8px rgba(15, 17, 21, 0.08);
        color: var(--dsw-alias-label-primary, #0f1115);
        font-family: var(--dsw-font-family, sans-serif);
        font-size: 13px;
        cursor: pointer;
        pointer-events: auto;
        z-index: 1000;
      }
      .dsh-conv-fab:hover {
        background: var(--dsw-alias-interactive-bg-hover, rgba(38, 49, 72, 0.06));
        color: var(--dsw-alias-state-business-primary, #4176e6);
      }
      .dsh-conv-flash { animation: dsh-conv-flash 1.6s ease-out; border-radius: 4px; }
      @keyframes dsh-conv-flash {
        0% { background-color: var(--dsw-alias-state-business-tertiary, rgba(65, 118, 230, 0.18)); }
        100% { background-color: transparent; }
      }
      @media (prefers-reduced-motion: reduce) {
        .dsh-conv-panel *,
        .dsh-conv-fab {
          transition-duration: 0.01ms !important;
          animation: none !important;
        }
      }
    `;
		const STYLE_ID = "dsh-conversation/styles";
		// 样式注入是 best-effort：失败只影响外观，绝不能让模块求值抛异常。
		try {
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_ID) + "]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-conversation";
				tag.dataset.pluginCss = STYLE_ID;
				tag.textContent = CSS_TEXT;
				document.head.appendChild(tag);
			}
		} catch (e) {
			console.warn("[conversation] stylesheet injection failed; panel renders unstyled", e);
		}

		const PANEL_WIDTH = 320;
		const REPO_URL = "https://github.com/huangfuren/dsh-conversation";
		const MAX_USER_TEXT = 80;

		const ZH = {
			"panel.title": "历史提问 · 大纲",
			"panel.collapse": "收起",
			"panel.github": "在 GitHub 上查看",
			"panel.empty": "暂无大纲内容",
			"panel.emptyHint": "发送一条消息，或等待助手回复中出现标题",
			"search.placeholder": "搜索大纲…",
			"search.clear": "清除搜索",
			"level.tooltip": "H{level}：{count} 个",
			"level.zero": "仅问题",
			"action.expandAll": "展开全部",
			"action.collapseAll": "收起全部",
			"action.bookmarkMode": "只看收藏",
			"action.bookmarkAdd": "收藏",
			"action.bookmarkRemove": "取消收藏",
			"action.copy": "复制大纲",
			"action.copied": "已复制",
			"action.scrollTop": "回到顶部",
			"action.scrollBottom": "回到底部",
			"action.unlocatable": "当前节点暂不可定位",
		};
		const EN = {
			"panel.title": "Questions · Outline",
			"panel.collapse": "Collapse",
			"panel.github": "View on GitHub",
			"panel.empty": "No outline yet",
			"panel.emptyHint": "Send a message, or wait for headings in the assistant reply",
			"search.placeholder": "Search outline…",
			"search.clear": "Clear search",
			"level.tooltip": "H{level}: {count}",
			"level.zero": "Questions only",
			"action.expandAll": "Expand all",
			"action.collapseAll": "Collapse all",
			"action.bookmarkMode": "Bookmarks only",
			"action.bookmarkAdd": "Bookmark",
			"action.bookmarkRemove": "Remove bookmark",
			"action.copy": "Copy outline",
			"action.copied": "Copied",
			"action.scrollTop": "Scroll to top",
			"action.scrollBottom": "Scroll to bottom",
			"action.unlocatable": "This item is not available yet",
		};

		function preferredLang() {
			try {
				return /^en/i.test(navigator.language || "") ? "en" : "zh";
			} catch (e) {
				return "zh";
			}
		}

		function makeTranslate(injected) {
			const dict = preferredLang() === "en" ? EN : ZH;
			const fallback = (key, vars) => {
				let text = dict[key] === undefined ? (ZH[key] === undefined ? key : ZH[key]) : dict[key];
				if (vars !== undefined && vars !== null) {
					for (const name of Object.keys(vars)) {
						text = text.split("{" + name + "}").join(String(vars[name]));
					}
				}
				return text;
			};
			if (typeof injected !== "function") return fallback;
			return (key, vars) => {
				try {
					const value = injected(key, vars);
					if (typeof value === "string" && value !== "") return value;
				} catch (e) { /* 宿主字典缺失或改名：回落自带文案 */ }
				return fallback(key, vars);
			};
		}

		function djb2Hash(str) {
			let hash = 5381;
			for (let i = 0; i < str.length; i++) {
				hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
			}
			return hash.toString(16).padStart(8, "0");
		}

		function itemSignature(level, text, occurrence) {
			return djb2Hash(level + ":" + text) + ":" + occurrence;
		}

		const HEADING_RE = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/;
		const FENCE_RE = /^\s*(`{3,}|~{3,})/;

		function parseMarkdownHeadings(markdown) {
			const out = [];
			if (typeof markdown !== "string") return out;
			let inFence = false;
			for (const line of markdown.split("\n")) {
				if (FENCE_RE.test(line)) {
					inFence = !inFence;
					continue;
				}
				if (inFence) continue;
				const trimmed = line.trimStart();
				if (trimmed.startsWith("#") === false) continue;
				const matched = HEADING_RE.exec(trimmed);
				if (matched === null) continue;
				const hashes = /^#{1,6}/.exec(trimmed);
				if (hashes === null) continue;
				const text = (matched[1] === undefined ? "" : matched[1]).trim();
				if (text === "") continue;
				out.push({ level: hashes[0].length, text });
			}
			return out;
		}

		function findScrollableAncestor(element) {
			let current = element === null || element === undefined ? null : element.parentElement;
			while (current && current !== document.body) {
				const style = window.getComputedStyle(current);
				const overflowY = style.overflowY;
				const canScroll = current.scrollHeight > current.clientHeight
					&& (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay");
				if (canScroll) return current;
				current = current.parentElement;
			}
			return null;
		}

		function scrollElementInContainer(element, container, offset) {
			if (container === null || container === undefined || container === element) return false;
			const pad = typeof offset === "number" ? offset : 12;
			const containerRect = container.getBoundingClientRect();
			const targetRect = element.getBoundingClientRect();
			container.scrollTo({
				top: container.scrollTop + targetRect.top - containerRect.top - pad,
				behavior: "instant",
			});
			return true;
		}

		/** 仅当 element 不完全可见时滚动容器（不牵动祖先）。返回是否发生滚动。 */
		function ensureElementInView(element, container, padding) {
			if (container === element) return false;
			const pad = typeof padding === "number" ? padding : 8;
			const cRect = container.getBoundingClientRect();
			const eRect = element.getBoundingClientRect();
			const topLimit = cRect.top + pad;
			const bottomLimit = cRect.bottom - pad;
			if (eRect.top >= topLimit && eRect.bottom <= bottomLimit) return false;
			const delta = eRect.top < topLimit ? eRect.top - topLimit : eRect.bottom - bottomLimit;
			container.scrollTo({ top: container.scrollTop + delta, behavior: "instant" });
			return true;
		}

		function buildTree(items) {
			const roots = [];
			const stack = [];
			let index = 0;
			let queryIndex = 0;
			for (const item of items) {
				const node = {
					level: item.level,
					text: item.text,
					id: item.id,
					children: [],
					index: index++,
					collapsed: false,
				};
				if (item.isUserQuery === true) {
					node.isUserQuery = true;
					node.queryIndex = ++queryIndex;
				}
				if (item.userIndex !== undefined) node.userIndex = item.userIndex;
				if (item.headingIndex !== undefined) node.headingIndex = item.headingIndex;
				if (item.key !== undefined) node.key = item.key;
				if (item.ts !== undefined) node.ts = item.ts;
				if (item.streaming === true) node.streaming = true;
				if (item.isTruncated === true) node.isTruncated = true;
				while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
				const parent = stack[stack.length - 1];
				if (parent === undefined) roots.push(node);
				else parent.children.push(node);
				stack.push(node);
			}
			return roots;
		}

		function computeLevelCounts(items) {
			const counts = {};
			for (const item of items) {
				if (item.level >= 1) counts[item.level] = (counts[item.level] === undefined ? 0 : counts[item.level]) + 1;
			}
			return counts;
		}

		function maxActualLevel(items) {
			let max = 0;
			for (const item of items) max = Math.max(max, item.level);
			return max;
		}

		function clearForceExpandedState(nodes, displayLevel) {
			for (const node of nodes) {
				node.forceExpanded = false;
				if (node.children.length > 0) {
					node.collapsed = node.children.every((child) => child.level > displayLevel);
					clearForceExpandedState(node.children, displayLevel);
				} else {
					node.collapsed = false;
				}
			}
		}

		function captureCollapseState(nodes, out) {
			const map = out === undefined ? new Map() : out;
			for (const node of nodes) {
				map.set(node.id, { collapsed: node.collapsed, forceExpanded: node.forceExpanded === true });
				captureCollapseState(node.children, map);
			}
			return map;
		}

		function restoreCollapseState(nodes, saved, displayLevel) {
			for (const node of nodes) {
				const rec = saved.get(node.id);
				if (rec !== undefined) {
					node.collapsed = rec.collapsed;
					node.forceExpanded = rec.forceExpanded;
				} else if (node.children.length > 0) {
					node.collapsed = node.children.every((child) => child.level > displayLevel);
				}
				restoreCollapseState(node.children, saved, displayLevel);
			}
		}

		function markBookmarkedPaths(nodes, bookmarks) {
			let any = false;
			for (const node of nodes) {
				const childHas = markBookmarkedPaths(node.children, bookmarks);
				node.isBookmarked = bookmarks.has(node.id);
				node.hasBookmarkedDescendant = childHas;
				if (node.isBookmarked || childHas) any = true;
			}
			return any;
		}

		function flattenVisible(nodes, opts) {
			const out = [];
			const walk = (list, forceChain) => {
				for (const node of list) {
					const passFilter =
						(opts.searching !== true || node.isMatch === true || node.hasMatchedDescendant === true)
						&& (opts.bookmarkMode !== true || node.isBookmarked === true || node.hasBookmarkedDescendant === true);
					const passLevel = opts.searching === true || opts.bookmarkMode === true || forceChain
						|| node.level <= opts.expandLevel || node.forceVisible === true;
					if (passFilter && passLevel) out.push(node);
					if (node.collapsed !== true || node.forceVisible === true) {
						walk(node.children, forceChain || node.forceExpanded === true);
					}
				}
			};
			walk(nodes, false);
			return out;
		}

		function revealPath(nodes, targetIndex) {
			const mark = (list, parents) => {
				for (const node of list) {
					if (node.index === targetIndex) {
						for (const parent of parents) {
							parent.collapsed = false;
							parent.forceExpanded = true;
							parent.forceVisible = true;
						}
						node.forceVisible = true;
						return true;
					}
					if (mark(node.children, parents.concat([node]))) return true;
				}
				return false;
			};
			return mark(nodes, []);
		}

		function findPath(nodes, id) {
			for (const node of nodes) {
				if (node.id === id) return [node];
				const nested = findPath(node.children, id);
				if (nested !== null) return [node].concat(nested);
			}
			return null;
		}

		function resolveVisibleActiveId(activeId, tree, visible) {
			if (activeId === null || activeId === undefined) return null;
			const visibleIds = new Set();
			for (const node of visible) visibleIds.add(node.id);
			if (visibleIds.has(activeId)) return activeId;
			const path = findPath(tree, activeId);
			if (path === null) return null;
			for (let i = path.length - 1; i >= 0; i--) {
				const id = path[i] === undefined ? undefined : path[i].id;
				if (id !== undefined && visibleIds.has(id)) return id;
			}
			return null;
		}

		function clearForceVisible(nodes, displayLevel) {
			for (const node of nodes) {
				if (node.forceVisible === true) {
					node.forceVisible = false;
					node.forceExpanded = false;
					if (node.children.length > 0) {
						node.collapsed = node.children.every((child) => child.level > displayLevel);
					}
				}
				clearForceVisible(node.children, displayLevel);
			}
		}

		/** 面板侧唯一状态所有者：组合上面的纯函数，持有层级/搜索/收藏状态。 */
		class OutlineManager {
			constructor(options) {
				const opts = options === undefined || options === null ? {} : options;
				this.items = [];
				this.tree = [];
				this.expandLevel = opts.expandLevel === undefined ? 6 : opts.expandLevel;
				this.searchQuery = "";
				this.matchCount = 0;
				this.bookmarkMode = false;
				this.bookmarkIds = new Set(opts.bookmarks === undefined ? [] : opts.bookmarks);
				this.onExpandLevelChange = opts.onExpandLevelChange;
				this.onBookmarksChange = opts.onBookmarksChange;
				this.listeners = new Set();
			}

			subscribe(fn) {
				this.listeners.add(fn);
				return () => { this.listeners.delete(fn); };
			}

			notify() {
				for (const fn of this.listeners) fn();
			}

			itemsEqual(items) {
				const prev = this.items;
				if (items.length !== prev.length) return false;
				for (let i = 0; i < items.length; i++) {
					const a = items[i];
					const b = prev[i];
					if (a === undefined || b === undefined) return false;
					if (a.level !== b.level || a.text !== b.text
						|| a.isUserQuery !== b.isUserQuery || a.userIndex !== b.userIndex
						|| a.headingIndex !== b.headingIndex || a.streaming !== b.streaming
						|| a.isTruncated !== b.isTruncated || a.key !== b.key || a.ts !== b.ts) return false;
				}
				return true;
			}

			setItems(items) {
				if (this.itemsEqual(items)) return;
				const seen = new Map();
				const signed = items.map((item) => {
					const base = item.level + ":" + item.text;
					const occ = seen.get(base);
					const occurrence = occ === undefined ? 0 : occ;
					seen.set(base, occurrence + 1);
					const next = {
						level: item.level,
						text: item.text,
						id: itemSignature(item.level, item.text, occurrence),
					};
					if (item.isUserQuery === true) next.isUserQuery = true;
					if (item.userIndex !== undefined) next.userIndex = item.userIndex;
					if (item.headingIndex !== undefined) next.headingIndex = item.headingIndex;
					if (item.key !== undefined) next.key = item.key;
					if (item.ts !== undefined) next.ts = item.ts;
					if (item.streaming === true) next.streaming = true;
					if (item.isTruncated === true) next.isTruncated = true;
					return next;
				});
				const saved = this.tree.length > 0 ? captureCollapseState(this.tree) : new Map();
				this.items = signed;
				this.tree = buildTree(signed);
				restoreCollapseState(this.tree, saved, this.expandLevel);
				markBookmarkedPaths(this.tree, this.bookmarkIds);
				if (this.searchQuery !== "") this.performSearch(this.searchQuery);
				this.notify();
			}

			getState() {
				return {
					tree: this.tree,
					visible: flattenVisible(this.tree, {
						expandLevel: this.expandLevel,
						searching: this.searchQuery !== "",
						bookmarkMode: this.bookmarkMode,
					}),
					expandLevel: this.expandLevel,
					isAllExpanded: this.expandLevel >= maxActualLevel(this.items),
					levelCounts: computeLevelCounts(this.items),
					searchQuery: this.searchQuery,
					matchCount: this.matchCount,
					bookmarkMode: this.bookmarkMode,
					bookmarkIds: this.bookmarkIds,
				};
			}

			setLevel(level) {
				this.expandLevel = Math.max(0, Math.min(6, level));
				clearForceExpandedState(this.tree, this.expandLevel);
				if (typeof this.onExpandLevelChange === "function") this.onExpandLevelChange(this.expandLevel);
				this.notify();
			}

			expandAll() {
				this.setLevel(maxActualLevel(this.items));
			}

			collapseAll() {
				this.setLevel(0);
			}

			toggleNode(index) {
				const node = this.findNode(index);
				if (node === null || node.children.length === 0) return;
				node.collapsed = !node.collapsed;
				if (node.collapsed !== true) node.forceExpanded = true;
				this.notify();
			}

			revealNode(index) {
				clearForceVisible(this.tree, this.expandLevel);
				if (revealPath(this.tree, index)) this.notify();
			}

			setSearchQuery(query) {
				this.searchQuery = query;
				if (query === "") {
					this.matchCount = 0;
					clearForceExpandedState(this.tree, this.expandLevel);
				} else {
					this.performSearch(query);
				}
				this.notify();
			}

			performSearch(query) {
				const needle = query.toLowerCase();
				let count = 0;
				const traverse = (nodes) => {
					let anyMatch = false;
					for (const node of nodes) {
						node.isMatch = node.text.toLowerCase().includes(needle);
						if (node.isMatch) count++;
						node.hasMatchedDescendant = traverse(node.children);
						if (node.hasMatchedDescendant) node.collapsed = false;
						if (node.isMatch || node.hasMatchedDescendant) anyMatch = true;
					}
					return anyMatch;
				};
				traverse(this.tree);
				this.matchCount = count;
			}

			setBookmarkMode(on) {
				this.bookmarkMode = on;
				this.notify();
			}

			toggleBookmark(index) {
				const node = this.findNode(index);
				if (node === null) return;
				if (this.bookmarkIds.has(node.id)) this.bookmarkIds.delete(node.id);
				else this.bookmarkIds.add(node.id);
				markBookmarkedPaths(this.tree, this.bookmarkIds);
				if (typeof this.onBookmarksChange === "function") this.onBookmarksChange(this.bookmarkIds);
				this.notify();
			}

			findNode(index) {
				const walk = (nodes) => {
					for (const node of nodes) {
						if (node.index === index) return node;
						const hit = walk(node.children);
						if (hit !== null) return hit;
					}
					return null;
				};
				return walk(this.tree);
			}
		}

		// 快照契约兼容：新结构是 snapshot.nodes 数组 + snapshot.partial；
		// 旧结构是 snapshot.chat = { order, nodes(Map) } + node.data.content。
		function snapshotRows(snapshot) {
			if (snapshot === null || snapshot === undefined || typeof snapshot !== "object") return [];
			if (Array.isArray(snapshot.nodes)) return snapshot.nodes;
			if (Array.isArray(snapshot.items)) return snapshot.items;
			if (Array.isArray(snapshot.messages)) return snapshot.messages;
			const chat = snapshot.chat;
			if (chat !== null && chat !== undefined && Array.isArray(chat.order)) {
				const nodes = chat.nodes;
				const out = [];
				if (nodes !== null && nodes !== undefined && typeof nodes.get === "function") {
					for (const key of chat.order) {
						const row = nodes.get(key);
						if (row !== undefined && row !== null) out.push(row);
					}
					return out;
				}
				if (nodes !== null && nodes !== undefined && typeof nodes === "object") {
					for (const key of chat.order) {
						const row = nodes[key];
						if (row !== undefined && row !== null) out.push(row);
					}
					return out;
				}
			}
			return [];
		}

		function rowContent(node) {
			if (Array.isArray(node.content)) return node.content;
			const data = node.data;
			if (data !== null && data !== undefined && Array.isArray(data.content)) return data.content;
			return [];
		}

		function rowTime(node) {
			if (typeof node.time === "number") return node.time;
			const data = node.data;
			if (data !== null && data !== undefined && typeof data.time === "number") return data.time;
			if (typeof node.timestamp === "number") return node.timestamp;
			return undefined;
		}

		function textBlocks(node) {
			const out = [];
			if (Array.isArray(node.blocks)) {
				for (const block of node.blocks) {
					if (block !== null && block !== undefined && block.kind === "text" && typeof block.text === "string") out.push(block.text);
				}
				return out;
			}
			for (const block of rowContent(node)) {
				if (block !== null && block !== undefined && block.type === "text" && typeof block.text === "string") out.push(block.text);
			}
			return out;
		}

		function userText(node) {
			return textBlocks(node).join("\n").trim().split("\n", 1)[0].trim();
		}

		function buildOutlineItems(snapshot) {
			const items = [];
			let userIndex = 0;
			let headingIndex = 0;
			const pushHeadings = (markdown, streaming) => {
				for (const heading of parseMarkdownHeadings(markdown)) {
					const item = { level: heading.level, text: heading.text, headingIndex: headingIndex++ };
					if (streaming) item.streaming = true;
					items.push(item);
				}
			};
			for (const node of snapshotRows(snapshot)) {
				if (node === null || node === undefined) continue;
				const kind = node.kind === undefined ? node.role : node.kind;
				if (kind === "user" || kind === "steering" || kind === "human") {
					const text = userText(node);
					if (text === "") continue;
					const item = {
						level: 0,
						text: text.length > MAX_USER_TEXT ? text.slice(0, MAX_USER_TEXT) : text,
						isUserQuery: true,
						userIndex: userIndex++,
					};
					if (text.length > MAX_USER_TEXT) item.isTruncated = true;
					const key = node.key === undefined ? node.id : node.key;
					if (key !== undefined) item.key = key;
					const ts = rowTime(node);
					if (ts !== undefined) item.ts = ts;
					items.push(item);
					continue;
				}
				if (kind === "assistant" || kind === "ai" || kind === "model") {
					for (const text of textBlocks(node)) pushHeadings(text, false);
				}
			}
			const partial = snapshot === null || snapshot === undefined ? undefined : snapshot.partial;
			if (partial !== null && partial !== undefined && typeof partial === "object") {
				for (const text of textBlocks(partial)) pushHeadings(text, true);
			}
			return items;
		}

		const EXCLUDE_ANCESTOR =
			'[data-chat-flow-kind="tool-call"], [data-chat-flow-kind="context"], [data-chat-flow-kind="turn-tail"]';
		const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";
		const FLASH_CLASS = "dsh-conv-flash";
		const FLASH_MS = 1600;

		function findChatRoot() {
			try {
				const slotRoot = document.querySelector('[data-slot="conversation"]');
				if (slotRoot instanceof HTMLElement) return slotRoot;
				return document.body;
			} catch (e) {
				return null;
			}
		}

		function findChatScrollContainer(root) {
			try {
				return findScrollableAncestor(root.querySelector("[data-chat-flow-kind]"));
			} catch (e) {
				return null;
			}
		}

		function collectUserRows(root) {
			try {
				return Array.prototype.slice.call(root.querySelectorAll(
					'[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]',
				));
			} catch (e) {
				return [];
			}
		}

		function collectHeadings(root) {
			try {
				return Array.prototype.slice.call(root.querySelectorAll(HEADING_SELECTOR))
					.filter((el) => el.closest(EXCLUDE_ANCESTOR) === null);
			} catch (e) {
				return [];
			}
		}

		function compactText(value) {
			return value.replace(/\s+/g, "");
		}

		function elementText(el) {
			return el.textContent === null || el.textContent === undefined ? "" : el.textContent;
		}

		function matchesUser(el, item) {
			const probe = compactText(item.text.slice(0, 20));
			if (probe === "") return true;
			return compactText(elementText(el)).includes(probe);
		}

		function matchesHeading(el, item) {
			return el.tagName === "H" + item.level && elementText(el).trim() === item.text;
		}

		function locateItem(root, item) {
			if (item.isUserQuery === true) {
				const rows = collectUserRows(root);
				const direct = item.userIndex === undefined ? undefined : rows[item.userIndex];
				if (direct !== undefined && matchesUser(direct, item)) return direct;
				if (compactText(item.text) === "") return null;
				const hit = rows.filter((el) => matchesUser(el, item));
				return hit.length === 0 ? null : hit[0];
			}
			const headings = collectHeadings(root);
			const direct = item.headingIndex === undefined ? undefined : headings[item.headingIndex];
			if (direct !== undefined && matchesHeading(direct, item)) return direct;
			const hit = headings.filter((el) => matchesHeading(el, item));
			return hit.length === 0 ? null : hit[0];
		}

		/** 宿主内部锚点属性（hqst 旧契约）优先，命不中再走大纲的顺序匹配。 */
		function locateByKey(key) {
			if (key === undefined || key === null) return null;
			const suffix = String(key).replace(/"/g, '\\"');
			const selectors = [
				'[data-chat-anchor-key="' + suffix + '"]',
				'[data-message-key="' + suffix + '"]',
				'[data-node-key="' + suffix + '"]',
			];
			for (const selector of selectors) {
				try {
					const el = document.querySelector(selector);
					if (el instanceof HTMLElement) return el;
				} catch (e) { /* 非法选择器：换下一个候选 */ }
			}
			return null;
		}

		function flashElement(el) {
			try {
				el.classList.add(FLASH_CLASS);
				window.setTimeout(() => { el.classList.remove(FLASH_CLASS); }, FLASH_MS);
			} catch (e) { /* 高亮是 best-effort */ }
		}

		function scrollToItem(root, item) {
			const el = locateByKey(item.key) || locateItem(root, item);
			if (el === null) return false;
			const container = findChatScrollContainer(root);
			if (container !== null) scrollElementInContainer(el, container);
			else el.scrollIntoView({ block: "start" });
			flashElement(el);
			return true;
		}

		function scrollChatToTop(root) {
			const container = findChatScrollContainer(root);
			if (container !== null) container.scrollTo({ top: 0, behavior: "instant" });
		}

		function scrollChatToBottom(root) {
			const container = findChatScrollContainer(root);
			if (container !== null) container.scrollTo({ top: container.scrollHeight, behavior: "instant" });
		}

		function computeActiveItemId(root, items) {
			const container = findChatScrollContainer(root);
			if (container === null) return null;
			const threshold = container.getBoundingClientRect().top + 80;
			let active = null;
			for (const item of items) {
				const el = locateItem(root, item);
				if (el === null) continue;
				if (el.getBoundingClientRect().top <= threshold) active = item;
				else break;
			}
			return active === null ? null : active.id;
		}

		const CHROME_KEY = "dsh-conversation:panel";
		const LEVEL_KEY = "dsh-conversation:expandLevel";
		const BOOKMARKS_PREFIX = "dsh-conversation:bookmarks:";
		const BOOKMARKS_CAP = 200;

		function readJson(key) {
			try {
				const raw = window.localStorage.getItem(key);
				return raw === null ? null : JSON.parse(raw);
			} catch (e) {
				return null;
			}
		}

		function writeJson(key, value) {
			try {
				window.localStorage.setItem(key, JSON.stringify(value));
			} catch (e) { /* 隐私模式写失败：偏好丢失可接受 */ }
		}

		function createChromeStore() {
			const saved = readJson(CHROME_KEY);
			const picked = saved === null || typeof saved !== "object" ? {} : saved;
			let state = {
				// hqst 历史上是常驻面板；dsh-outline 的 open=true 也迁移为 pinned=true。
				pinned: picked.pinned === undefined
					? (picked.open === undefined ? true : picked.open === true)
					: picked.pinned === true,
				left: typeof picked.left === "number" ? picked.left : null,
				top: typeof picked.top === "number" ? picked.top : null,
			};
			const listeners = new Set();
			return {
				getSnapshot: () => state,
				subscribe(fn) {
					listeners.add(fn);
					return () => { listeners.delete(fn); };
				},
				set(patch) {
					state = Object.assign({}, state, patch);
					writeJson(CHROME_KEY, state);
					for (const fn of listeners) fn();
				},
			};
		}

		function loadExpandLevel() {
			const value = readJson(LEVEL_KEY);
			return typeof value === "number" && value >= 0 && value <= 6 ? value : 6;
		}

		function saveExpandLevel(level) {
			writeJson(LEVEL_KEY, level);
		}

		function loadBookmarks(sessionId) {
			const value = readJson(BOOKMARKS_PREFIX + sessionId);
			return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
		}

		function saveBookmarks(sessionId, ids) {
			writeJson(BOOKMARKS_PREFIX + sessionId, Array.from(ids).slice(-BOOKMARKS_CAP));
		}

		function formatTime(ms) {
			try {
				return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			} catch (e) {
				return "";
			}
		}

		function OutlineGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
				h("path", { d: "M2 3.5h10M2 7h6.5M2 10.5h8.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }));
		}

		function GitHubGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" },
				h("path", { d: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" }));
		}

		function CloseGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
				h("path", { d: "M4 4l6 6M10 4l-6 6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }));
		}

		function ExpandAllGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("path", { d: "M4 6h6" }),
				h("path", { d: "M4 10h9" }),
				h("path", { d: "M4 14h9" }),
				h("path", { d: "M4 18h6" }),
				h("path", { d: "M18 5v14" }),
				h("path", { d: "m15.5 7.5 2.5-2.5 2.5 2.5" }),
				h("path", { d: "m15.5 16.5 2.5 2.5 2.5-2.5" }));
		}

		function CollapseAllGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("path", { d: "M4 6h9" }),
				h("path", { d: "M4 12h9" }),
				h("path", { d: "M4 18h9" }),
				h("path", { d: "M18 3v6" }),
				h("path", { d: "m15.5 6.5 2.5 2.5 2.5-2.5" }),
				h("path", { d: "M18 21v-6" }),
				h("path", { d: "m15.5 17.5 2.5-2.5 2.5 2.5" }));
		}

		function SearchGlyph() {
			return h("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
				h("circle", { cx: "6.3", cy: "6.3", r: "3.8", stroke: "currentColor", strokeWidth: "1.5" }),
				h("path", { d: "M9.2 9.2l2.6 2.6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }));
		}

		function StarGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
				h("path", {
					d: "M7 1.8l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 10.1l-3.2 1.6.6-3.6L1.8 5.6l3.6-.5L7 1.8z",
					stroke: "currentColor", strokeWidth: "1.2", strokeLinejoin: "round",
				}));
		}

		function CopyGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 1024 1024", fill: "currentColor", "aria-hidden": "true" },
				h("path", { d: "M632.96 954.88H201.813333a132.906667 132.906667 0 0 1-132.693333-132.693333V391.04a132.906667 132.906667 0 0 1 132.693333-132.906667h431.146667a132.906667 132.906667 0 0 1 132.906667 132.906667v431.146667a132.906667 132.906667 0 0 1-132.906667 132.693333zM201.813333 352a39.04 39.04 0 0 0-38.826666 39.04v431.146667a39.04 39.04 0 0 0 38.826666 38.826666h431.146667a39.04 39.04 0 0 0 39.04-38.826666V391.04a39.04 39.04 0 0 0-39.04-39.04z" }),
				h("path", { d: "M907.946667 846.293333a47.146667 47.146667 0 0 1-46.933334-46.933333V234.666667A71.04 71.04 0 0 0 789.333333 162.986667H224.64a46.933333 46.933333 0 1 1 0-93.866667H789.333333A164.906667 164.906667 0 0 1 954.88 234.666667v565.333333a46.933333 46.933333 0 0 1-46.933333 46.293333z" }),
				h("path", { d: "M531.626667 561.066667h-241.066667a46.933333 46.933333 0 0 1 0-93.866667h241.066667a46.933333 46.933333 0 0 1 0 93.866667zM531.626667 731.733333h-241.066667a46.933333 46.933333 0 0 1 0-93.866666h241.066667a46.933333 46.933333 0 0 1 0 93.866666z" }));
		}

		function CheckGlyph() {
			return h("svg", { width: "15", height: "15", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
				h("polyline", { points: "20 6 9 17 4 12" }));
		}

		function ScrollTopGlyph() {
			return h("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
				h("path", {
					d: "M2.5 2.5h9M7 11.5V5.2M4.6 7.4L7 5l2.4 2.4",
					stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round",
				}));
		}

		function ScrollBottomGlyph() {
			return h("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true" },
				h("path", {
					d: "M2.5 11.5h9M7 2.5v6.3M4.6 6.6L7 9l2.4-2.4",
					stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round",
				}));
		}

		function ChevronGlyph() {
			return h("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true" },
				h("path", { d: "M4 2.5l4 3.5-4 3.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }));
		}

		function LevelSlider(props) {
			const dots = [];
			for (let level = 0; level <= 6; level++) {
				let className = "dsh-conv-dot";
				if (level <= props.expandLevel) className += " dsh-conv-dot-active";
				if (level === props.expandLevel) className += " dsh-conv-dot-current";
				dots.push(h("button", {
					key: level,
					type: "button",
					className,
					title: level === 0
						? props.t("level.zero")
						: props.t("level.tooltip", { level, count: props.levelCounts[level] === undefined ? 0 : props.levelCounts[level] }),
					"aria-label": level === 0 ? props.t("level.zero") : "H" + level,
					onClick: () => props.onChange(level),
				}));
			}
			return h("div", { className: "dsh-conv-slider", role: "group", "aria-label": "level" },
				h("div", { className: "dsh-conv-sliderdots" },
					h("div", { className: "dsh-conv-slidertrack" },
						h("div", { className: "dsh-conv-sliderprogress", style: { width: (props.expandLevel / 6) * 100 + "%" } })),
					dots),
				h("span", { className: "dsh-conv-sliderlabel" },
					props.expandLevel === 0 ? props.t("level.zero") : "H" + props.expandLevel));
		}

		function HighlightText(props) {
			const { text, query } = props;
			if (query === "" || props.isMatch !== true) return text;
			const lower = text.toLowerCase();
			const needle = query.toLowerCase();
			if (needle === "") return text;
			const parts = [];
			let i = 0;
			while (i < text.length) {
				const hit = lower.indexOf(needle, i);
				if (hit === -1) {
					parts.push({ text: text.slice(i), hit: false });
					break;
				}
				if (hit > i) parts.push({ text: text.slice(i, hit), hit: false });
				parts.push({ text: text.slice(hit, hit + needle.length), hit: true });
				i = hit + needle.length;
			}
			return parts.map((part, idx) => part.hit
				? h("mark", { key: idx, className: "dsh-conv-mark" }, part.text)
				: part.text);
		}

		function OutlineRow(props) {
			const node = props.node;
			const hasChildren = node.children.length > 0;
			let className = "dsh-conv-item";
			if (props.active) className += " dsh-conv-item-active";
			if (node.isUserQuery === true) className += " dsh-conv-item-user";
			let chevronClass = "dsh-conv-chevron";
			if (hasChildren === false) chevronClass += " dsh-conv-chevron-hidden";
			if (node.collapsed !== true) chevronClass += " dsh-conv-chevron-open";
			const children = [
				h("span", {
					key: "chevron",
					className: chevronClass,
					onClick: (e) => {
						if (hasChildren === false) return;
						e.stopPropagation();
						props.onToggle(node);
					},
				}, h(ChevronGlyph)),
			];
			if (node.isUserQuery === true) {
				children.push(h("span", { key: "badge", className: "dsh-conv-badge" }, node.queryIndex));
			}
			let textClass = "dsh-conv-itemtext";
			if (node.streaming === true) textClass += " dsh-conv-itemstreaming";
			children.push(h("span", { key: "text", className: textClass },
				h(HighlightText, { text: node.text, query: props.query, isMatch: node.isMatch === true })));
			if (typeof node.ts === "number") {
				children.push(h("span", { key: "time", className: "dsh-conv-time" }, formatTime(node.ts)));
			}
			children.push(h("span", {
				key: "bookmark",
				className: node.isBookmarked === true ? "dsh-conv-bookmark dsh-conv-bookmark-active" : "dsh-conv-bookmark",
				title: node.isBookmarked === true ? props.t("action.bookmarkRemove") : props.t("action.bookmarkAdd"),
				onClick: (e) => {
					e.stopPropagation();
					props.onBookmark(node);
				},
			}, h(StarGlyph)));
			return h("div", {
				className,
				style: { paddingLeft: 8 + node.level * 14 },
				"data-level": node.level,
				"data-hq-id": node.id,
				role: "button",
				tabIndex: 0,
				onClick: () => props.onClick(node),
				onKeyDown: (e) => {
					if (e.key !== "Enter" && e.key !== " ") return;
					e.preventDefault();
					props.onClick(node);
				},
			}, children);
		}

		/**
		 * 无 hooks 的外壳：store 不可用时直接不渲染。
		 * 放在这里而不是组件内部，是为了不在 hooks 之前做条件返回。
		 */
		function HistoryOutlinePanel(props) {
			const store = props === undefined || props === null ? undefined : props.store;
			if (store === undefined || store === null
				|| typeof store.subscribe !== "function" || typeof store.getSnapshot !== "function") {
				return null;
			}
			return h(HistoryOutlinePanelInner, props);
		}

		function HistoryOutlinePanelInner(props) {
			const safeProps = props === undefined || props === null ? {} : props;
			const store = safeProps.store;
			const sessions = safeProps.sessions;
			const useSessions = safeProps.useSessions;
			const t = useMemo(() => makeTranslate(safeProps.t), [safeProps.t]);

			const chrome = useSyncExternalStore(store.subscribe, store.getSnapshot);
			const currentId = typeof useSessions === "function" ? useSessions((s) => s.current) : undefined;

			const [copied, setCopied] = useState(false);
			const copiedTimer = useRef(0);
			useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

			const [unlocatable, setUnlocatable] = useState(false);
			const unlocatableTimer = useRef(0);
			useEffect(() => () => window.clearTimeout(unlocatableTimer.current), []);

			// 每个会话一个大纲管理器（收藏按会话持久化，层级偏好全局）。
			const manager = useMemo(() => {
				if (currentId === undefined) return null;
				try {
					return new OutlineManager({
						expandLevel: loadExpandLevel(),
						bookmarks: loadBookmarks(currentId),
						onExpandLevelChange: saveExpandLevel,
						onBookmarksChange: (ids) => saveBookmarks(currentId, ids),
					});
				} catch (e) {
					console.warn("[conversation] outline manager init failed; panel disabled", e);
					return null;
				}
			}, [currentId]);

			const binding = useMemo(() => {
				if (currentId === undefined || sessions === undefined || sessions === null) return null;
				try {
					return typeof sessions.binding === "function" ? sessions.binding(currentId) : null;
				} catch (e) {
					console.warn("[conversation] sessions.binding() failed; panel stays empty", e);
					return null;
				}
			}, [currentId, sessions]);

			const subscribeSession = useCallback((fn) => {
				try {
					const face = binding === null || binding === undefined ? undefined : binding.session;
					if (face === undefined || face === null || typeof face.subscribe !== "function") return () => {};
					const dispose = face.subscribe(fn);
					return typeof dispose === "function" ? dispose : () => {};
				} catch (e) {
					return () => {};
				}
			}, [binding]);

			const getSnapshotValue = useCallback(() => {
				try {
					const face = binding === null || binding === undefined ? undefined : binding.session;
					if (face === undefined || face === null || typeof face.getSnapshot !== "function") return undefined;
					return face.getSnapshot();
				} catch (e) {
					console.warn("[conversation] session snapshot unavailable; panel stays empty", e);
					return undefined;
				}
			}, [binding]);

			const snapshot = useSyncExternalStore(subscribeSession, getSnapshotValue);

			const items = useMemo(() => {
				if (snapshot === undefined || snapshot === null) return [];
				try {
					return buildOutlineItems(snapshot);
				} catch (e) {
					console.warn("[conversation] outline build failed; showing an empty panel", e);
					return [];
				}
			}, [snapshot]);

			useEffect(() => {
				if (manager === null) return;
				manager.setItems(items);
			}, [manager, items]);

			const [, bump] = useReducer((x) => x + 1, 0);
			useEffect(() => {
				if (manager === null) return undefined;
				return manager.subscribe(bump);
			}, [manager]);

			const state = manager === null ? undefined : manager.getState();

			// 阅读位置跟随（捕获阶段监听会话根 + rAF 节流）
			const activeIdRef = useRef(null);
			const listRef = useRef(null);
			const [, bumpActive] = useReducer((x) => x + 1, 0);
			useEffect(() => {
				if (state === undefined) return undefined;
				const root = findChatRoot();
				if (root === null) return undefined;
				const flat = [];
				const collect = (nodes) => {
					for (const node of nodes) {
						flat.push(node);
						collect(node.children);
					}
				};
				collect(state.tree);
				const followActive = (id) => {
					const list = listRef.current;
					if (id === null || id === undefined || list === null) return;
					let row = null;
					try {
						row = list.querySelector('[data-hq-id="' + String(id).replace(/"/g, '\\"') + '"]');
					} catch (e) {
						return;
					}
					if (row instanceof HTMLElement) ensureElementInView(row, list);
				};
				let raf = 0;
				const onScroll = () => {
					if (raf !== 0) return;
					raf = window.requestAnimationFrame(() => {
						raf = 0;
						let id = null;
						try {
							id = resolveVisibleActiveId(computeActiveItemId(root, flat), state.tree, state.visible);
						} catch (e) { /* 阅读位置跟随是 best-effort */ }
						if (id !== activeIdRef.current) {
							activeIdRef.current = id;
							bumpActive();
							followActive(id);
						}
					});
				};
				root.addEventListener("scroll", onScroll, { capture: true, passive: true });
				onScroll();
				return () => {
					root.removeEventListener("scroll", onScroll, { capture: true });
					if (raf !== 0) window.cancelAnimationFrame(raf);
				};
			}, [state, currentId]);

			// 标题栏拖拽（4px 移动阈值：没有阈值时标题栏按钮的 pointerup 会误判成拖动）
			const panelRef = useRef(null);
			const onDragStart = useCallback((e) => {
				if (e.button !== 0) return;
				const panel = panelRef.current;
				if (panel === null) return;
				const rect = panel.getBoundingClientRect();
				const dx = e.clientX - rect.left;
				const dy = e.clientY - rect.top;
				const startX = e.clientX;
				const startY = e.clientY;
				let moved = false;
				const clampX = (x) => Math.max(0, Math.min(window.innerWidth - rect.width, x));
				const clampY = (y) => Math.max(0, Math.min(window.innerHeight - 80, y));
				const onMove = (ev) => {
					if (moved === false && Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
					moved = true;
					panel.style.left = clampX(ev.clientX - dx) + "px";
					panel.style.top = clampY(ev.clientY - dy) + "px";
					panel.style.right = "auto";
				};
				const onUp = (ev) => {
					window.removeEventListener("pointermove", onMove);
					window.removeEventListener("pointerup", onUp);
					if (moved === false) return;
					store.set({ left: clampX(ev.clientX - dx), top: clampY(ev.clientY - dy) });
				};
				window.addEventListener("pointermove", onMove);
				window.addEventListener("pointerup", onUp);
			}, [store]);

			const onItemClick = (node) => {
				const root = findChatRoot();
				let ok = false;
				try {
					ok = root !== null && scrollToItem(root, node);
				} catch (e) {
					ok = false;
				}
				window.clearTimeout(unlocatableTimer.current);
				setUnlocatable(ok === false);
				if (ok === false) {
					unlocatableTimer.current = window.setTimeout(() => setUnlocatable(false), 2000);
				}
				if (manager !== null && node.collapsed === true) manager.revealNode(node.index);
			};

			const onCopy = () => {
				if (state === undefined) return;
				const lines = [];
				const walk = (nodes) => {
					for (const node of nodes) {
						const indent = "  ".repeat(Math.max(0, node.level));
						lines.push(node.isUserQuery === true
							? "Q" + (node.queryIndex === undefined ? "" : node.queryIndex) + ". " + node.text
							: indent + "#".repeat(node.level) + " " + node.text);
						walk(node.children);
					}
				};
				walk(state.tree);
				try {
					if (navigator.clipboard !== undefined && navigator.clipboard !== null) {
						navigator.clipboard.writeText(lines.join("\n"));
					}
				} catch (e) { /* 剪贴板不可用：静默 */ }
				window.clearTimeout(copiedTimer.current);
				setCopied(true);
				copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
			};

			const queryCount = items.filter((item) => item.isUserQuery === true).length;

			if (chrome.pinned !== true) {
				return h("button", {
					type: "button",
					className: "dsh-conv-fab",
					title: t("panel.title"),
					"aria-label": t("panel.title"),
					onClick: () => store.set({ pinned: true }),
				}, t("panel.title") + " (" + queryCount + ")");
			}

			const panelStyle = typeof chrome.left === "number" && typeof chrome.top === "number"
				? { width: PANEL_WIDTH, left: chrome.left, top: chrome.top }
				: { width: PANEL_WIDTH, right: 16, top: 72 };

			const allExpanded = state !== undefined && state.isAllExpanded === true;
			const bookmarkMode = state !== undefined && state.bookmarkMode === true;

			const listChildren = state === undefined || state.visible.length === 0
				? [h("div", { key: "empty", className: "dsh-conv-empty" },
					h("span", { className: "dsh-conv-emptyglyph" }, h(OutlineGlyph)),
					h("div", null, t("panel.empty")),
					h("div", { className: "dsh-conv-emptyhint" }, t("panel.emptyHint")))]
				: state.visible.map((node) => h(OutlineRow, {
					key: node.id,
					node,
					active: node.id === activeIdRef.current,
					query: state.searchQuery,
					t,
					onClick: onItemClick,
					onToggle: (target) => { if (manager !== null) manager.toggleNode(target.index); },
					onBookmark: (target) => { if (manager !== null) manager.toggleBookmark(target.index); },
				}));

			return h("div", {
				ref: panelRef,
				className: "dsh-conv-panel",
				style: panelStyle,
				role: "complementary",
				"aria-label": t("panel.title"),
			},
				h("div", { className: "dsh-conv-header", onPointerDown: onDragStart },
					h("span", { className: "dsh-conv-headerglyph" }, h(OutlineGlyph)),
					h("span", { className: "dsh-conv-title" }, t("panel.title")),
					h("a", {
						className: "dsh-conv-iconbtn",
						href: REPO_URL,
						target: "_blank",
						rel: "noopener noreferrer",
						title: t("panel.github"),
						"aria-label": t("panel.github"),
						onPointerDown: (e) => e.stopPropagation(),
					}, h(GitHubGlyph)),
					h("button", {
						type: "button",
						className: "dsh-conv-iconbtn",
						title: t("panel.collapse"),
						"aria-label": t("panel.collapse"),
						onClick: () => store.set({ pinned: false }),
					}, h(CloseGlyph))),
				h("div", { className: "dsh-conv-toolbar" },
					h("button", {
						type: "button",
						className: "dsh-conv-iconbtn",
						title: allExpanded ? t("action.collapseAll") : t("action.expandAll"),
						"aria-label": allExpanded ? t("action.collapseAll") : t("action.expandAll"),
						onClick: () => {
							if (manager === null) return;
							if (allExpanded) manager.collapseAll();
							else manager.expandAll();
						},
					}, allExpanded ? h(CollapseAllGlyph) : h(ExpandAllGlyph)),
					h("button", {
						type: "button",
						className: bookmarkMode ? "dsh-conv-iconbtn dsh-conv-iconbtn-active" : "dsh-conv-iconbtn",
						title: t("action.bookmarkMode"),
						"aria-label": t("action.bookmarkMode"),
						"aria-pressed": bookmarkMode,
						onClick: () => { if (manager !== null) manager.setBookmarkMode(bookmarkMode === false); },
					}, h(StarGlyph)),
					h("button", {
						type: "button",
						className: copied ? "dsh-conv-iconbtn dsh-conv-iconbtn-copied" : "dsh-conv-iconbtn",
						title: copied ? t("action.copied") : t("action.copy"),
						"aria-label": copied ? t("action.copied") : t("action.copy"),
						onClick: onCopy,
					}, copied ? h(CheckGlyph) : h(CopyGlyph)),
					h("div", { className: "dsh-conv-searchbox" },
						h("span", { className: "dsh-conv-searchicon" }, h(SearchGlyph)),
						h("input", {
							className: "dsh-conv-search",
							type: "search",
							placeholder: t("search.placeholder"),
							value: state === undefined ? "" : state.searchQuery,
							onChange: (e) => { if (manager !== null) manager.setSearchQuery(e.target.value); },
						}),
						state !== undefined && state.searchQuery !== ""
							? h("button", {
								type: "button",
								className: "dsh-conv-searchclear",
								title: t("search.clear"),
								"aria-label": t("search.clear"),
								onClick: () => { if (manager !== null) manager.setSearchQuery(""); },
							}, h(CloseGlyph))
							: null)),
				h(LevelSlider, {
					expandLevel: state === undefined ? 6 : state.expandLevel,
					levelCounts: state === undefined ? {} : state.levelCounts,
					onChange: (level) => { if (manager !== null) manager.setLevel(level); },
					t,
				}),
				h("div", { className: "dsh-conv-list", ref: listRef }, listChildren),
				h("div", { className: "dsh-conv-footer" },
					h("button", {
						type: "button",
						className: "dsh-conv-footbtn",
						onClick: () => {
							const root = findChatRoot();
							if (root !== null) scrollChatToTop(root);
						},
					}, h(ScrollTopGlyph), t("action.scrollTop")),
					h("button", {
						type: "button",
						className: "dsh-conv-footbtn",
						onClick: () => {
							const root = findChatRoot();
							if (root !== null) scrollChatToBottom(root);
						},
					}, h(ScrollBottomGlyph), t("action.scrollBottom"))),
				unlocatable ? h("div", { className: "dsh-conv-toast", role: "status" }, t("action.unlocatable")) : null);
		}

		/** 客户端插件所需服务：槽位注册表与会话 face。 */
		const inject = ["slots", "sessions"];

		/**
		 * Client plugin body.
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			// 兼容性加固：apply 抛出会让本插件在客户端侧加载失败；整体兜底 + 逐项
			// 探测宿主 API 形状，任一环节改名/缺失都只降级本插件（面板不出现）。
			try {
				const slots = ctx.get("slots");
				const sessions = ctx.get("sessions");
				if (slots === undefined || sessions === undefined) {
					console.warn("[conversation] required services (slots/sessions) unavailable; panel disabled");
					return;
				}
				if (typeof slots.inject !== "function" || typeof slots.register !== "function") {
					console.warn("[conversation] slots API changed; panel disabled");
					return;
				}
				if (typeof sessions.binding !== "function") {
					console.warn("[conversation] sessions.binding API changed; panel disabled");
					return;
				}
				const store = createChromeStore();
				slots.inject("shell.overlay", () => slots.register({
					name: "shell.overlay",
					id: "question-history",
					order: 100,
					label: "历史提问 · 大纲",
				}, (props) => h(HistoryOutlinePanel, Object.assign({}, props, { store, sessions }))));
			} catch (err) {
				console.warn("[conversation] init failed; panel disabled: " + (err && err.message ? err.message : err));
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
