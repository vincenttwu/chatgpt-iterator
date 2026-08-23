<script setup lang="ts">
import { browser } from 'wxt/browser';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { SidePanelControlClient, type ControlPlaneInvalidationReason, type ControlPlaneSnapshot } from '../../src/control-plane/index.ts';
import { DEFAULT_REPEAT_DELAY_SECONDS, DEFAULT_REPEAT_ITERATIONS, DEFAULT_REPEAT_MESSAGE, isRunTerminal, type DurableRunSnapshot, type RunLifecycleState } from '../../src/runs/index.ts';
import type { ChatGptTabLifecycleState, ChatGptTabRegistrySnapshot, ChatGptTabTarget } from '../../src/tabs/index.ts';
import type { TemplateSnapshot } from '../../src/templates/index.ts';
import type { PresetReferenceCatalog, PresetSnapshot } from '../../src/presets/index.ts';
import type { QueueHydration, QueueReferenceCatalog, QueueSnapshot } from '../../src/queues/index.ts';
import {
  SidePanelOperationalClient,
  canPauseRun,
  canResumeRun,
  canStartExistingRun,
  canStopRun,
  choosePrimaryRun,
  runProgress,
} from '../../src/ui/run-workspace.ts';
import {
  SidePanelTemplateClient,
  blankTemplateDraft,
  isTemplateDraftDirty,
  isTemplateDraftStale,
  previewTemplateDraft,
  templateDraftFrom,
  validateTemplateDraft,
  TEMPLATE_VARIABLES,
  type TemplateDraft,
} from '../../src/ui/template-workspace.ts';
import {
  SidePanelPresetClient,
  blankPresetDraft,
  isPresetDraftDirty,
  isPresetDraftStale,
  normalizePresetDraftMode,
  presetDraftFrom,
  runWorkingCopyFromPreset,
  validatePresetDraft,
  type PresetDraft,
} from '../../src/ui/preset-workspace.ts';
import {
  SidePanelQueueClient,
  blankQueueDraft,
  blankQueueItem,
  isQueueDraftDirty,
  isQueueDraftStale,
  moveQueueItem,
  normalizeQueueItem,
  queueDraftFrom,
  removeQueueItem,
  validateQueueDraft,
  type QueueDraft,
} from '../../src/ui/queue-workspace.ts';
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
const templateClient = new SidePanelTemplateClient(browser.runtime);
const presetClient = new SidePanelPresetClient(browser.runtime);
const queueClient = new SidePanelQueueClient(browser.runtime);
const templates = ref<TemplateSnapshot[]>([]);
const selectedTemplateId = ref('');
const templateBase = ref<TemplateSnapshot>();
const templateDraft = reactive<TemplateDraft>(blankTemplateDraft());
const templateBusy = ref(false);
const templateError = ref<string>();
const templateStale = ref(false);
const presets = ref<PresetSnapshot[]>([]);
const presetReferences = ref<PresetReferenceCatalog>({ templates: [], queues: [] });
const selectedPresetId = ref('');
const presetBase = ref<PresetSnapshot>();
const presetDraft = reactive<PresetDraft>(blankPresetDraft());
const presetBusy = ref(false);
const presetError = ref<string>();
const presetStale = ref(false);
const queueHydrations = ref<QueueHydration[]>([]);
const queues = ref<QueueSnapshot[]>([]);
const queueReferences = ref<QueueReferenceCatalog>({ templates: [] });
const selectedQueueId = ref('');
const queueBase = ref<QueueHydration>();
const queueDraft = reactive<QueueDraft>(blankQueueDraft());
const queueBusy = ref(false);
const queueError = ref<string>();
const queueStale = ref(false);

let connection: { stop(): void } | undefined;

