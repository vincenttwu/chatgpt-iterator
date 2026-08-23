// ==UserScript==
// @name         ChatGPT Auto Iteration
// @namespace    https://userscripts.local/chatgpt-auto-iteration
// @version      0.1.0
// @description  Repeatedly send a customizable follow-up message for a bounded number of ChatGPT iterations.
// @author       Custom userscript
// @license      MIT
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdn.jsdelivr.net/npm/@kudoai/chatgpt.js@4.15.6/dist/chatgpt.min.js#sha256-zp2Wy06WHvPDCRWgIE/ZHNT0cLqAGIsgleJjfDEITjw=
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
 * Inspired by the control patterns used in:
 * - https://github.com/adamlui/chatgpt-auto-continue
 * - https://github.com/adamlui/chatgpt-infinity
 *
 * Iteration semantics:
 * - The iteration count is the number of user messages this script sends.
 * - Start while idle: the first message is sent immediately.
 * - Start while ChatGPT is responding: the script waits for the response to finish.
 * - The run state is intentionally not restored after a page reload.
 */

(async () => {
    'use strict';

    const SCRIPT_NAME = 'ChatGPT Auto Iteration';
    const STORAGE_PREFIX = 'chatgptAutoIteration.';
    const DEFAULTS = Object.freeze({
        messageTemplate: 'Continue with the next iteration.',
        iterationCount: 5,
        delaySeconds: 7,
        autoClickContinue: true,
        autoScroll: true,
        panelCollapsed: false,
    });
    const LIMITS = Object.freeze({
        minIterations: 1,
        maxIterations: 1000,
        minDelaySeconds: 5,
        maxDelaySeconds: 3600,
        responseStartTimeoutMs: 120000,
        responseStableMs: 3500,
        pollMs: 400,
    });

    const settings = loadSettings();
    const run = {
        id: 0,
        running: false,
        paused: false,
        sent: 0,
        total: 0,
        phase: 'Idle',
        lastError: '',
    };

    let ui = null;

    await waitForChatGPT();
    ui = createPanel();
    registerMenuCommands();
    render();

    function storageKey(name) {
        return `${STORAGE_PREFIX}${name}`;
    }

    function loadSettings() {
        return {
            messageTemplate: String(GM_getValue(storageKey('messageTemplate'), DEFAULTS.messageTemplate)),
            iterationCount: clampInteger(
                GM_getValue(storageKey('iterationCount'), DEFAULTS.iterationCount),
                LIMITS.minIterations,
                LIMITS.maxIterations,
                DEFAULTS.iterationCount,
            ),
            delaySeconds: clampInteger(
                GM_getValue(storageKey('delaySeconds'), DEFAULTS.delaySeconds),
                LIMITS.minDelaySeconds,
                LIMITS.maxDelaySeconds,
                DEFAULTS.delaySeconds,
            ),
            autoClickContinue: Boolean(
                GM_getValue(storageKey('autoClickContinue'), DEFAULTS.autoClickContinue),
            ),
            autoScroll: Boolean(GM_getValue(storageKey('autoScroll'), DEFAULTS.autoScroll)),
            panelCollapsed: Boolean(
                GM_getValue(storageKey('panelCollapsed'), DEFAULTS.panelCollapsed),
            ),
        };
    }

    function saveSetting(name, value) {
        settings[name] = value;
        GM_setValue(storageKey(name), value);
    }

    function clampInteger(value, min, max, fallback) {
        const parsed = Number.parseInt(String(value), 10);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForChatGPT() {
        try {
            await Promise.race([
                chatgpt.isLoaded(),
                sleep(10000),
            ]);
        } catch (error) {
            console.warn(`[${SCRIPT_NAME}] ChatGPT readiness check failed:`, error);
        }
    }

    function registerMenuCommands() {
        GM_registerMenuCommand('Open control panel', () => setPanelCollapsed(false));
        GM_registerMenuCommand('Start new run', () => startRun());
        GM_registerMenuCommand('Pause / resume run', () => togglePause());
        GM_registerMenuCommand('Stop run', () => stopRun('Stopped by user'));
    }

    function createPanel() {
        const host = document.createElement('div');
        host.id = 'chatgpt-auto-iteration-host';
        host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;';
        document.documentElement.append(host);

        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <style>
                :host { all: initial; }
                *, *::before, *::after { box-sizing: border-box; }
                .panel {
                    width: 360px;
                    max-width: calc(100vw - 24px);
                    color: #ececec;
                    background: rgba(24, 24, 27, 0.97);
                    border: 1px solid rgba(255,255,255,.16);
                    border-radius: 14px;
                    box-shadow: 0 14px 40px rgba(0,0,0,.38);
                    font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    overflow: hidden;
                    backdrop-filter: blur(12px);
                }
                .header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    padding: 10px 12px;
                    background: rgba(255,255,255,.055);
                    user-select: none;
                }
                .title { font-weight: 700; letter-spacing: .01em; }
                .header-actions { display: flex; gap: 6px; }
                .icon-btn {
                    width: 28px;
                    height: 28px;
                    border: 0;
                    border-radius: 7px;
                    color: inherit;
                    background: rgba(255,255,255,.08);
                    cursor: pointer;
                    font: inherit;
                }
                .icon-btn:hover { background: rgba(255,255,255,.15); }
                .body { padding: 12px; }
                .panel.collapsed .body { display: none; }
                label { display: block; margin: 0 0 5px; font-weight: 600; }
                textarea, input[type="number"] {
                    width: 100%;
                    color: #f5f5f5;
                    background: rgba(255,255,255,.075);
                    border: 1px solid rgba(255,255,255,.15);
                    border-radius: 8px;
                    outline: none;
                    font: inherit;
                }
                textarea { min-height: 92px; resize: vertical; padding: 9px 10px; }
                input[type="number"] { height: 36px; padding: 0 9px; }
                textarea:focus, input[type="number"]:focus { border-color: rgba(16, 163, 127, .9); }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 10px; }
                .checks { display: grid; gap: 7px; margin: 10px 0; }
                .check { display: flex; align-items: center; gap: 8px; font-weight: 500; margin: 0; }
                .check input { accent-color: #10a37f; }
                .hint { color: #a9a9b2; font-size: 11px; margin-top: 5px; }
                .buttons { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 8px; margin-top: 10px; }
                .btn {
                    height: 36px;
                    border: 1px solid rgba(255,255,255,.14);
                    border-radius: 8px;
                    color: #f5f5f5;
                    background: rgba(255,255,255,.09);
                    cursor: pointer;
                    font: 600 13px/1 ui-sans-serif, system-ui, sans-serif;
                }
                .btn:hover { background: rgba(255,255,255,.16); }
                .btn.primary { background: #10a37f; border-color: #10a37f; color: white; }
                .btn.primary:hover { background: #0d8f70; }
                .btn:disabled { opacity: .45; cursor: not-allowed; }
                .status {
                    margin-top: 10px;
                    padding: 9px 10px;
                    border-radius: 8px;
                    background: rgba(255,255,255,.06);
                    color: #d6d6da;
                    min-height: 36px;
                    word-break: break-word;
                }
                .status.error { color: #ffb4b4; background: rgba(153,27,27,.22); }
                .launcher {
                    display: none;
                    width: 48px;
                    height: 48px;
                    border: 1px solid rgba(255,255,255,.16);
                    border-radius: 50%;
                    color: white;
                    background: #10a37f;
                    box-shadow: 0 10px 30px rgba(0,0,0,.34);
                    cursor: pointer;
                    font: 700 18px/1 ui-sans-serif, system-ui, sans-serif;
                }
                .panel.collapsed + .launcher { display: block; }
                @media (prefers-color-scheme: light) {
                    .panel { color: #202123; background: rgba(255,255,255,.97); border-color: rgba(0,0,0,.13); }
                    .header { background: rgba(0,0,0,.035); }
                    .icon-btn, .btn { color: #202123; background: rgba(0,0,0,.055); border-color: rgba(0,0,0,.12); }
                    .icon-btn:hover, .btn:hover { background: rgba(0,0,0,.1); }
                    textarea, input[type="number"] { color: #202123; background: rgba(0,0,0,.035); border-color: rgba(0,0,0,.14); }
                    .hint { color: #67676f; }
                    .status { color: #3f3f46; background: rgba(0,0,0,.045); }
                    .btn.primary { color: white; background: #10a37f; }
                }
            </style>
            <section class="panel" aria-label="ChatGPT Auto Iteration controls">
                <div class="header">
                    <div class="title">Auto Iteration</div>
                    <div class="header-actions">
                        <button class="icon-btn collapse" type="button" title="Minimize">−</button>
                    </div>
                </div>
                <div class="body">
                    <label for="message">Message template</label>
                    <textarea id="message" spellcheck="true"></textarea>
                    <div class="hint">Placeholders: {iteration}, {total}, {remaining}, {timestamp}</div>

                    <div class="grid">
                        <div>
                            <label for="count">Iterations</label>
                            <input id="count" type="number" min="${LIMITS.minIterations}" max="${LIMITS.maxIterations}" step="1">
                        </div>
                        <div>
                            <label for="delay">Delay (seconds)</label>
                            <input id="delay" type="number" min="${LIMITS.minDelaySeconds}" max="${LIMITS.maxDelaySeconds}" step="1">
                        </div>
                    </div>

                    <div class="checks">
                        <label class="check"><input id="continue" type="checkbox"> Click “Continue generating” automatically</label>
                        <label class="check"><input id="scroll" type="checkbox"> Scroll to the bottom before each send</label>
                    </div>

                    <div class="buttons">
                        <button class="btn primary start" type="button">Start</button>
                        <button class="btn pause" type="button">Pause</button>
                        <button class="btn stop" type="button">Stop</button>
                    </div>
                    <div class="status" role="status" aria-live="polite"></div>
                </div>
            </section>
            <button class="launcher" type="button" title="Open Auto Iteration">↻</button>
        `;

        const elements = {
            host,
            shadow,
            panel: shadow.querySelector('.panel'),
            launcher: shadow.querySelector('.launcher'),
            collapse: shadow.querySelector('.collapse'),
            message: shadow.querySelector('#message'),
            count: shadow.querySelector('#count'),
            delay: shadow.querySelector('#delay'),
            autoContinue: shadow.querySelector('#continue'),
            autoScroll: shadow.querySelector('#scroll'),
            start: shadow.querySelector('.start'),
            pause: shadow.querySelector('.pause'),
            stop: shadow.querySelector('.stop'),
            status: shadow.querySelector('.status'),
        };

        elements.message.value = settings.messageTemplate;
        elements.count.value = String(settings.iterationCount);
        elements.delay.value = String(settings.delaySeconds);
        elements.autoContinue.checked = settings.autoClickContinue;
        elements.autoScroll.checked = settings.autoScroll;

        elements.message.addEventListener('change', syncSettingsFromPanel);
        elements.count.addEventListener('change', syncSettingsFromPanel);
        elements.delay.addEventListener('change', syncSettingsFromPanel);
        elements.autoContinue.addEventListener('change', syncSettingsFromPanel);
        elements.autoScroll.addEventListener('change', syncSettingsFromPanel);
        elements.start.addEventListener('click', startRun);
        elements.pause.addEventListener('click', togglePause);
        elements.stop.addEventListener('click', () => stopRun('Stopped by user'));
        elements.collapse.addEventListener('click', () => setPanelCollapsed(true));
        elements.launcher.addEventListener('click', () => setPanelCollapsed(false));

        setPanelCollapsed(settings.panelCollapsed, elements);
        return elements;
    }

    function syncSettingsFromPanel() {
        if (!ui) return;

        const template = ui.message.value.trim();
        const iterations = clampInteger(
            ui.count.value,
            LIMITS.minIterations,
            LIMITS.maxIterations,
            settings.iterationCount,
        );
        const delay = clampInteger(
            ui.delay.value,
            LIMITS.minDelaySeconds,
            LIMITS.maxDelaySeconds,
            settings.delaySeconds,
        );

        saveSetting('messageTemplate', template);
        saveSetting('iterationCount', iterations);
        saveSetting('delaySeconds', delay);
        saveSetting('autoClickContinue', ui.autoContinue.checked);
        saveSetting('autoScroll', ui.autoScroll.checked);

        ui.count.value = String(iterations);
        ui.delay.value = String(delay);
    }

    function setPanelCollapsed(collapsed, elements = ui) {
        saveSetting('panelCollapsed', Boolean(collapsed));
        if (!elements) return;
        elements.panel.classList.toggle('collapsed', Boolean(collapsed));
    }

    async function startRun() {
        if (!ui) return;

        if (run.running && run.paused) {
            run.paused = false;
            run.phase = 'Resuming';
            render();
            return;
        }

        if (run.running) {
            run.phase = 'Already running';
            render();
            return;
        }

        syncSettingsFromPanel();
        if (!settings.messageTemplate) {
            run.lastError = 'Message template cannot be empty.';
            run.phase = 'Configuration error';
            render();
            return;
        }

        run.id += 1;
        const runId = run.id;
        run.running = true;
        run.paused = false;
        run.sent = 0;
        run.total = settings.iterationCount;
        run.phase = 'Waiting for ChatGPT to become idle';
        run.lastError = '';
        render();

        try {
            await executeRun(runId);
        } catch (error) {
            if (!isCurrentRun(runId)) return;
            console.error(`[${SCRIPT_NAME}]`, error);
            run.running = false;
            run.paused = false;
            run.lastError = error instanceof Error ? error.message : String(error);
            run.phase = 'Stopped after an error';
            render();
        }
    }

    async function executeRun(runId) {
        while (isCurrentRun(runId) && run.sent < run.total) {
            await waitWhilePaused(runId);
            if (!isCurrentRun(runId)) return;

            run.phase = run.sent === 0
                ? 'Waiting for an idle composer'
                : `Waiting ${settings.delaySeconds}s before next iteration`;
            render();

            await waitUntilIdle(runId);
            if (!isCurrentRun(runId)) return;

            if (run.sent > 0) {
                await interruptibleDelay(settings.delaySeconds * 1000, runId);
                await waitWhilePaused(runId);
                if (!isCurrentRun(runId)) return;
                await waitUntilIdle(runId);
            }

            const iteration = run.sent + 1;
            const message = renderMessage(settings.messageTemplate, iteration, run.total);
            const baselineSignature = latestAssistantSignature();

            if (composerDraftText()) {
                throw new Error('The composer contains unsent text. Clear or send the draft before running automation.');
            }
            if (settings.autoScroll) safeScrollToBottom();
            run.phase = `Sending iteration ${iteration} of ${run.total}`;
            render();

            await sendMessage(message);
            run.sent = iteration;
            run.phase = `Waiting for response ${iteration} of ${run.total}`;
            render();

            await waitForResponseCompletion(runId, baselineSignature);
        }

        if (!isCurrentRun(runId)) return;
        run.running = false;
        run.paused = false;
        run.phase = `Completed ${run.sent} iteration${run.sent === 1 ? '' : 's'}`;
        render();
    }

    function stopRun(reason = 'Stopped') {
        run.id += 1;
        run.running = false;
        run.paused = false;
        run.phase = reason;
        render();
    }

    function togglePause() {
        if (!run.running) {
            run.phase = 'Nothing is running';
            render();
            return;
        }
        run.paused = !run.paused;
        run.phase = run.paused ? 'Paused after the current browser action' : 'Resuming';
        render();
    }

    function isCurrentRun(runId) {
        return run.running && run.id === runId;
    }

    async function waitWhilePaused(runId) {
        while (isCurrentRun(runId) && run.paused) {
            await sleep(250);
        }
    }

    async function interruptibleDelay(ms, runId) {
        let remaining = ms;
        while (remaining > 0 && isCurrentRun(runId)) {
            await waitWhilePaused(runId);
            if (!isCurrentRun(runId)) return;
            const slice = Math.min(remaining, 250);
            await sleep(slice);
            remaining -= slice;
        }
    }

    async function waitUntilIdle(runId) {
        let stableSince = 0;

        while (isCurrentRun(runId)) {
            await waitWhilePaused(runId);
            if (!isCurrentRun(runId)) return;

            const continueButton = settings.autoClickContinue ? getContinueButton() : null;
            if (continueButton) {
                run.phase = 'Clicking “Continue generating”';
                render();
                continueButton.click();
                stableSince = 0;
                await sleep(1800);
                continue;
            }

            if (isChatGPTBusy()) {
                stableSince = 0;
                await sleep(LIMITS.pollMs);
                continue;
            }

            if (!stableSince) stableSince = Date.now();
            if (Date.now() - stableSince >= 1000) return;
            await sleep(LIMITS.pollMs);
        }
    }

    async function waitForResponseCompletion(runId, baselineSignature) {
        const startedAt = Date.now();
        let observedActivity = false;
        let lastSignature = baselineSignature;
        let lastChangeAt = Date.now();

        while (isCurrentRun(runId)) {
            await waitWhilePaused(runId);
            if (!isCurrentRun(runId)) return;

            const continueButton = settings.autoClickContinue ? getContinueButton() : null;
            if (continueButton) {
                run.phase = 'Continuing an interrupted response';
                render();
                continueButton.click();
                observedActivity = true;
                lastChangeAt = Date.now();
                await sleep(1800);
                continue;
            }

            const busy = isChatGPTBusy();
            const signature = latestAssistantSignature();
            if (busy || signature !== baselineSignature) observedActivity = true;
            if (signature !== lastSignature) {
                lastSignature = signature;
                lastChangeAt = Date.now();
            }

            if (observedActivity && !busy && Date.now() - lastChangeAt >= LIMITS.responseStableMs) {
                return;
            }

            if (!observedActivity && Date.now() - startedAt >= LIMITS.responseStartTimeoutMs) {
                throw new Error(
                    'No assistant response was detected within two minutes. The run was stopped to prevent duplicate sends.',
                );
            }

            await sleep(LIMITS.pollMs);
        }
    }

    function renderMessage(template, iteration, total) {
        const replacements = {
            iteration: String(iteration),
            total: String(total),
            remaining: String(Math.max(0, total - iteration)),
            timestamp: new Date().toISOString(),
        };
        return template.replace(/\{(iteration|total|remaining|timestamp)\}/g, (_, key) => replacements[key]);
    }

    async function sendMessage(message) {
        let primaryError = null;
        try {
            await Promise.resolve(chatgpt.send(message));
            return;
        } catch (error) {
            primaryError = error;
            console.warn(`[${SCRIPT_NAME}] chatgpt.send failed, trying DOM fallback:`, error);
        }

        try {
            await sendMessageWithDom(message);
        } catch (fallbackError) {
            throw new Error(
                `Unable to send the message. chatgpt.js: ${formatError(primaryError)}; DOM fallback: ${formatError(fallbackError)}`,
            );
        }
    }

    async function sendMessageWithDom(message) {
        const composer = document.querySelector('#prompt-textarea');
        if (!composer) throw new Error('Composer #prompt-textarea was not found');

        composer.focus();
        if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
            const prototype = composer instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (!setter) throw new Error('Native composer value setter was not found');
            setter.call(composer, message);
            composer.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            composer.textContent = '';
            document.execCommand('insertText', false, message);
            composer.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: message,
            }));
        }

        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const button = getSendButton();
            if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
                button.click();
                return;
            }
            await sleep(100);
        }
        throw new Error('Enabled send button was not found');
    }

    function getSendButton() {
        return firstVisible([
            document.querySelector('button[data-testid="send-button"]'),
            ...document.querySelectorAll('button[aria-label]'),
        ].filter(button => button && (
            button.matches?.('[data-testid="send-button"]')
            || /^(send|傳送|发送|送信)/i.test(button.getAttribute('aria-label') || '')
        )));
    }

    function isChatGPTBusy() {
        if (getStopButton()) return true;
        try {
            return Boolean(chatgpt.isTyping?.());
        } catch (error) {
            console.debug(`[${SCRIPT_NAME}] isTyping failed:`, error);
            return false;
        }
    }

    function composerDraftText() {
        const composer = document.querySelector('#prompt-textarea');
        if (!composer) return '';
        if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
            return composer.value.trim();
        }
        return (composer.innerText || composer.textContent || '').trim();
    }

    function getStopButton() {
        try {
            const button = chatgpt.getStopButton?.();
            if (isVisible(button)) return button;
        } catch (error) {
            console.debug(`[${SCRIPT_NAME}] getStopButton failed:`, error);
        }

        return firstVisible([
            document.querySelector('button[data-testid="stop-button"]'),
            ...document.querySelectorAll('button[aria-label]'),
        ].filter(button => button && (
            button.matches?.('[data-testid="stop-button"]')
            || /(stop generating|stop response|停止生成|停止回應|停止回应)/i.test(button.getAttribute('aria-label') || '')
        )));
    }

    function getContinueButton() {
        try {
            const button = chatgpt.getContinueBtn?.();
            if (isVisible(button)) return button;
        } catch (error) {
            console.debug(`[${SCRIPT_NAME}] getContinueBtn failed:`, error);
        }

        const textPattern = /(continue generating|continue response|繼續生成|继续生成|繼續回應|继续回应)/i;
        return firstVisible(
            [...document.querySelectorAll('button')]
                .filter(button => textPattern.test((button.innerText || button.textContent || '').trim())),
        );
    }

    function firstVisible(elements) {
        return elements.find(isVisible) || null;
    }

    function isVisible(element) {
        if (!(element instanceof Element)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity || 1) !== 0
            && rect.width > 0
            && rect.height > 0;
    }

    function latestAssistantSignature() {
        const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
        const latest = messages[messages.length - 1];
        if (!latest) return '0:';
        const text = (latest.innerText || latest.textContent || '').replace(/\s+/g, ' ').trim();
        return `${messages.length}:${text.length}:${text.slice(-240)}`;
    }

    function safeScrollToBottom() {
        try {
            chatgpt.scrollToBottom();
        } catch (error) {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
        }
    }

    function formatError(error) {
        if (error instanceof Error) return error.message;
        return String(error ?? 'unknown error');
    }

    function render() {
        if (!ui) return;

        ui.start.textContent = run.running && run.paused ? 'Resume' : 'Start';
        ui.start.disabled = run.running && !run.paused;
        ui.pause.disabled = !run.running;
        ui.pause.textContent = run.paused ? 'Resume' : 'Pause';
        ui.stop.disabled = !run.running;

        ui.message.disabled = run.running;
        ui.count.disabled = run.running;
        ui.delay.disabled = run.running;
        ui.autoContinue.disabled = run.running;
        ui.autoScroll.disabled = run.running;

        const progress = run.running || run.sent > 0
            ? ` · ${run.sent}/${run.total || settings.iterationCount} sent`
            : '';
        ui.status.textContent = `${run.phase}${progress}${run.lastError ? ` · ${run.lastError}` : ''}`;
        ui.status.classList.toggle('error', Boolean(run.lastError));
    }
})();
