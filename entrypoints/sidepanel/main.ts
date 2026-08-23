import { createApp } from 'vue';
import App from './App.vue';
import { ui } from '../../src/ui/messages';
import './style.css';

document.documentElement.lang = ui('localeCode');
document.title = ui('appName');

createApp(App).mount('#app');
