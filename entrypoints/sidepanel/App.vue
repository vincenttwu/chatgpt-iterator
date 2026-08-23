<script setup lang="ts">
import { browser } from 'wxt/browser';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { SidePanelControlClient, type ControlPlaneInvalidationReason, type ControlPlaneSnapshot } from '../../src/control-plane/index.ts';
import { DEFAULT_REPEAT_DELAY_SECONDS, DEFAULT_REPEAT_ITERATIONS, DEFAULT_REPEAT_MESSAGE, isRunTerminal, type DurableRunSnapshot, type RunLifecycleState } from '../../src/runs/index.ts';
import type { ChatGptTabLifecycleState, ChatGptTabRegistrySnapshot, ChatGptTabTarget } from '../../src/tabs/index.ts';
import {
  SidePanelOperationalClient,
  canPauseRun,
  canResumeRun,
  canStartExistingRun,
  canStopRun,
  choosePrimaryRun,
  runProgress,
} from '../../src/ui/run-workspace.ts';
import { ui, type UiMessageKey } from '../../src/ui/messages';
import { WORKSPACES, type WorkspaceId } from '../../src/ui/workspaces';
import Icon from './components/Icon.vue';

const activeWorkspace = ref<WorkspaceId>('run');
const activeDefinition = computed(() => WORKSPACES.find((workspace) => workspace.id === activeWorkspace.value) ?? WORKSPACES[0]!);
const connectionState = ref<'connected' | 'reconnecting' | 'stopped'>('reconnecting');
const snapshot = ref<ControlPlaneSnapshot>();
const runs = ref<DurableRunSnapshot[]>([]);
const selectedTabId = ref<number | null>(null);
const controlError = ref<string>();
const runError = ref<string>();
const operationBusy = ref(false);
const version = browser.runtime.getManifest().version;
const controlClient = new SidePanelControlClient(browser.runtime);
const operationalClient = new SidePanelOperationalClient(browser.runtime);
let connection: { stop(): void } | undefined;

const draft = reactive({
  presetId: '',
  messageTemplate: DEFAULT_REPEAT_MESSAGE,
  totalIterations: DEFAULT_REPEAT_ITERATIONS,
  delaySeconds: DEFAULT_REPEAT_DELAY_SECONDS,
  autoContinue: true,
  autoScroll: true,
});

const connectionLabel = computed(() => connectionState.value === 'connected'
  ? ui('runtimeConnected')
  : connectionState.value === 'reconnecting'
    ? ui('runtimeReconnecting')
    : ui('runtimeStopped'));

const targets = computed(() => snapshot.value?.tabs.targets ?? []);
const selectedTarget = computed(() => targets.value.find((target) => target.tabId === selectedTabId.value));
const currentRun = computed(() => choosePrimaryRun(runs.value));
const currentProgress = computed(() => currentRun.value === undefined ? undefined : runProgress(currentRun.value));
const hasNonTerminalRun = computed(() => runs.value.some((run) => !isRunTerminal(run.lifecycleState)));
const canStartNew = computed(() => {
  const target = selectedTarget.value;
  return !operationBusy.value
    && connectionState.value === 'connected'
    && !hasNonTerminalRun.value
    && target?.lifecycleState === 'ready'
    && draft.messageTemplate.trim().length > 0
    && Number.isSafeInteger(draft.totalIterations)
    && draft.totalIterations >= 1
    && draft.totalIterations <= 10_000
    && Number.isSafeInteger(draft.delaySeconds)
    && draft.delaySeconds >= 5
    && draft.delaySeconds <= 3_600;
});

function targetStateKey(state: ChatGptTabLifecycleState): UiMessageKey {
  return ({
    ready: 'targetReady',
    degraded: 'targetDegraded',
    loading: 'targetLoading',
    frozen: 'targetFrozen',
    discarded: 'targetDiscarded',
    unavailable: 'targetUnavailable',
  } satisfies Record<ChatGptTabLifecycleState, UiMessageKey>)[state];
}

