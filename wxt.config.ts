import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    manifest_version: 3,
    name: '__MSG_appName__',
    description: '__MSG_appDescription__',
    default_locale: 'en',
    minimum_chrome_version: '132',
    incognito: 'not_allowed',
    permissions: ['sidePanel', 'storage', 'alarms'],
    action: {
      default_title: '__MSG_appName__',
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
