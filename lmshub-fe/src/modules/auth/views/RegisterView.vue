<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { apiGet, apiPost, errorMessage, setTokens } from '@/lib/api';
import { renderGoogleSignInButton } from '@/lib/google-signin';
import AuthShell from '../components/AuthShell.vue';
import Icon from '@/components/ui/Icon.vue';

interface AuthUser {
  id: string;
  nama_lengkap: string;
  email: string | null;
}
interface OAuthConfig {
  google_client_id: string | null;
  google_enabled: boolean;
  email_verification_enabled: boolean;
}
interface GoogleLoginResp {
  user: AuthUser;
  tokens: { access_token: string; refresh_token: string };
}

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();

const form = ref({ nama_lengkap: '', email: '', password: '', sebagai: 'siswa' as 'siswa' | 'affiliate' });
const loading = ref(false);
const error = ref('');
const info = ref('');

const googleEnabled = ref(false);
const googleError = ref('');
const googleBtn = ref<HTMLElement | null>(null);

async function submit() {
  loading.value = true;
  error.value = '';
  info.value = '';
  try {
    const res = await auth.register({ ...form.value });
    if (res.tokens) router.push('/d');
    else info.value = t('auth.register.pendingApproval');
  } catch (e) {
    error.value = errorMessage(e, t('auth.register.failed'));
  } finally {
    loading.value = false;
  }
}

async function onGoogleCredential(idToken: string) {
  googleError.value = '';
  try {
    const res = await apiPost<GoogleLoginResp>('/auth/google', { id_token: idToken });
    setTokens(res.tokens.access_token, res.tokens.refresh_token);
    await auth.fetchMe();
    router.push('/d');
  } catch (e) {
    googleError.value = errorMessage(e, t('auth.register.googleFailed'));
  }
}

onMounted(async () => {
  try {
    // Butuh Google Client ID diisi di Pengaturan (super admin, grup auth/google) agar tombol tampil.
    const cfg = await apiGet<OAuthConfig>('/auth/oauth-config');
    if (cfg.google_enabled && cfg.google_client_id && googleBtn.value) {
      await renderGoogleSignInButton(googleBtn.value, cfg.google_client_id, onGoogleCredential);
      googleEnabled.value = true;
    }
  } catch {
    googleEnabled.value = false;
  }
});
</script>

<template>
  <AuthShell :title="t('auth.register.title')" :subtitle="t('auth.register.subtitle')">
    <form class="space-y-4" @submit.prevent="submit">
      <!-- Google Sign-In (tampil bila diaktifkan di Pengaturan) -->
      <div v-show="googleEnabled" class="space-y-4">
        <div v-if="googleError" class="alert-error">{{ googleError }}</div>
        <div ref="googleBtn" class="flex justify-center"></div>
        <div class="flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
          <span class="h-px flex-1 bg-slate-200"></span>{{ t('auth.or') }}<span class="h-px flex-1 bg-slate-200"></span>
        </div>
      </div>

      <div v-if="error" class="alert-error">{{ error }}</div>
      <div v-if="info" class="alert-success">{{ info }}</div>

      <div class="input-icon-wrap">
        <Icon name="user" :size="16" class="shrink-0" />
        <input v-model="form.nama_lengkap" type="text" required :placeholder="t('auth.register.fullName')" />
      </div>
      <div class="input-icon-wrap">
        <Icon name="mail" :size="16" class="shrink-0" />
        <input v-model="form.email" type="email" required :placeholder="t('auth.register.email')" />
      </div>
      <div class="input-icon-wrap">
        <Icon name="lock" :size="16" class="shrink-0" />
        <input v-model="form.password" type="password" required minlength="8" :placeholder="t('auth.register.password')" />
      </div>
      <div>
        <label class="label">{{ t('auth.register.asLabel') }}</label>
        <select v-model="form.sebagai" class="input">
          <option value="siswa">{{ t('auth.register.asStudent') }}</option>
          <option value="affiliate">{{ t('auth.register.asAffiliate') }}</option>
        </select>
      </div>

      <button class="btn-primary w-full py-2.5" :disabled="loading">
        {{ loading ? t('auth.login.processing') : t('auth.register.submit') }}
      </button>

      <div class="border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
        {{ t('auth.register.haveAccount') }}
        <RouterLink to="/login" class="font-medium text-brand-500 hover:text-brand-600">{{ t('auth.register.login') }}</RouterLink>
      </div>
    </form>
  </AuthShell>
</template>
