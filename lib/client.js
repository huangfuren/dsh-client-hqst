window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-hqst",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		// Package-owned stylesheet, injected once at materialization and
		// claimed by the module system via data-plugin attributes (unloaded
		// with the plugin).
		const CSS_TEXT = `
      .dsh-hq-root {
        position: fixed;
        top: 72px;
        right: 16px;
        width: 300px;
        max-width: calc(100vw - 32px);
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 160px);
        background: var(--dsw-alias-bg-overlay);
        border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 12px;
        box-shadow: var(--dsw-shadow-lv2);
        color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family);
        font-size: 14px;
        line-height: 1.5;
        pointer-events: auto;
        z-index: 1000;
        overflow: hidden;
      }
      .dsh-hq-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid var(--dsw-alias-border-l1);
        flex-shrink: 0;
      }
      .dsh-hq-title {
        font-weight: 600;
        font-size: 14px;
        color: var(--dsw-alias-label-primary);
      }
      .dsh-hq-toggle {
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--dsw-alias-label-secondary);
        font-size: 14px;
        padding: 2px 8px;
        border-radius: 6px;
      }
      .dsh-hq-toggle:hover {
        background: var(--dsw-alias-interactive-bg-hover);
        color: var(--dsw-alias-label-primary);
      }
      .dsh-hq-list {
        overflow-y: auto;
        padding: 6px;
        flex: 1;
      }
      .dsh-hq-item {
        display: block;
        width: 100%;
        text-align: left;
        border: none;
        background: transparent;
        cursor: pointer;
        padding: 8px 10px;
        border-radius: 8px;
        color: var(--dsw-alias-label-primary);
      }
      .dsh-hq-item:hover {
        background: var(--dsw-alias-interactive-bg-hover);
      }
      .dsh-hq-item-text {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 13px;
        word-break: break-word;
      }
      .dsh-hq-item-time {
        margin-top: 4px;
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary);
      }
      .dsh-hq-empty {
        padding: 16px;
        text-align: center;
        color: var(--dsw-alias-label-tertiary);
        font-size: 13px;
      }
      .dsh-hq-fab {
        position: fixed;
        top: 72px;
        right: 16px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-overlay);
        border: 1px solid var(--dsw-alias-border-l1);
        box-shadow: var(--dsw-shadow-lv2);
        color: var(--dsw-alias-label-primary);
        font-family: var(--dsw-font-family);
        font-size: 13px;
        cursor: pointer;
        pointer-events: auto;
        z-index: 1000;
      }
      .dsh-hq-fab:hover {
        background: var(--dsw-alias-interactive-bg-hover);
      }
    `;
		const STYLE_ID = "@deepseek-ai/dsh-client-hqst/styles";
		// 样式注入是 best-effort：失败只影响外观，绝不能让模块求值抛异常。
		try {
			if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_ID) + "]") === null) {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@deepseek-ai/dsh-client-hqst";
				tag.dataset.pluginCss = STYLE_ID;
				tag.textContent = CSS_TEXT;
				document.head.appendChild(tag);
			}
		} catch (e) {
			console.warn("[hqst] stylesheet injection failed; panel renders unstyled", e);
		}

		// Resolved at apply time from the client context; the component reads
		// it lazily on render (the plugin is always mounted before any panel
		// render, so the late read is safe).
		let sessionsService = null;

		function extractQuestions(snapshot) {
			const out = [];
			if (snapshot === null || snapshot === undefined) return out;
			// dsh 0.1.5 的会话快照结构可能不含 chat.order/chat.nodes（宿主演进），
			// 结构不符时返回空列表而不是抛错，避免整个 shell.overlay 槽位崩溃。
			const chat = (snapshot.chat !== null && snapshot.chat !== undefined) ? snapshot.chat : {};
			const rawOrder = chat.order;
			const rawNodes = chat.nodes;
			if (!Array.isArray(rawOrder) && typeof rawOrder?.[Symbol.iterator] !== 'function') return out;
			const order = rawOrder;
			const nodes = (rawNodes !== null && rawNodes !== undefined && typeof rawNodes.get === 'function') ? rawNodes : new Map();
			for (const key of order) {
				const node = nodes.get(key);
				if (node === undefined) continue;
				if (node.kind !== "user" && node.kind !== "steering") continue;
				const data = node.data;
				const content = (data && data.content) ? data.content : [];
				let text = "";
				for (const block of content) {
					if (block && block.type === "text" && typeof block.text === "string") text += block.text;
				}
				text = text.replace(/\s+/g, " ").trim();
				if (text.length === 0) continue;
				out.push({ key: node.key, time: data.time, text });
			}
			return out;
		}

		function jumpTo(key) {
			// The chat anchor key is a DSH-internal contract. Newer DSH may move
			// the attribute name; fall back to a few known candidates so history
			// navigation never silently breaks on a DSH bump.
			const selectors = [
				'[data-chat-anchor-key="' + key + '"]',
				'[data-message-key="' + key + '"]',
				'[data-node-key="' + key + '"]',
			];
			let el = null;
			for (const sel of selectors) {
				el = document.querySelector(sel);
				if (el !== null) break;
			}
			if (el === null || !(el instanceof HTMLElement)) return;
			el.scrollIntoView({ behavior: "smooth", block: "center" });
			try {
				const brand = getComputedStyle(el).getPropertyValue("--dsw-alias-brand-primary").trim() || "#4d6bfe";
				el.animate([
					{ boxShadow: "0 0 0 3px " + brand, offset: 0 },
					{ boxShadow: "0 0 0 0px transparent", offset: 1 },
				], { duration: 1200, easing: "ease-out" });
			} catch (e) { /* highlight is best-effort */ }
		}

		function formatTime(ms) {
			try {
				return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			} catch (e) {
				return "";
			}
		}

		function HistoryPanel(props) {
			// 兼容性加固：宿主若不再注入 useSessions prop（或改名），组件必须优雅降级
			// 而非抛异常——槽位内一次渲染异常会带走整个 shell.overlay 槽位（含同槽位的
			// 其它插件）。此处对 prop 与 sessions face 的每一层形状都做探测。
			const useSessions = props === undefined || props === null ? undefined : props.useSessions;
			const currentId = typeof useSessions === "function" ? useSessions(s => s.current) : undefined;
			const [snapshot, setSnapshot] = React.useState(null);
			const [collapsed, setCollapsed] = React.useState(false);

			React.useEffect(() => {
				if (currentId === undefined) {
					setSnapshot(null);
					return undefined;
				}
				let alive = true;
				let dispose = null;
				try {
					const binding = (sessionsService === null || sessionsService === undefined)
						? undefined
						: sessionsService.binding(currentId);
					const face = (binding === undefined || binding === null) ? undefined : binding.session;
					if (face === undefined || face === null
						|| typeof face.getSnapshot !== "function"
						|| typeof face.subscribe !== "function") {
						setSnapshot(null);
						return undefined;
					}
					const sync = () => {
						if (!alive) return;
						try {
							setSnapshot(face.getSnapshot());
						} catch (e) {
							console.warn("[hqst] session snapshot unavailable; history panel stays empty", e);
							setSnapshot(null);
						}
					};
					sync();
					const d = face.subscribe(sync);
					dispose = typeof d === "function" ? d : null;
				} catch (e) {
					console.warn("[hqst] sessions API changed; history panel disabled", e);
					setSnapshot(null);
					return undefined;
				}
				return () => {
					alive = false;
					if (typeof dispose === "function") {
						try { dispose(); } catch (e) { /* unsubscribe is best-effort */ }
					}
				};
			}, [currentId]);

			if (currentId === undefined) return null;

			let questions = [];
			if (snapshot !== null && snapshot !== undefined) {
				try {
					questions = extractQuestions(snapshot);
				} catch (e) {
					console.warn("[hqst] question extraction failed; showing an empty list", e);
					questions = [];
				}
			}

			if (collapsed) {
				return React.createElement("button", {
					className: "dsh-hq-fab",
					onClick: () => setCollapsed(false),
					title: "历史提问",
				}, "历史提问 (" + questions.length + ")");
			}

			return React.createElement("div", { className: "dsh-hq-root" },
				React.createElement("div", { className: "dsh-hq-header" },
					React.createElement("span", { className: "dsh-hq-title" },
						"历史提问" + (questions.length > 0 ? " (" + questions.length + ")" : ""),
					),
					React.createElement("button", {
						className: "dsh-hq-toggle",
						onClick: () => setCollapsed(true),
						title: "收起",
						"aria-label": "收起历史提问面板",
					}, "—"),
				),
				React.createElement("div", { className: "dsh-hq-list" },
					questions.length === 0
						? React.createElement("div", { className: "dsh-hq-empty" }, "暂无历史提问")
						: questions.map(item => React.createElement("button", {
							key: item.key,
							className: "dsh-hq-item",
							onClick: () => jumpTo(item.key),
							title: item.text,
						},
							React.createElement("div", { className: "dsh-hq-item-text" }, item.text),
							React.createElement("div", { className: "dsh-hq-item-time" }, formatTime(item.time)),
						)),
				),
			);
		}

		/** Required client services: the slot registry and the sessions face. */
		const inject = ["slots", "sessions"];

		/**
		 * Client plugin body.
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			// 兼容性加固：apply 抛出会让本插件在客户端侧加载失败；这里整体兜底并逐项
			// 探测宿主 API 形状，任一环节改名/缺失都只降级本插件（面板不出现）。
			try {
				const slots = ctx.get("slots");
				const sessions = ctx.get("sessions");
				if (slots === undefined || sessions === undefined) {
					console.warn("[hqst] required services (slots/sessions) unavailable; history panel disabled");
					return;
				}
				if (typeof slots.inject !== "function" || typeof slots.register !== "function") {
					console.warn("[hqst] slots API changed; history panel disabled");
					return;
				}
				if (typeof sessions.binding !== "function") {
					console.warn("[hqst] sessions.binding API changed; history panel disabled");
					return;
				}
				sessionsService = sessions;
				slots.inject("shell.overlay", () => slots.register(
					{ name: "shell.overlay", id: "question-history", order: 100, label: "历史提问" },
					(props) => React.createElement(HistoryPanel, { useSessions: props === undefined || props === null ? undefined : props.useSessions }),
				));
			} catch (err) {
				console.warn("[hqst] init failed; history panel disabled: " + (err && err.message ? err.message : err));
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
