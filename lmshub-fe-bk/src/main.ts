import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { installCan } from './lib/can';
import { applyDocumentLocale, i18n } from './i18n';
import './style.css';

// Pasang lang/dir sebelum mount supaya tidak ada kedipan layout LTR→RTL.
applyDocumentLocale();

const app = createApp(App);
app.use(createPinia());
app.use(i18n);
installCan(app);
app.use(router);
app.mount('#app');
