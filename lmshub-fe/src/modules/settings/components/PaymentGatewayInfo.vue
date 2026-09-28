<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from '@/components/ui/Icon.vue';

/**
 * Baris informasi di kepala setiap grup kredensial gateway.
 *
 * Menampilkan status dan — yang paling penting — URL webhook siap salin.
 * URL itu dihitung server dari APP_URL, bukan diketik ulang oleh pembeli:
 * salah ketik satu karakter membuat pembayaran berhasil sementara ordernya diam
 * menggantung tanpa pesan error apa pun, dan itu keluhan support paling mahal
 * pada integrasi seperti ini.
 */

export interface GatewayMeta {
  id: string;
  label: string;
  configured: boolean;
  active: boolean;
  webhook_url: string;
  currencies: string[] | null;
}

const props = defineProps<{ gateway: GatewayMeta }>();
const { t } = useI18n();

const copied = ref(false);

const status = computed(() => {
  if (props.gateway.active) return { key: 'statusActive', tone: 'bg-emerald-50 text-emerald-700' };
  if (props.gateway.configured) return { key: 'statusConfigured', tone: 'bg-amber-50 text-amber-700' };
  return { key: 'statusEmpty', tone: 'bg-slate-100 text-slate-500' };
});

async function copyWebhook() {
  try {
    await navigator.clipboard.writeText(props.gateway.webhook_url);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1600);
  } catch {
    /* clipboard ditolak browser — URL tetap terlihat dan bisa diseleksi manual */
  }
}
</script>

<template>
  <div class="mb-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="status.tone">
        {{ t(`settings.payment.${status.key}`) }}
      </span>
      <span v-if="gateway.currencies" class="text-[11px] text-slate-400">
        {{ gateway.currencies.slice(0, 6).join(' · ') }}
      </span>
    </div>

    <p class="mt-2.5 text-xs font-semibold text-slate-600">{{ t('settings.payment.webhookTitle') }}</p>
    <div class="mt-1 flex items-center gap-2">
      <code class="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
        {{ gateway.webhook_url }}
      </code>
      <button
        type="button"
        class="btn-outline btn-sm shrink-0"
        @click="copyWebhook"
      >
        <Icon :name="copied ? 'check' : 'clipboard'" :size="14" />
        {{ copied ? t('settings.payment.copied') : t('settings.payment.copy') }}
      </button>
    </div>
    <p class="mt-1.5 text-[11px] leading-snug text-slate-400">{{ t('settings.payment.webhookHint') }}</p>
  </div>
</template>