function runStateKey(state: RunLifecycleState): UiMessageKey {
  return ({
    ready: 'runStateReady',
    running: 'runStateRunning',
    waiting_response: 'runStateWaitingResponse',
    waiting_delay: 'runStateWaitingDelay',
    paused: 'runStatePaused',
    frozen: 'runStateFrozen',
    discarded: 'runStateDiscarded',
    completed: 'runStateCompleted',
    failed: 'runStateFailed',
    stopped: 'runStateStopped',
  } satisfies Record<RunLifecycleState, UiMessageKey>)[state];
}

function targetOptionLabel(target: ChatGptTabTarget): string {
  const title = target.title?.trim() || `ChatGPT #${target.tabId}`;
  const active = target.active ? ` · ${ui('activeTabSuffix')}` : '';
  return `${title} · ${ui(targetStateKey(target.lifecycleState))}${active}`;
}

function applyTabs(nextTabs: ChatGptTabRegistrySnapshot): void {
  if (snapshot.value !== undefined) snapshot.value = { ...snapshot.value, tabs: nextTabs } as ControlPlaneSnapshot;
  syncTargetSelection(nextTabs);
}

function syncTargetSelection(tabsSnapshot: ChatGptTabRegistrySnapshot = snapshot.value?.tabs ?? { schemaVersion: 1, revision: 0, targets: [], binding: null, lastTermination: null }): void {
  const available = tabsSnapshot.targets;
  if (tabsSnapshot.binding !== null && available.some((target) => target.tabId === tabsSnapshot.binding?.tabId)) {
    selectedTabId.value = tabsSnapshot.binding.tabId;
    return;
  }
  if (selectedTabId.value !== null && available.some((target) => target.tabId === selectedTabId.value)) return;
  selectedTabId.value = available.find((target) => target.active)?.tabId ?? available[0]?.tabId ?? null;
}

async function hydrateControl(): Promise<void> {
  try {
    const outcome = await controlClient.hydrate();
    if (!outcome.applied || outcome.snapshot === undefined) return;
    snapshot.value = outcome.snapshot;
    syncTargetSelection(outcome.snapshot.tabs);
    controlError.value = undefined;
  } catch (error) {
    controlError.value = error instanceof Error ? error.message : ui('controlPlaneUnavailable');
  }
}

async function hydrateRuns(): Promise<void> {
  try {
    runs.value = await operationalClient.listRuns();
    runError.value = undefined;
  } catch (error) {
    runError.value = error instanceof Error ? error.message : ui('runError');
  }
}

async function hydrateAll(): Promise<void> {
  await Promise.all([hydrateControl(), hydrateRuns()]);
}

function onInvalidation(reason: ControlPlaneInvalidationReason): void {
  if (reason === 'run_changed') {
    void hydrateRuns();
    return;
  }
  if (reason === 'tab_changed' || reason === 'authority_changed') {
    void hydrateControl();
    return;
  }
  void hydrateAll();
}

async function refreshTargets(): Promise<void> {
  operationBusy.value = true;
  controlError.value = undefined;
  try {
    applyTabs(await operationalClient.refreshTabs());
  } catch (error) {
    controlError.value = error instanceof Error ? error.message : ui('controlPlaneUnavailable');
  } finally {
    operationBusy.value = false;
  }
}

async function bindSelectedTarget(): Promise<void> {
  if (selectedTabId.value === null) return;
  operationBusy.value = true;
  runError.value = undefined;
  try {
    applyTabs(await operationalClient.bindTarget(selectedTabId.value));
  } catch (error) {
    runError.value = error instanceof Error ? error.message : ui('runError');
  } finally {
    operationBusy.value = false;
  }
}

function upsertRun(run: DurableRunSnapshot): void {
  runs.value = [run, ...runs.value.filter((candidate) => candidate.id !== run.id)];
}

async function executeRunMutation(action: () => Promise<DurableRunSnapshot>): Promise<void> {
  operationBusy.value = true;
  runError.value = undefined;
  try {
    upsertRun(await action());
  } catch (error) {
    runError.value = error instanceof Error ? error.message : ui('runError');
  } finally {
    operationBusy.value = false;
  }
}

