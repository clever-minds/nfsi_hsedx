<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { apiPost, errorMessage } from '@/lib/api';
import AuthShell from '../components/AuthShell.vue';
import Icon from '@/components/ui/Icon.vue';

interface VerifyEmailResp {
  ok: boolean;
  message: string;
}

const route = useRoute();
const { t } = useI18n();
const loading = ref(true);
const success = ref(false);
const message = ref('');

onMounted(async () => {
  const token = route.query.token as string | undefined;
  if (!token) {
    loading.value = false;
    success.value = false;
    message.value = t('auth.verifyEmail.invalidLink');
    return;
  }
  try {
    const res = await apiPost<VerifyEmailResp>('/auth/verify-email', { token });
    success.value = !!res.ok;
    message.value = res.message || (res.ok ? t('auth.verifyEmail.successDefault') : t('auth.verifyEmail.failedDefault'));
  } catch (e) {
    success.value = false;
    message.value = errorMessage(e, t('auth.verifyEmail.expired'));
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AuthShell :title="t('auth.verifyEmail.title')">
    <div class="text-center">
      <template v-if="loading">
        <span class="mx-auto grid h-14 w-14 animate-pulse place-items-center rounded-full bg-brand-50 text-brand-500">
          <Icon name="mail" :size="26" />
        </span>
        <h2 class="mt-4 section-title">{{ t('auth.verifyEmail.verifying') }}</h2>
        <p class="mt-2 text-sm text-slate-500">{{ t('auth.verifyEmail.pleaseWait') }}</p>
      </template>

      <template v-else-if="success">
        <span class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <Icon name="check-circle" :size="26" />
        </span>
        <h2 class="mt-4 section-title">{{ t('auth.verifyEmail.successTitle') }}</h2>
        <p class="mt-2 text-sm text-slate-500">{{ t('auth.verifyEmail.successHint', { message }) }}</p>
        <RouterLink to="/login" class="btn-primary mt-6 block w-full py-2.5 text-center">{{ t('auth.login.submit') }}</RouterLink>
      </template>

      <template v-else>
        <span class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-50 text-rose-600">
          <Icon name="alert-circle" :size="26" />
        </span>
        <h2 class="mt-4 section-title">{{ t('auth.verifyEmail.failedTitle') }}</h2>
        <p class="mt-2 text-sm text-slate-500">{{ message }}</p>
        <RouterLink to="/login" class="btn-outline mt-6 block w-full py-2.5 text-center">{{ t('auth.verifyEmail.backToLogin') }}</RouterLink>
      </template>
    </div>
  </AuthShell>
</template>
