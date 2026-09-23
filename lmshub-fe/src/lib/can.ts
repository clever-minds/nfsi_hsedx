import type { App, DirectiveBinding } from 'vue';
import { useAuthStore } from '@/stores/auth';

/**
 * Directive `v-can="'kursus.view'"` — sembunyikan elemen bila user tak punya izin.
 * Pemeriksaan otoritatif tetap di backend; ini hanya gating UI.
 */
export function installCan(app: App) {
  app.directive('can', {
    mounted(el: HTMLElement, binding: DirectiveBinding<string>) {
      const auth = useAuthStore();
      if (!auth.can(binding.value)) {
        el.style.display = 'none';
      }
    },
    updated(el: HTMLElement, binding: DirectiveBinding<string>) {
      const auth = useAuthStore();
      el.style.display = auth.can(binding.value) ? '' : 'none';
    },
  });
}