const draft = reactive({
  presetId: '',
  mode: 'repeat' as 'repeat' | 'queue',
  queueId: '',
  messageTemplate: DEFAULT_REPEAT_MESSAGE,
  totalIterations: DEFAULT_REPEAT_ITERATIONS,
  delaySeconds: DEFAULT_REPEAT_DELAY_SECONDS,
  autoContinue: true,
  autoScroll: true,
  preventDiscard: true,
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
const templateDirty = computed(() => isTemplateDraftDirty(templateDraft, templateBase.value));
const templateLatest = computed(() => templateBase.value === undefined ? undefined : templates.value.find((item) => item.id === templateBase.value?.id));
const templatePreview = computed(() => {
  try { return { value: previewTemplateDraft(templateDraft), error: undefined as string | undefined }; }
  catch (error) { return { value: '', error: error instanceof Error ? error.message : ui('templatePreviewUnavailable') }; }
});
const queueDirty = computed(() => isQueueDraftDirty(queueDraft, queueBase.value));
const queueLatest = computed(() => queueBase.value === undefined ? undefined : queues.value.find((item) => item.id === queueBase.value?.queue.id));
const queueStateKey = computed<UiMessageKey>(() => queueStale.value ? 'queueStaleState' : queueBase.value === undefined ? 'queueNewState' : queueDirty.value ? 'queueModifiedState' : 'queueSavedState');
const presetDirty = computed(() => isPresetDraftDirty(presetDraft, presetBase.value));
const presetLatest = computed(() => presetBase.value === undefined ? undefined : presets.value.find((item) => item.id === presetBase.value?.id));
const presetStateKey = computed<UiMessageKey>(() => presetStale.value
  ? 'presetStaleState'
  : presetBase.value === undefined
    ? 'presetNewState'
    : presetDirty.value
      ? 'presetModifiedState'
      : 'presetSavedState');
const templateStateKey = computed<UiMessageKey>(() => templateStale.value
  ? 'templateStaleState'
  : templateBase.value === undefined
    ? 'templateNewState'
    : templateDirty.value
      ? 'templateModifiedState'
      : 'templateSavedState');

const canStartNew = computed(() => {
  const target = selectedTarget.value;
  return !operationBusy.value
    && connectionState.value === 'connected'
    && !hasNonTerminalRun.value
    && target?.lifecycleState === 'ready'
    && (draft.mode === 'queue' ? Boolean(draft.queueId) : (draft.messageTemplate.trim().length > 0 && Number.isSafeInteger(draft.totalIterations) && draft.totalIterations >= 1 && draft.totalIterations <= 10_000))
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

function replaceTemplateDraft(next: TemplateDraft): void {
  Object.assign(templateDraft, next);
}

function loadTemplateRecord(record: TemplateSnapshot): void {
  templateBase.value = record;
  selectedTemplateId.value = record.id;
  replaceTemplateDraft(templateDraftFrom(record));
  templateStale.value = false;
  templateError.value = undefined;
}

function clearTemplateWorkingCopy(): void {
  templateBase.value = undefined;
  selectedTemplateId.value = '';
  replaceTemplateDraft(blankTemplateDraft());
  templateStale.value = false;
  templateError.value = undefined;
}

function replacePresetDraft(next: PresetDraft): void { Object.assign(presetDraft, next); }

function loadPresetRecord(record: PresetSnapshot): void {
  presetBase.value = record;
  selectedPresetId.value = record.id;
  replacePresetDraft(presetDraftFrom(record));
  presetStale.value = false;
  presetError.value = undefined;
}

function clearPresetWorkingCopy(): void {
  presetBase.value = undefined;
  selectedPresetId.value = '';
  replacePresetDraft(blankPresetDraft());
  presetStale.value = false;
  presetError.value = undefined;
}

function replaceQueueDraft(next: QueueDraft): void { Object.assign(queueDraft, next); }
function loadQueueRecord(record: QueueHydration): void { queueBase.value = record; selectedQueueId.value = record.queue.id; replaceQueueDraft(queueDraftFrom(record)); queueStale.value = false; queueError.value = undefined; }
function clearQueueWorkingCopy(): void { queueBase.value = undefined; selectedQueueId.value = ''; replaceQueueDraft(blankQueueDraft()); queueStale.value = false; queueError.value = undefined; }
async function hydrateQueues(): Promise<void> {
  try {
    const next = await queueClient.list(); queues.value = next;
    const base = queueBase.value;
    if (base !== undefined) {
      const latest = next.find((item) => item.id === base.queue.id);
      if (latest === undefined || latest.revision !== base.queue.revision) {
        if (queueDirty.value) queueStale.value = true;
        else if (latest !== undefined) loadQueueRecord(await queueClient.hydrate(latest.id));
        else clearQueueWorkingCopy();
      }
    }
    queueError.value = undefined;
  } catch (error) { queueError.value = error instanceof Error ? error.message : ui('queueOperationFailed'); }
}
async function hydrateQueueReferences(): Promise<void> { try { queueReferences.value = await queueClient.references(); } catch (error) { queueError.value = error instanceof Error ? error.message : ui('queueOperationFailed'); } }

async function hydratePresets(): Promise<void> {
  try {
    const next = await presetClient.list();
    presets.value = next;
    const base = presetBase.value;
    if (base !== undefined) {
      const latest = next.find((item) => item.id === base.id);
      if (latest === undefined || latest.revision !== base.revision) {
        if (presetDirty.value) presetStale.value = true;
        else if (latest !== undefined) loadPresetRecord(latest);
        else clearPresetWorkingCopy();
      }
    }
    presetError.value = undefined;
  } catch (error) {
    presetError.value = error instanceof Error ? error.message : ui('presetOperationFailed');
  }
}

async function hydratePresetReferences(): Promise<void> {
  try { presetReferences.value = await presetClient.references(); }
  catch (error) { presetError.value = error instanceof Error ? error.message : ui('presetOperationFailed'); }
}

async function hydrateTemplates(): Promise<void> {
  try {
    const next = await templateClient.list();
    templates.value = next;
    const base = templateBase.value;
    if (base !== undefined) {
      const latest = next.find((item) => item.id === base.id);
      if (latest === undefined || latest.revision !== base.revision) {
        if (templateDirty.value) templateStale.value = true;
        else if (latest !== undefined) loadTemplateRecord(latest);
        else clearTemplateWorkingCopy();
      }
    }
    templateError.value = undefined;
  } catch (error) {
    templateError.value = error instanceof Error ? error.message : ui('templateOperationFailed');
  }
}

async function hydrateAll(): Promise<void> {
  await Promise.all([hydrateControl(), hydrateRuns(), hydrateTemplates(), hydratePresets(), hydratePresetReferences(), hydrateQueues(), hydrateQueueReferences()]);
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
  if (reason === 'template_changed') {
    void Promise.all([hydrateTemplates(), hydratePresetReferences()]);
    return;
  }
  if (reason === 'preset_changed') {
    void hydratePresets();
    return;
  }
  if (reason === 'queue_changed') {
    void Promise.all([hydrateQueues(), hydratePresetReferences()]);
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
  await executeRunMutation(() => draft.mode === 'queue'
    ? operationalClient.startQueue({ targetTabId: target.tabId, targetWindowId: target.windowId, queueId: draft.queueId, delaySeconds: draft.delaySeconds, autoContinue: draft.autoContinue, autoScroll: draft.autoScroll, preventDiscard: draft.preventDiscard })
    : operationalClient.startRepeat({ targetTabId: target.tabId, targetWindowId: target.windowId, messageTemplate: draft.messageTemplate, totalIterations: draft.totalIterations, delaySeconds: draft.delaySeconds, autoContinue: draft.autoContinue, autoScroll: draft.autoScroll, preventDiscard: draft.preventDiscard }));
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

async function applyRunPreset(): Promise<void> {
  if (!draft.presetId || hasNonTerminalRun.value) return;
  operationBusy.value = true;
  runError.value = undefined;
  try {
    const copy = runWorkingCopyFromPreset(await presetClient.hydrate(draft.presetId));
    draft.presetId = copy.presetId;
    draft.mode = copy.mode;
    if (copy.mode === 'queue') draft.queueId = copy.queueId;
    else { draft.queueId = ''; draft.messageTemplate = copy.messageTemplate; draft.totalIterations = copy.totalIterations; }
    draft.delaySeconds = copy.delaySeconds;
    draft.autoContinue = copy.autoContinue;
    draft.autoScroll = copy.autoScroll;
    draft.preventDiscard = copy.preventDiscard;
  } catch (error) {
    runError.value = error instanceof Error ? error.message : ui('presetHydrationFailed');
  } finally {
    operationBusy.value = false;
  }
}

function guardQueueDiscard(): boolean { if (!queueDirty.value) return true; queueError.value = ui('queueDirtyGuard'); selectedQueueId.value = queueBase.value?.queue.id ?? ''; return false; }
function beginNewQueue(): void { if (guardQueueDiscard()) clearQueueWorkingCopy(); }
async function loadSelectedQueue(): Promise<void> { if (!guardQueueDiscard()) return; if (!selectedQueueId.value) { clearQueueWorkingCopy(); return; } try { loadQueueRecord(await queueClient.hydrate(selectedQueueId.value)); } catch (error) { queueError.value = error instanceof Error ? error.message : ui('queueOperationFailed'); } }
function addQueueItem(): void { queueDraft.items.push(blankQueueItem()); }
function setQueueItemKind(index: number): void { const item = queueDraft.items[index]; if (item) normalizeQueueItem(item); }
function setQueueItemDelay(index: number, event: Event): void { const item = queueDraft.items[index]; const input = event.target as HTMLInputElement | null; if (!item || !input) return; item.delayAfterSeconds = input.value === '' ? null : Number(input.value); }
function moveQueueDraftItem(index:number,direction:-1|1):void { moveQueueItem(queueDraft,index,direction); }
function removeQueueDraftItem(index:number):void { removeQueueItem(queueDraft,index); }
async function executeQueueMutation(action:()=>Promise<QueueHydration>):Promise<void>{queueBusy.value=true;queueError.value=undefined;try{const record=await action();loadQueueRecord(record);await Promise.all([hydrateQueues(),hydratePresetReferences()]);}catch(error){queueError.value=error instanceof Error?error.message:ui('queueOperationFailed');if(isQueueDraftStale(queueDraft,queueLatest.value))queueStale.value=true;}finally{queueBusy.value=false;}}
async function saveQueueAs():Promise<void>{try{validateQueueDraft(queueDraft);}catch(error){queueError.value=error instanceof Error?error.message:ui('queueOperationFailed');return;}await executeQueueMutation(()=>queueClient.create(queueDraft));}
async function updateQueue():Promise<void>{if(queueStale.value){queueError.value=ui('queueStaleGuard');return;}await executeQueueMutation(()=>queueClient.update(queueDraft));}
function resetQueue():void{const latest=queueLatest.value;if(latest!==undefined){void queueClient.hydrate(latest.id).then(loadQueueRecord);return;}if(queueBase.value!==undefined)loadQueueRecord(queueBase.value);else clearQueueWorkingCopy();}
async function duplicateQueue():Promise<void>{const base=queueBase.value;if(base===undefined||queueDirty.value||queueStale.value)return;await executeQueueMutation(()=>queueClient.duplicate(base));}
async function deleteQueue():Promise<void>{const base=queueBase.value;if(base===undefined||queueDirty.value||queueStale.value)return;queueBusy.value=true;queueError.value=undefined;try{await queueClient.delete(base);if(draft.queueId===base.queue.id)draft.queueId='';clearQueueWorkingCopy();await Promise.all([hydrateQueues(),hydratePresetReferences()]);}catch(error){queueError.value=error instanceof Error?error.message:ui('queueOperationFailed');if(isQueueDraftStale(queueDraft,queueLatest.value))queueStale.value=true;}finally{queueBusy.value=false;}}

function guardPresetDiscard(): boolean {
  if (!presetDirty.value) return true;
  presetError.value = ui('presetDirtyGuard');
  selectedPresetId.value = presetBase.value?.id ?? '';
  return false;
}

function beginNewPreset(): void {
  if (!guardPresetDiscard()) return;
  clearPresetWorkingCopy();
}

function loadSelectedPreset(): void {
  if (!guardPresetDiscard()) return;
  const record = presets.value.find((item) => item.id === selectedPresetId.value);
  if (record === undefined) { clearPresetWorkingCopy(); return; }
  loadPresetRecord(record);
}

function onPresetModeChange(): void { normalizePresetDraftMode(presetDraft); }

async function executePresetMutation(action: () => Promise<PresetSnapshot>): Promise<void> {
  presetBusy.value = true;
  presetError.value = undefined;
  try {
    const record = await action();
    loadPresetRecord(record);
    await Promise.all([hydratePresets(), hydratePresetReferences()]);
  } catch (error) {
    presetError.value = error instanceof Error ? error.message : ui('presetOperationFailed');
    if (isPresetDraftStale(presetDraft, presetLatest.value)) presetStale.value = true;
  } finally {
    presetBusy.value = false;
  }
}

async function savePresetAs(): Promise<void> {
  try { validatePresetDraft(presetDraft); }
  catch (error) { presetError.value = error instanceof Error ? error.message : ui('presetOperationFailed'); return; }
  await executePresetMutation(() => presetClient.create(presetDraft));
}

async function updatePreset(): Promise<void> {
  if (presetStale.value) { presetError.value = ui('presetStaleGuard'); return; }
  await executePresetMutation(() => presetClient.update(presetDraft));
}

function resetPreset(): void {
  const latest = presetLatest.value;
  if (latest !== undefined) loadPresetRecord(latest);
  else if (presetBase.value !== undefined) loadPresetRecord(presetBase.value);
  else clearPresetWorkingCopy();
}

async function duplicatePreset(): Promise<void> {
  const base = presetBase.value;
  if (base === undefined || presetDirty.value || presetStale.value) return;
  await executePresetMutation(() => presetClient.duplicate(base));
}

async function deletePreset(): Promise<void> {
  const base = presetBase.value;
  if (base === undefined || presetDirty.value || presetStale.value) return;
  presetBusy.value = true;
  presetError.value = undefined;
  try {
    await presetClient.delete(base);
    if (draft.presetId === base.id) draft.presetId = '';
    clearPresetWorkingCopy();
    await hydratePresets();
  } catch (error) {
    presetError.value = error instanceof Error ? error.message : ui('presetOperationFailed');
    if (isPresetDraftStale(presetDraft, presetLatest.value)) presetStale.value = true;
  } finally {
    presetBusy.value = false;
  }
}

function guardTemplateDiscard(): boolean {
  if (!templateDirty.value) return true;
  templateError.value = ui('templateDirtyGuard');
  selectedTemplateId.value = templateBase.value?.id ?? '';
  return false;
}

function beginNewTemplate(): void {
  if (!guardTemplateDiscard()) return;
  clearTemplateWorkingCopy();
}

function loadSelectedTemplate(): void {
  if (!guardTemplateDiscard()) return;
  const record = templates.value.find((item) => item.id === selectedTemplateId.value);
  if (record === undefined) { clearTemplateWorkingCopy(); return; }
  loadTemplateRecord(record);
}

async function executeTemplateMutation(action: () => Promise<TemplateSnapshot>, reload = true): Promise<void> {
  templateBusy.value = true;
  templateError.value = undefined;
  try {
    const record = await action();
    if (reload) loadTemplateRecord(record);
    await hydrateTemplates();
  } catch (error) {
    templateError.value = error instanceof Error ? error.message : ui('templateOperationFailed');
    if (isTemplateDraftStale(templateDraft, templateLatest.value)) templateStale.value = true;
  } finally {
    templateBusy.value = false;
  }
}

async function saveTemplateAs(): Promise<void> {
  try { validateTemplateDraft(templateDraft); }
  catch (error) { templateError.value = error instanceof Error ? error.message : ui('templateOperationFailed'); return; }
  await executeTemplateMutation(() => templateClient.create(templateDraft));
}

async function updateTemplate(): Promise<void> {
  if (templateStale.value) { templateError.value = ui('templateStaleGuard'); return; }
  await executeTemplateMutation(() => templateClient.update(templateDraft));
}

function resetTemplate(): void {
  const latest = templateLatest.value;
  if (latest !== undefined) loadTemplateRecord(latest);
  else if (templateBase.value !== undefined) loadTemplateRecord(templateBase.value);
  else clearTemplateWorkingCopy();
}

async function duplicateTemplate(): Promise<void> {
  const base = templateBase.value;
  if (base === undefined || templateDirty.value || templateStale.value) return;
  await executeTemplateMutation(() => templateClient.duplicate(base));
}

async function deleteTemplate(): Promise<void> {
  const base = templateBase.value;
  if (base === undefined || templateDirty.value || templateStale.value) return;
  templateBusy.value = true;
  templateError.value = undefined;
  try {
    await templateClient.delete(base);
    clearTemplateWorkingCopy();
    await hydrateTemplates();
  } catch (error) {
    templateError.value = error instanceof Error ? error.message : ui('templateOperationFailed');
    if (isTemplateDraftStale(templateDraft, templateLatest.value)) templateStale.value = true;
  } finally {
    templateBusy.value = false;
  }
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
              <h2>{{ draft.mode === 'repeat' ? ui('repeatMode') : ui('queueMode') }}</h2>
            </div>
            <span class="state-badge">{{ ui('directRun') }}</span>
          </summary>
          <div class="field-with-action">
            <div class="field-stack">
              <label for="run-preset">{{ ui('preset') }}</label>
              <select id="run-preset" v-model="draft.presetId" :disabled="operationBusy || hasNonTerminalRun">
                <option value="">{{ ui('noPresetDirect') }}</option>
                <option v-for="item in presets" :key="item.id" :value="item.id">{{ item.name }} · {{ item.mode === 'repeat' ? ui('repeatMode') : ui('queueMode') }} · r{{ item.revision }}</option>
              </select>
              <small>{{ ui('presetDeferredHelp') }}</small>
            </div>
            <button type="button" class="secondary-action" :disabled="operationBusy || hasNonTerminalRun || !draft.presetId" @click="applyRunPreset">{{ ui('applyPreset') }}</button>
          </div>
          <div class="field-stack">
            <label for="run-mode">{{ ui('runMode') }}</label>
            <select id="run-mode" v-model="draft.mode" :disabled="operationBusy || hasNonTerminalRun">
              <option value="repeat">{{ ui('repeatMode') }}</option>
              <option value="queue">{{ ui('queueMode') }}</option>
            </select>
          </div>
          <div v-if="draft.mode === 'repeat'" class="field-stack">
            <label for="run-message">{{ ui('message') }}</label>
            <textarea id="run-message" v-model="draft.messageTemplate" rows="4" :disabled="operationBusy || hasNonTerminalRun" spellcheck="true" />
            <small>{{ ui('messageHelp') }}</small>
          </div>
          <div v-else class="field-stack">
            <label for="run-queue">{{ ui('runQueue') }}</label>
            <select id="run-queue" v-model="draft.queueId" :disabled="operationBusy || hasNonTerminalRun">
              <option value="">{{ ui('chooseRunQueue') }}</option>
              <option v-for="item in queues" :key="item.id" :value="item.id">{{ item.name }} · r{{ item.revision }}</option>
            </select>
            <small>{{ ui('queueModeDescription') }}</small>
          </div>
          <div class="editor-grid">
            <div v-if="draft.mode === 'repeat'" class="field-stack">
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
          <label class="check-row">
            <input v-model="draft.preventDiscard" type="checkbox" :disabled="operationBusy || hasNonTerminalRun">
            <span><strong>{{ ui('preventDiscard') }}</strong><small>{{ ui('preventDiscardHelp') }}</small></span>
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
              <div><dt>{{ ui('runMode') }}</dt><dd>{{ currentRun.execution.mode === 'repeat' ? ui('repeatMode') : ui('queueMode') }}</dd></div>
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

      <div v-else-if="activeWorkspace === 'queue'" class="workspace-stack">
        <details class="workspace-card" open>
          <summary class="workspace-card__heading"><div><p class="eyebrow">{{ ui('queueLibrary') }}</p><h2>{{ ui('queueWorkspace') }}</h2></div><span class="state-badge">{{ queues.length }}</span></summary>
          <p>{{ ui('queueLibraryDescription') }}</p>
          <div class="field-with-action"><div class="field-stack"><label for="queue-select">{{ ui('savedQueue') }}</label><select id="queue-select" v-model="selectedQueueId" :disabled="queueBusy"><option value="">{{ ui('chooseQueue') }}</option><option v-for="item in queues" :key="item.id" :value="item.id">{{ item.name }} · r{{ item.revision }}</option></select></div><button type="button" class="secondary-action" :disabled="queueBusy || !selectedQueueId" @click="loadSelectedQueue">{{ ui('loadQueue') }}</button></div>
          <p v-if="queues.length === 0" class="compact-empty">{{ ui('noQueues') }}</p>
        </details>
        <details class="workspace-card" open>
          <summary class="workspace-card__heading"><div><p class="eyebrow">{{ ui('queueWorkingCopy') }}</p><h2>{{ queueDraft.name.trim() || ui('newQueue') }}</h2></div><span class="state-badge" :data-state="queueStale ? 'failed' : undefined">{{ ui(queueStateKey) }}</span></summary>
          <div v-if="queueStale" class="inline-warning" role="status">{{ ui('queueStaleGuard') }}</div>
          <div class="field-stack"><label for="queue-name">{{ ui('queueName') }}</label><input id="queue-name" v-model="queueDraft.name" type="text" maxlength="120" :disabled="queueBusy"></div>
          <div class="structured-list" :aria-label="ui('queueItems')">
            <div v-for="(item,index) in queueDraft.items" :key="item.localKey" class="structured-row queue-item-row">
              <div class="progress-heading"><strong>{{ ui('queueItem') }} {{ index + 1 }}</strong><span>{{ item.enabled ? ui('yes') : ui('no') }}</span></div>
              <div class="editor-grid">
                <div class="field-stack"><label :for="`queue-kind-${index}`">{{ ui('queueItemSource') }}</label><select :id="`queue-kind-${index}`" v-model="item.kind" :disabled="queueBusy" @change="setQueueItemKind(index)"><option value="literal">{{ ui('literalMessage') }}</option><option value="template">{{ ui('templateReference') }}</option></select></div>
                <div class="field-stack"><label :for="`queue-delay-${index}`">{{ ui('delayAfterOverride') }}</label><input :id="`queue-delay-${index}`" :value="item.delayAfterSeconds ?? ''" type="number" min="5" max="3600" step="1" :placeholder="ui('useRunDelay')" :disabled="queueBusy" @input="setQueueItemDelay(index, $event)"></div>
              </div>
              <div v-if="item.kind === 'literal'" class="field-stack"><label :for="`queue-message-${index}`">{{ ui('queueMessage') }}</label><textarea :id="`queue-message-${index}`" v-model="item.message" rows="3" maxlength="65536" :disabled="queueBusy" /></div>
              <div v-else class="field-stack"><label :for="`queue-template-${index}`">{{ ui('queueTemplate') }}</label><select :id="`queue-template-${index}`" v-model="item.templateId" :disabled="queueBusy"><option :value="null">{{ ui('chooseQueueTemplate') }}</option><option v-for="template in queueReferences.templates" :key="template.id" :value="template.id">{{ template.name }} · r{{ template.revision }}{{ !template.enabled ? ` · ${ui('templateDisabledState')}` : '' }}</option></select></div>
              <label class="check-row"><input v-model="item.enabled" type="checkbox" :disabled="queueBusy"><span><strong>{{ ui('queueEnabled') }}</strong></span></label>
              <div class="actions"><button type="button" class="secondary-action" :disabled="queueBusy || index === 0" @click="moveQueueDraftItem(index,-1)">{{ ui('moveUp') }}</button><button type="button" class="secondary-action" :disabled="queueBusy || index === queueDraft.items.length - 1" @click="moveQueueDraftItem(index,1)">{{ ui('moveDown') }}</button><button type="button" class="danger-action" :disabled="queueBusy || queueDraft.items.length <= 1" @click="removeQueueDraftItem(index)">{{ ui('remove') }}</button></div>
            </div>
          </div>
          <div class="actions"><button type="button" class="secondary-action" :disabled="queueBusy" @click="addQueueItem">{{ ui('addQueueItem') }}</button></div>
          <dl v-if="queueBase" class="status-grid"><div><dt>{{ ui('queueRevision') }}</dt><dd>{{ queueBase.queue.revision }}</dd></div><div><dt>{{ ui('queueItemCount') }}</dt><dd>{{ queueBase.items.length }}</dd></div></dl>
          <div class="actions"><button type="button" class="secondary-action" :disabled="queueBusy || queueDirty" @click="beginNewQueue">{{ ui('newQueue') }}</button><button type="button" class="primary-action" :disabled="queueBusy" @click="saveQueueAs">{{ ui('saveAs') }}</button><button type="button" class="primary-action" :disabled="queueBusy || !queueBase || !queueDirty || queueStale" @click="updateQueue">{{ ui('updateQueue') }}</button><button type="button" class="secondary-action" :disabled="queueBusy || (!queueDirty && !queueStale)" @click="resetQueue">{{ ui('resetQueue') }}</button><button type="button" class="secondary-action" :disabled="queueBusy || !queueBase || queueDirty || queueStale" @click="duplicateQueue">{{ ui('duplicateQueue') }}</button><button type="button" class="danger-action" :disabled="queueBusy || !queueBase || queueDirty || queueStale" @click="deleteQueue">{{ ui('deleteQueue') }}</button></div>
          <div v-if="queueError" class="inline-error" role="alert">{{ queueError }}</div>
        </details>
      </div>

      <div v-else-if="activeWorkspace === 'presets'" class="workspace-stack">
        <details class="workspace-card" open>
          <summary class="workspace-card__heading">
            <div>
              <p class="eyebrow">{{ ui('presetLibrary') }}</p>
              <h2>{{ ui('presetsWorkspace') }}</h2>
            </div>
            <span class="state-badge">{{ presets.length }}</span>
          </summary>
          <p>{{ ui('presetLibraryDescription') }}</p>
          <div class="field-with-action">
            <div class="field-stack">
              <label for="preset-select">{{ ui('savedPreset') }}</label>
              <select id="preset-select" v-model="selectedPresetId" :disabled="presetBusy">
                <option value="">{{ ui('choosePreset') }}</option>
                <option v-for="item in presets" :key="item.id" :value="item.id">{{ item.name }} · {{ item.mode === 'repeat' ? ui('repeatMode') : ui('queueMode') }} · r{{ item.revision }}</option>
              </select>
            </div>
            <button type="button" class="secondary-action" :disabled="presetBusy || !selectedPresetId" @click="loadSelectedPreset">{{ ui('loadPreset') }}</button>
          </div>
          <p v-if="presets.length === 0" class="compact-empty">{{ ui('noPresets') }}</p>
        </details>

        <details class="workspace-card" open>
          <summary class="workspace-card__heading">
            <div>
              <p class="eyebrow">{{ ui('presetWorkingCopy') }}</p>
              <h2>{{ presetDraft.name.trim() || ui('newPreset') }}</h2>
            </div>
            <span class="state-badge" :data-state="presetStale ? 'failed' : undefined">{{ ui(presetStateKey) }}</span>
          </summary>
          <div v-if="presetStale" class="inline-warning" role="status">{{ ui('presetStaleGuard') }}</div>
          <div class="field-stack">
            <label for="preset-name">{{ ui('presetName') }}</label>
            <input id="preset-name" v-model="presetDraft.name" type="text" maxlength="120" :disabled="presetBusy">
          </div>
          <div class="field-stack">
            <label for="preset-mode">{{ ui('presetMode') }}</label>
            <select id="preset-mode" v-model="presetDraft.mode" :disabled="presetBusy" @change="onPresetModeChange">
              <option value="repeat">{{ ui('repeatMode') }}</option>
              <option value="queue">{{ ui('queueMode') }}</option>
            </select>
          </div>
          <div v-if="presetDraft.mode === 'repeat'" class="field-stack">
            <label for="preset-template">{{ ui('presetTemplate') }}</label>
            <select id="preset-template" v-model="presetDraft.templateId" :disabled="presetBusy">
              <option :value="null">{{ ui('chooseTemplateForPreset') }}</option>
              <option v-for="item in presetReferences.templates" :key="item.id" :value="item.id">{{ item.name }} · r{{ item.revision }}{{ !item.enabled ? ` · ${ui('templateDisabledState')}` : '' }}</option>
            </select>
          </div>
          <div v-else class="field-stack">
            <label for="preset-queue">{{ ui('presetQueue') }}</label>
            <select id="preset-queue" v-model="presetDraft.queueId" :disabled="presetBusy">
              <option :value="null">{{ ui('chooseQueueForPreset') }}</option>
              <option v-for="item in presetReferences.queues" :key="item.id" :value="item.id">{{ item.name }} · r{{ item.revision }}</option>
            </select>
            <small v-if="presetReferences.queues.length === 0">{{ ui('noQueuesForPreset') }}</small>
          </div>
          <div class="editor-grid">
            <div v-if="presetDraft.mode === 'repeat'" class="field-stack">
              <label for="preset-iterations">{{ ui('iterations') }}</label>
              <input id="preset-iterations" v-model.number="presetDraft.iterationCount" type="number" min="1" max="10000" step="1" :disabled="presetBusy">
            </div>
            <div class="field-stack">
              <label for="preset-delay">{{ ui('delaySeconds') }}</label>
              <input id="preset-delay" v-model.number="presetDraft.delaySeconds" type="number" min="5" max="3600" step="1" :disabled="presetBusy">
            </div>
          </div>
          <label class="check-row">
            <input v-model="presetDraft.autoContinue" type="checkbox" :disabled="presetBusy">
            <span><strong>{{ ui('autoContinue') }}</strong><small>{{ ui('autoContinueHelp') }}</small></span>
          </label>
          <label class="check-row">
            <input v-model="presetDraft.autoScroll" type="checkbox" :disabled="presetBusy">
            <span><strong>{{ ui('autoScroll') }}</strong><small>{{ ui('autoScrollHelp') }}</small></span>
          </label>
          <label class="check-row">
            <input v-model="presetDraft.preventDiscard" type="checkbox" :disabled="presetBusy">
            <span><strong>{{ ui('preventDiscard') }}</strong><small>{{ ui('preventDiscardHelp') }}</small></span>
          </label>
          <dl v-if="presetBase" class="status-grid">
            <div><dt>{{ ui('presetRevision') }}</dt><dd>{{ presetBase.revision }}</dd></div>
            <div><dt>{{ ui('updated') }}</dt><dd>{{ new Date(presetBase.updatedAt).toLocaleTimeString() }}</dd></div>
          </dl>
          <div class="actions">
            <button type="button" class="secondary-action" :disabled="presetBusy || presetDirty" @click="beginNewPreset">{{ ui('newPreset') }}</button>
            <button type="button" class="primary-action" :disabled="presetBusy" @click="savePresetAs">{{ ui('saveAs') }}</button>
            <button type="button" class="primary-action" :disabled="presetBusy || !presetBase || !presetDirty || presetStale" @click="updatePreset">{{ ui('updatePreset') }}</button>
            <button type="button" class="secondary-action" :disabled="presetBusy || (!presetDirty && !presetStale)" @click="resetPreset">{{ ui('resetPreset') }}</button>
            <button type="button" class="secondary-action" :disabled="presetBusy || !presetBase || presetDirty || presetStale" @click="duplicatePreset">{{ ui('duplicatePreset') }}</button>
            <button type="button" class="danger-action" :disabled="presetBusy || !presetBase || presetDirty || presetStale" @click="deletePreset">{{ ui('deletePreset') }}</button>
          </div>
          <div v-if="presetError" class="inline-error" role="alert">{{ presetError }}</div>
        </details>
      </div>

      <div v-else-if="activeWorkspace === 'templates'" class="workspace-stack">
        <details class="workspace-card" open>
          <summary class="workspace-card__heading">
            <div>
              <p class="eyebrow">{{ ui('templateLibrary') }}</p>
              <h2>{{ ui('templatesWorkspace') }}</h2>
            </div>
            <span class="state-badge">{{ templates.length }}</span>
          </summary>
          <p>{{ ui('templateLibraryDescription') }}</p>
          <div class="field-with-action">
            <div class="field-stack">
              <label for="template-select">{{ ui('savedTemplate') }}</label>
              <select id="template-select" v-model="selectedTemplateId" :disabled="templateBusy">
                <option value="">{{ ui('chooseTemplate') }}</option>
                <option v-for="item in templates" :key="item.id" :value="item.id">{{ item.name }} · r{{ item.revision }}</option>
              </select>
            </div>
            <button type="button" class="secondary-action" :disabled="templateBusy || !selectedTemplateId" @click="loadSelectedTemplate">{{ ui('loadTemplate') }}</button>
          </div>
          <p v-if="templates.length === 0" class="compact-empty">{{ ui('noTemplates') }}</p>
        </details>

        <details class="workspace-card" open>
          <summary class="workspace-card__heading">
            <div>
              <p class="eyebrow">{{ ui('templateWorkingCopy') }}</p>
              <h2>{{ templateDraft.name.trim() || ui('newTemplate') }}</h2>
            </div>
            <span class="state-badge" :data-state="templateStale ? 'failed' : undefined">{{ ui(templateStateKey) }}</span>
          </summary>
          <div v-if="templateStale" class="inline-warning" role="status">{{ ui('templateStaleGuard') }}</div>
          <div class="field-stack">
            <label for="template-name">{{ ui('templateName') }}</label>
            <input id="template-name" v-model="templateDraft.name" type="text" maxlength="120" :disabled="templateBusy">
          </div>
          <div class="field-stack">
            <label for="template-body">{{ ui('templateBody') }}</label>
            <textarea id="template-body" v-model="templateDraft.body" rows="7" maxlength="65536" :disabled="templateBusy" spellcheck="true" />
            <small>{{ ui('templateVariablesHelp') }}</small>
          </div>
          <div class="token-list" :aria-label="ui('templateVariables')">
            <code v-for="token in TEMPLATE_VARIABLES" :key="token">{{ `{${token}}` }}</code>
          </div>
          <label class="check-row">
            <input v-model="templateDraft.enabled" type="checkbox" :disabled="templateBusy">
            <span><strong>{{ ui('templateEnabled') }}</strong><small>{{ ui('templateEnabledHelp') }}</small></span>
          </label>
          <div class="preview-card">
            <div class="progress-heading"><strong>{{ ui('templatePreview') }}</strong><span>{{ ui('templatePreviewContext') }}</span></div>
            <pre v-if="!templatePreview.error">{{ templatePreview.value }}</pre>
            <span v-else class="compact-empty">{{ templatePreview.error }}</span>
          </div>
          <dl v-if="templateBase" class="status-grid">
            <div><dt>{{ ui('templateRevision') }}</dt><dd>{{ templateBase.revision }}</dd></div>
            <div><dt>{{ ui('updated') }}</dt><dd>{{ new Date(templateBase.updatedAt).toLocaleTimeString() }}</dd></div>
          </dl>
          <div class="actions">
            <button type="button" class="secondary-action" :disabled="templateBusy || templateDirty" @click="beginNewTemplate">{{ ui('newTemplate') }}</button>
            <button type="button" class="primary-action" :disabled="templateBusy || Boolean(templatePreview.error)" @click="saveTemplateAs">{{ ui('saveAs') }}</button>
            <button type="button" class="primary-action" :disabled="templateBusy || !templateBase || !templateDirty || templateStale || Boolean(templatePreview.error)" @click="updateTemplate">{{ ui('updateTemplate') }}</button>
            <button type="button" class="secondary-action" :disabled="templateBusy || (!templateDirty && !templateStale)" @click="resetTemplate">{{ ui('resetTemplate') }}</button>
            <button type="button" class="secondary-action" :disabled="templateBusy || !templateBase || templateDirty || templateStale" @click="duplicateTemplate">{{ ui('duplicateTemplate') }}</button>
            <button type="button" class="danger-action" :disabled="templateBusy || !templateBase || templateDirty || templateStale" @click="deleteTemplate">{{ ui('deleteTemplate') }}</button>
          </div>
          <div v-if="templateError" class="inline-error" role="alert">{{ templateError }}</div>
        </details>
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