async function startNewRun(): Promise<void> {
  const target = selectedTarget.value;
  if (target === undefined || target.lifecycleState !== 'ready') {
    runError.value = ui('targetNotReady');
    return;
  }
  if (!canStartNew.value) {
    runError.value = ui('invalidRunConfiguration');
    return;
  }
  await executeRunMutation(() => operationalClient.startRepeat({
    targetTabId: target.tabId,
    targetWindowId: target.windowId,
    messageTemplate: draft.messageTemplate,
    totalIterations: draft.totalIterations,
    delaySeconds: draft.delaySeconds,
    autoContinue: draft.autoContinue,
    autoScroll: draft.autoScroll,
  }));
}

async function mutateCurrent(kind: 'start' | 'pause' | 'resume' | 'stop'): Promise<void> {
  const run = currentRun.value;
  if (run === undefined) return;
  await executeRunMutation(() => kind === 'start'
    ? operationalClient.start(run)
    : kind === 'pause'
      ? operationalClient.pause(run)
      : kind === 'resume'
        ? operationalClient.resume(run)
        : operationalClient.stop(run));
}

async function selectWorkspace(workspace: WorkspaceId, focus = false): Promise<void> {
  activeWorkspace.value = workspace;
  if (!focus) return;
  await nextTick();
  document.getElementById(`tab-${workspace}`)?.focus();
}

function onTabKeydown(event: KeyboardEvent, workspace: WorkspaceId): void {
  const index = WORKSPACES.findIndex((candidate) => candidate.id === workspace);
  if (index < 0) return;
  let nextIndex: number | undefined;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % WORKSPACES.length;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + WORKSPACES.length) % WORKSPACES.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = WORKSPACES.length - 1;
  if (nextIndex === undefined) return;
  event.preventDefault();
  void selectWorkspace(WORKSPACES[nextIndex]!.id, true);
}

onMounted(() => {
  connection = controlClient.connect({
    onInvalidation,
    onStateChange: (state) => {
      connectionState.value = state;
      if (state === 'connected') void hydrateAll();
    },
  });
  void hydrateAll();
});

onUnmounted(() => connection?.stop());
</script>

