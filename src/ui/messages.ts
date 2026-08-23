import { browser } from 'wxt/browser';

export type UiMessageKey =
  | 'appName'
  | 'appDescription'
  | 'localeCode'
  | 'workspaceStatus'
  | 'extensionReady'
  | 'foundationState'
  | 'primaryWorkspaces'
  | 'run'
  | 'queue'
  | 'presets'
  | 'templates'
  | 'settings'
  | 'runWorkspace'
  | 'queueWorkspace'
  | 'presetsWorkspace'
  | 'templatesWorkspace'
  | 'settingsWorkspace'
  | 'foundation'
  | 'runFoundationDescription'
  | 'queueFoundationDescription'
  | 'presetsFoundationDescription'
  | 'templatesFoundationDescription'
  | 'settingsFoundationDescription'
  | 'futureCapability'
  | 'versionLabel'
  | 'runtimeConnected'
  | 'runtimeReconnecting'
  | 'runtimeStopped'
  | 'controlPlaneRevision'
  | 'controlPlaneUnavailable';

const FALLBACK_MESSAGES: Readonly<Record<UiMessageKey, string>> = Object.freeze({
  appName: 'ChatGPT Iterator',
  appDescription: 'Chrome-native Side Panel controller for durable ChatGPT iteration workflows.',
  localeCode: 'en',
  workspaceStatus: 'Workspace status',
  extensionReady: 'Extension shell ready',
  foundationState: 'Control plane',
  primaryWorkspaces: 'Primary workspaces',
  run: 'Run',
  queue: 'Queue',
  presets: 'Presets',
  templates: 'Templates',
  settings: 'Settings',
  runWorkspace: 'Run workspace',
  queueWorkspace: 'Queue workspace',
  presetsWorkspace: 'Presets workspace',
  templatesWorkspace: 'Templates workspace',
  settingsWorkspace: 'Settings workspace',
  foundation: 'Foundation',
  runFoundationDescription: 'Run controls arrive with the durable execution program. This step establishes only the team-standard workspace shell.',
  queueFoundationDescription: 'Ordered message queue behavior arrives in its owning roadmap step. The workspace destination is reserved now.',
  presetsFoundationDescription: 'Preset lifecycle behavior arrives after durable repositories exist. The workspace destination is reserved now.',
  templatesFoundationDescription: 'Template editing and variables arrive in their owning roadmap step. The workspace destination is reserved now.',
  settingsFoundationDescription: 'Settings, diagnostics, and data controls arrive in later bounded steps. The workspace destination is reserved now.',
  futureCapability: 'Domain behavior is intentionally deferred to its roadmap owner.',
  versionLabel: 'Version 0.0.3',
  runtimeConnected: 'Control plane connected',
  runtimeReconnecting: 'Control plane reconnecting',
  runtimeStopped: 'Control plane stopped',
  controlPlaneRevision: 'Authority revision',
  controlPlaneUnavailable: 'Control plane unavailable',
});

export function ui(key: UiMessageKey): string {
  const localized = browser.i18n.getMessage(key);
  return localized || FALLBACK_MESSAGES[key];
}
