import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import './assets/base.css';
import { createAppI18n } from './i18n';
import { router } from './router';

createApp(App).use(createPinia()).use(router).use(createAppI18n()).mount('#app');
