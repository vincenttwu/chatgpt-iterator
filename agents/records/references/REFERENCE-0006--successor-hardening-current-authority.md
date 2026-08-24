---
schema_version: 1
record_id: REFERENCE-0006
record_type: reference
slug: successor-hardening-current-authority
title: "Successor Hardening Current Browser, Accessibility, and ChatGPT Surface Authority"
status: active
revision: 2
created_at: 2026-08-24T11:26:00+08:00
updated_at: 2026-08-24T14:08:00+08:00
created_by: agent
updated_by: agent
owners: []
scope:
  repository: workspace
  packages: []
  paths: [entrypoints/, src/chatgpt/, src/runtime/, src/runs/, agents/records/roadmaps/ROADMAP-0002--interaction-surface-and-runtime-hardening.md]
relations:
  related: [ROADMAP-0002, AUDIT-0002, AUDIT-0003, MATRIX-0002, ADR-0001, CONSTRAINT-0001]
  depends_on: []
  blocks: []
  supersedes: []
  superseded_by: []
provenance:
  created_from:
    type: iteration
    id: roadmap-0002-step-01.v0.0.17
tags: [reference, chrome, message-sender, action, side-panel, wcag, chatgpt, dom]
---
# REFERENCE-0006 — Successor Hardening Current Browser, Accessibility, and ChatGPT Surface Authority

## Purpose

Freeze the external and user-provided facts that materially control ROADMAP-0002 planning. This reference is not a promise that ChatGPT DOM details remain stable; selector drift remains an explicit product risk.

## Chrome first-party authority refreshed 2026-08-24

### `chrome.runtime.MessageSender`

Chrome documents `MessageSender` as the actual context metadata accompanying a message/request. Depending on sender type it can expose extension ID, `tab`, `frameId`, `documentId`, document lifecycle, URL and origin. For messages originating from a content script and received by an extension, `sender.tab` is available.

Accepted implication: runtime authorization should derive/corroborate caller class from actual sender context at the message boundary instead of relying only on a self-declared JSON envelope `source` string.

Source: https://developer.chrome.com/docs/extensions/reference/api/runtime

### `chrome.action`

Chrome documents:

- dynamic action title/tooltip through `action.setTitle()`;
- badge text/background through `action.setBadgeText()` and related APIs;
- badge space is limited and short text (about four characters or fewer) is recommended;
- a popup is optional and, when configured, becomes the action-click surface for that tab rather than normal `action.onClicked` handling.

Accepted implication: use badge/title for status. Do not introduce a conventional default popup while the product intentionally uses the toolbar action as the Side Panel launcher.

Source: https://developer.chrome.com/docs/extensions/reference/api/action

### `chrome.sidePanel`

Chrome documents `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` for allowing the toolbar action to toggle/open the extension Side Panel, and documents `sidePanel.open()` as requiring a qualifying user interaction.

Accepted implication: preserve existing toolbar-click → Side Panel behavior; the successor mini controller may offer **Open Side Panel** as an explicit user action.

Source: https://developer.chrome.com/docs/extensions/reference/api/sidePanel

## Accessibility authority refreshed 2026-08-24

WCAG 2.2 Success Criterion 2.5.7 (Dragging Movements, Level AA) requires functionality that uses dragging to also be achievable through a single-pointer interaction without dragging unless dragging is essential.

Accepted implication: optional mini-controller dragging must have dock/snap/reset click/tap alternatives. Keyboard support alone does not replace the required non-drag pointer alternative.

Sources:

- https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- https://www.w3.org/WAI/WCAG22/Techniques/general/G219.html

## User-provided current ChatGPT HTML evidence (2026-08-24)

The planning session included a current ChatGPT page HTML capture. Relevant observations:

1. Visible composer:
   - `id="prompt-textarea"`
   - `contenteditable="true"`
   - `role="textbox"`
   - `aria-multiline="true"`
   - `aria-label="Chat with ChatGPT"`
2. A hidden fallback `<textarea name="prompt-textarea">` exists in the same composer subtree.
3. Assistant messages still expose `data-message-author-role="assistant"` in the capture.
4. Conversation links use `/c/<conversation-id>` route shape; active sidebar conversation state is present in the current layout.
5. In the captured idle/empty-composer state, `data-testid="send-button"` and `data-testid="stop-button"` are absent and the trailing action is a voice control. This supports treating send/stop/Continue as transient capabilities rather than permanent structural anchors.
6. The composer is rendered in a sticky bottom thread surface, so an injected fixed bottom-right controller can overlap native ChatGPT controls on some viewport/layout states.
7. The original userscript's injected host is not expected inside a `<body>`-only serialization because that script attached its host to `document.documentElement` and rendered the actual UI in Shadow DOM.

## Accepted product disposition

- Keep all ChatGPT selectors/DOM interpretation inside `src/chatgpt/`.
- Treat URL/location conversation context as primary identity evidence; sidebar active state can remain diagnostic only.
- Prefer the visible contenteditable composer and detect hidden fallback ambiguity explicitly.
- Separate structural anchors from transient capabilities.
- Use Shadow DOM for the secondary in-page controller to isolate it from ChatGPT generated/Tailwind class churn.
- Do not rely on this single HTML capture as a permanent contract; STEP-08 must harden degradation/diagnostics for drift.

## Revision history

| Date | Revision | Change | Status |
| --- | ---: | --- | --- |
| 2026-08-24 | 1 | Freeze current Chrome MessageSender/action/Side Panel, WCAG dragging, and user-provided ChatGPT DOM facts for ROADMAP-0002 planning. | active |

## ROADMAP-0002 closure recheck — v0.0.25

The external/browser facts frozen at roadmap opening remain the controlling reference at closure. No new Chrome permission or host authority was required by STEP-02 through STEP-09. The content script remains scoped to `https://chatgpt.com/*` and `https://chat.openai.com/*`; toolbar click remains Side Panel authority; sender-derived trust continues to use actual runtime sender metadata; drag remains optional with non-drag alternatives.

Current ChatGPT HTML evidence remains treated as drift-prone evidence rather than an API. The product now encodes that stance directly by separating structural composer/assistant anchors, transient action capabilities and diagnostics in the selector registry.

Closure environment recheck: Chromium is present at `/usr/bin/chromium`. A single fresh `npm install --ignore-scripts --no-audit --no-fund` attempt timed out after 120 seconds and left neither `node_modules` nor `package-lock.json`. WXT prepare/full Vue typecheck/build/package and packaged Chrome/real-ChatGPT smoke therefore remain `DEFERRED_ENVIRONMENT`; no unavailable lane is recorded as passed.
