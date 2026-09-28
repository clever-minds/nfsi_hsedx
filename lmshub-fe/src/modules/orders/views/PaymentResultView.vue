<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiGet } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import Icon from '@/components/ui/Icon.vue';

/**
 * Halaman pendaratan setelah pembeli kembali dari gateway.
 *
 * Halaman ini TIDAK melunasi apa pun. Pelunasan hanya terjadi lewat webhook,
 * yang kadang tiba beberapa detik setelah pembeli sampai di sini — jadi status
 * order dijemput ulang beberapa kali sebelum menyerah dan menyuruh pembeli
 * menunggu. Menampilkan "gagal" karena webhook telat adalah cara tercepat
 * membuat pembeli membayar dua kali.
 */

const props = defineProps<{ outcome: 'return' | 'cancel' }>();

const route = useRoute();
const auth = useAuthStore();
const { t } = useI18n();

const orderId = computed(() => String(route.query.order ?? ''));
const state = ref<'checking' | 'paid' | 'waiting' | 'cancelled'>(
  props.outcome === 'cancel' ? 'cancelled' : 'checking',
);

const PAID = ['lunas', 'akses_aktif'];
/** Enam kali dengan jeda 2 detik ≈ 12 detik — cukup untuk webhook yang normal. */
const MAX_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 2000;

onMounted(async () => {
  if (props.outcome === 'cancel') return;
  if (!orderId.value || !auth.isAuthenticated) {
    state.value = 'waiting';
    return;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const order = await apiGet<{ status: string }>(`/orders/${orderId.value}`);
      if (PAID.includes(order.status)) {
        state.value = 'paid';
        return;
      }
    } catch {
      // Order belum terlihat oleh pembeli ini, atau jaringan sedang goyah —
      // coba lagi; jangan menyimpulkan gagal.
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  state.value = 'waiting';
});

const view = computed(() => {
  switch (state.value) {
    case 'paid':
      return { icon: 'check-circle', tone: 'text-emerald-600', bg: 'bg-emerald-50', key: 'paid' };
    case 'waiting':
      return { icon: 'clock', tone: 'text-amber-600', bg: 'bg-amber-50', key: 'waiting' };
    case 'cancelled':
      return { icon: 'x-circle', tone: 'text-slate-500', bg: 'bg-slate-100', key: 'cancelled' };
    default:
      return { icon: 'loader', tone: 'text-brand-500', bg: 'bg-brand-50', key: 'checking' };
  }
});
</script>

<template>
  <section class="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-4 py-16">
    <div class="card w-full rounded-2xl p-8 text-center">
      <span class="mx-auto grid h-16 w-16 place-items-center rounded-full" :class="[view.bg, view.tone]">
        <Icon :name="view.icon" :size="32" />
      </span>

      <h1 class="mt-5 text-xl font-bold text-slate-900">
        {{ t(`orders.result.${view.key}.title`) }}
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-slate-500">
        {{ t(`orders.result.${view.key}.body`) }}
      </p>

      <div class="mt-6 flex flex-col gap-2">
        <RouterLink v-if="state === 'paid'" to="/d/belajar" class="btn-primary w-full rounded-full">
          {{ t('orders.result.startLearning') }}
        </RouterLink>
        <RouterLink v-else to="/d/transaksi" class="btn-primary w-full rounded-full">
          {{ t('orders.result.viewTransactions') }}
        </RouterLink>
        <RouterLink to="/kursus" class="btn-outline w-full rounded-full">
          {{ t('orders.result.browseCourses') }}
        </RouterLink>
      </div>
    </div>
  </section>
</template>