<template>
  <main class="shell" :data-workspace="activeWorkspace" :data-state="connectionState" aria-labelledby="app-title">
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ ui(activeDefinition.titleKey) }} — {{ connectionLabel }}<template v-if="currentRun"> — {{ ui(runStateKey(currentRun.lifecycleState)) }}</template>
    </p>

    <header class="shell__header">
      <div>
        <p class="eyebrow">{{ ui('appName') }}</p>
        <h1 id="app-title">{{ ui(activeDefinition.titleKey) }}</h1>
      </div>
      <span class="version" :aria-label="ui('versionLabel')">v{{ version }}</span>
    </header>

    <div class="control-status" :aria-label="ui('workspaceStatus')">
      <span>{{ connectionLabel }}</span>
      <span v-if="snapshot" aria-hidden="true">·</span>
      <span v-if="snapshot">{{ ui('controlPlaneRevision') }} {{ snapshot.authorityRevision }}</span>
      <template v-if="currentRun">
        <span aria-hidden="true">·</span>
        <span class="state-badge shell-state-badge" :data-state="currentRun.lifecycleState">{{ ui(runStateKey(currentRun.lifecycleState)) }}</span>
      </template>
    </div>

    <div class="tabs" role="tablist" :aria-label="ui('primaryWorkspaces')">
      <button
        v-for="workspace in WORKSPACES"
        :id="`tab-${workspace.id}`"
        :key="workspace.id"
        type="button"
        role="tab"
        :aria-controls="`panel-${workspace.id}`"
        :aria-selected="activeWorkspace === workspace.id"
        :tabindex="activeWorkspace === workspace.id ? 0 : -1"
        @keydown="onTabKeydown($event, workspace.id)"
        @click="selectWorkspace(workspace.id)"
      >
        <Icon :name="workspace.icon" size="16" />
        <span>{{ ui(workspace.labelKey) }}</span>
      </button>
    </div>

    <section
      :id="`panel-${activeWorkspace}`"
      class="workspace"
      role="tabpanel"
      :aria-labelledby="`tab-${activeWorkspace}`"
      tabindex="0"
    >
      <div v-if="activeWorkspace === 'run'" class="workspace-stack">
        <details class="workspace-card" open>
          <summary class="workspace-card__heading">
            <div>
              <p class="eyebrow">{{ ui('runTarget') }}</p>
              <h2>{{ ui('targetChatGptTab') }}</h2>
            </div>
            <span v-if="selectedTarget" class="state-badge" :data-state="selectedTarget.lifecycleState">{{ ui(targetStateKey(selectedTarget.lifecycleState)) }}</span>
          </summary>
          <p>{{ ui('targetDescription') }}</p>
          <div class="field-with-action">
            <div class="field-stack">
              <label for="target-tab">{{ ui('targetSelectLabel') }}</label>
              <select id="target-tab" v-model.number="selectedTabId" :disabled="operationBusy" @change="bindSelectedTarget">
                <option :value="null">{{ ui('chooseTarget') }}</option>
                <option v-for="target in targets" :key="target.tabId" :value="target.tabId">{{ targetOptionLabel(target) }}</option>
              </select>
            </div>
            <button type="button" class="secondary-action" :disabled="operationBusy" @click="refreshTargets">{{ ui('refreshTargets') }}</button>
          </div>
          <div v-if="selectedTarget" class="scope-card">
            <Icon name="info" size="16" />
            <div>
              <strong>{{ selectedTarget.title || `ChatGPT #${selectedTarget.tabId}` }}</strong>
              <span>{{ ui('tabIdLabel') }} {{ selectedTarget.tabId }} · {{ ui('connectedLabel') }}: {{ selectedTarget.contentConnected ? ui('yes') : ui('no') }}</span>
            </div>
          </div>
          <p v-else class="compact-empty">{{ ui('noChatGptTabs') }}</p>
        </details>

        <details class="workspace-card" open>
          <summary class="workspace-card__heading">
            <div>
              <p class="eyebrow">{{ ui('runConfiguration') }}</p>
              <h2>{{ ui('repeatMode') }}</h2>
            </div>
            <span class="state-badge">{{ ui('directRun') }}</span>
          </summary>
          <div class="field-stack">
            <label for="run-preset">{{ ui('preset') }}</label>
            <select id="run-preset" v-model="draft.presetId" :disabled="operationBusy || hasNonTerminalRun">
              <option value="">{{ ui('noPresetDirect') }}</option>
            </select>
            <small>{{ ui('presetDeferredHelp') }}</small>
          </div>
          <div class="field-stack">
            <label for="run-message">{{ ui('message') }}</label>
            <textarea id="run-message" v-model="draft.messageTemplate" rows="4" :disabled="operationBusy || hasNonTerminalRun" spellcheck="true" />
            <small>{{ ui('messageHelp') }}</small>
          </div>
          <div class="editor-grid">
            <div class="field-stack">
              <label for="run-iterations">{{ ui('iterations') }}</label>
              <input id="run-iterations" v-model.number="draft.totalIterations" type="number" min="1" max="10000" step="1" :disabled="operationBusy || hasNonTerminalRun">
            </div>
            <div class="field-stack">
              <label for="run-delay">{{ ui('delaySeconds') }}</label>
              <input id="run-delay" v-model.number="draft.delaySeconds" type="number" min="5" max="3600" step="1" :disabled="operationBusy || hasNonTerminalRun">
            </div>
          </div>
          <label class="check-row">
            <input v-model="draft.autoContinue" type="checkbox" :disabled="operationBusy || hasNonTerminalRun">
            <span><strong>{{ ui('autoContinue') }}</strong><small>{{ ui('autoContinueHelp') }}</small></span>
          </label>
          <label class="check-row">
            <input v-model="draft.autoScroll" type="checkbox" :disabled="operationBusy || hasNonTerminalRun">
            <span><strong>{{ ui('autoScroll') }}</strong><small>{{ ui('autoScrollHelp') }}</small></span>
          </label>
          <div class="actions">
            <button type="button" class="primary-action" :disabled="!canStartNew" @click="startNewRun">{{ operationBusy ? ui('working') : ui('startRun') }}</button>
          </div>
        </details>

        <details class="workspace-card" open>
          <summary class="workspace-card__heading">
            <div>
              <p class="eyebrow">{{ ui('currentRun') }}</p>
              <h2>{{ ui('progress') }}</h2>
            </div>
            <span v-if="currentRun" class="state-badge" :data-state="currentRun.lifecycleState">{{ ui(runStateKey(currentRun.lifecycleState)) }}</span>
          </summary>
          <p v-if="!currentRun" class="compact-empty">{{ ui('noCurrentRun') }}</p>
          <template v-else>
            <dl class="status-grid">
              <div><dt>{{ ui('runState') }}</dt><dd>{{ ui(runStateKey(currentRun.lifecycleState)) }}</dd></div>
              <div><dt>{{ ui('target') }}</dt><dd>#{{ currentRun.targetTabId }}</dd></div>
              <div><dt>{{ ui('completedIterations') }}</dt><dd>{{ currentProgress?.completed }} / {{ currentProgress?.total }}</dd></div>
              <div><dt>{{ ui('updated') }}</dt><dd>{{ new Date(currentRun.updatedAt).toLocaleTimeString() }}</dd></div>
            </dl>
            <div class="progress-block">
              <div class="progress-heading">
                <strong>{{ ui('progress') }}</strong>
                <span>{{ currentProgress?.percent }}%</span>
              </div>
              <progress :value="currentProgress?.completed ?? 0" :max="currentProgress?.total ?? 1" />
              <small v-if="currentProgress?.currentIteration">{{ ui('currentIteration') }} {{ currentProgress.currentIteration }} / {{ currentProgress.total }}</small>
            </div>
            <div v-if="currentRun.lifecycleState === 'frozen'" class="inline-warning" role="status">{{ ui('frozenExplanation') }}</div>
            <div v-else-if="currentRun.lifecycleState === 'discarded'" class="inline-warning" role="status">{{ ui('discardedExplanation') }}</div>
            <div v-else-if="connectionState === 'reconnecting'" class="inline-warning" role="status">{{ ui('reconnectExplanation') }}</div>
            <div v-else-if="currentRun.lifecycleState === 'failed'" class="inline-error" role="alert">
              {{ ui('failedExplanation') }}<template v-if="currentRun.failure"> {{ currentRun.failure.message }}</template>
            </div>
            <div class="actions">
              <button v-if="canStartExistingRun(currentRun.lifecycleState)" type="button" class="primary-action" :disabled="operationBusy" @click="mutateCurrent('start')">{{ ui('startExisting') }}</button>
              <button v-if="canPauseRun(currentRun.lifecycleState)" type="button" class="secondary-action" :disabled="operationBusy" @click="mutateCurrent('pause')">{{ ui('pause') }}</button>
              <button v-if="canResumeRun(currentRun.lifecycleState)" type="button" class="primary-action" :disabled="operationBusy" @click="mutateCurrent('resume')">{{ ui('resume') }}</button>
              <button v-if="canStopRun(currentRun.lifecycleState)" type="button" class="danger-action" :disabled="operationBusy" @click="mutateCurrent('stop')">{{ ui('stop') }}</button>
            </div>
          </template>
        </details>

        <div v-if="controlError || runError" class="inline-error" role="alert">
          {{ runError || `${ui('controlPlaneUnavailable')}: ${controlError}` }}
        </div>
      </div>

      <details v-else class="workspace-card" open>
        <summary class="workspace-card__heading">
          <div>
            <p class="eyebrow">{{ ui('foundation') }}</p>
            <h2>{{ ui(activeDefinition.titleKey) }}</h2>
          </div>
          <span class="state-badge">{{ ui('foundationState') }}</span>
        </summary>
        <p>{{ ui(activeDefinition.descriptionKey) }}</p>
        <div class="scope-card">
          <Icon name="info" size="16" />
          <span>{{ ui('futureCapability') }}</span>
        </div>
      </details>
    </section>
  </main>
</template>
