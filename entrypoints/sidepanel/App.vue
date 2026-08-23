<script setup lang="ts">
import { browser } from 'wxt/browser';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { SidePanelControlClient, type ControlPlaneSnapshot } from '../../src/control-plane/index.ts';
import { ui } from '../../src/ui/messages';
import { WORKSPACES, type WorkspaceId } from '../../src/ui/workspaces';
import Icon from './components/Icon.vue';

const activeWorkspace = ref<WorkspaceId>('run');
const activeDefinition = computed(() => WORKSPACES.find((workspace) => workspace.id === activeWorkspace.value) ?? WORKSPACES[0]!);
const connectionState = ref<'connected' | 'reconnecting' | 'stopped'>('reconnecting');
const snapshot = ref<ControlPlaneSnapshot>();
const controlError = ref<string>();
const version = browser.runtime.getManifest().version;
const controlClient = new SidePanelControlClient(browser.runtime);
let connection: { stop(): void } | undefined;

const connectionLabel = computed(() => connectionState.value === 'connected'
  ? ui('runtimeConnected')
  : connectionState.value === 'reconnecting'
    ? ui('runtimeReconnecting')
    : ui('runtimeStopped'));

async function hydrateControl(): Promise<void> {
  try {
    const outcome = await controlClient.hydrate();
    if (!outcome.applied || outcome.snapshot === undefined) return;
    snapshot.value = outcome.snapshot;
    controlError.value = undefined;
  } catch (error) {
    controlError.value = error instanceof Error ? error.message : ui('controlPlaneUnavailable');
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
    onInvalidation: () => { void hydrateControl(); },
    onStateChange: (state) => {
      connectionState.value = state;
      if (state === 'connected') void hydrateControl();
    },
  });
  void hydrateControl();
});

onUnmounted(() => connection?.stop());
</script>

<template>
  <main class="shell" :data-workspace="activeWorkspace" :data-state="connectionState" aria-labelledby="app-title">
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ ui(activeDefinition.titleKey) }} — {{ connectionLabel }}
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
      <span class="state-badge shell-state-badge" :data-state="connectionState === 'connected' ? 'success' : 'reconnecting'">{{ ui('foundationState') }}</span>
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
      <details class="workspace-card" open>
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
          <span v-if="controlError">{{ ui('controlPlaneUnavailable') }}: {{ controlError }}</span>
          <span v-else>{{ ui('futureCapability') }}</span>
        </div>
      </details>
    </section>
  </main>
</template>
