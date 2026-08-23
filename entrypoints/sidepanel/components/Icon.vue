<script setup lang="ts">
import { computed } from 'vue';
import type { IconName } from '../../../src/ui/icons';

export type { IconName } from '../../../src/ui/icons';

const props = withDefaults(
  defineProps<{ name: IconName; size?: number | string; class?: string }>(),
  { size: 16, class: '' },
);

const svgSize = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));
</script>

<template>
  <svg
    class="ui-icon"
    :class="props.class"
    :style="{ width: svgSize, height: svgSize }"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path v-if="name === 'run'" d="M8 5v14l11-7z" />
    <path v-else-if="name === 'queue'" d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h16v2H4v-2z" />
    <path v-else-if="name === 'presets'" d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
    <path v-else-if="name === 'templates'" d="M6 2h9l5 5v15H6V2zm8 2v4h4l-4-4zM9 12h8v2H9v-2zm0 4h8v2H9v-2z" />
    <path v-else-if="name === 'settings'" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58-.12-.61-1.92-3.32-.59-.22-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54-.48-.41h-3.84l-.47.41-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96-.59.22-1.92 3.32.12.61 2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58-.12.61 1.92 3.32.59.22 2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54.48.41h3.84l.47-.41.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96.59-.22 1.92-3.32-.12-.61-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" />
    <path v-else d="M11 10h2v7h-2v-7zm0-3h2v2h-2V7zm1-5a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />
  </svg>
</template>

<style scoped>
.ui-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
