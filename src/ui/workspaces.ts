import type { IconName } from './icons';
import type { UiMessageKey } from './messages';

export const WORKSPACE_IDS = ['run', 'queue', 'presets', 'templates', 'settings'] as const;
export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export interface WorkspaceDefinition {
  readonly id: WorkspaceId;
  readonly labelKey: UiMessageKey;
  readonly titleKey: UiMessageKey;
  readonly descriptionKey: UiMessageKey;
  readonly icon: IconName;
}

export const WORKSPACES: readonly WorkspaceDefinition[] = Object.freeze([
  { id: 'run', labelKey: 'run', titleKey: 'runWorkspace', descriptionKey: 'runFoundationDescription', icon: 'run' },
  { id: 'queue', labelKey: 'queue', titleKey: 'queueWorkspace', descriptionKey: 'queueFoundationDescription', icon: 'queue' },
  { id: 'presets', labelKey: 'presets', titleKey: 'presetsWorkspace', descriptionKey: 'presetsFoundationDescription', icon: 'presets' },
  { id: 'templates', labelKey: 'templates', titleKey: 'templatesWorkspace', descriptionKey: 'templatesFoundationDescription', icon: 'templates' },
  { id: 'settings', labelKey: 'settings', titleKey: 'settingsWorkspace', descriptionKey: 'settingsFoundationDescription', icon: 'settings' },
]);
