<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { apiPatch, apiPost, assetUrl, errorMessage } from '@/lib/api';
import { roleLabel, statusLabel } from '@/lib/labels';
import PageHeader from '@/components/ui/PageHeader.vue';
import Icon from '@/components/ui/Icon.vue';

const auth = useAuthStore();
const { t } = useI18n();

const initials = computed(() =>
  (auth.user?.name_lengkap ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase(),
);

// ── photo profile ──────────────────────────────────────────
const photoInput = ref<HTMLInputElement | null>(null);
const photoUploading = ref(false);
const photoError = ref('');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // batas aman di bawah limit body 2mb (overhead base64 ±33%)

async function onPhotoPicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  photoError.value = '';
  if (!ALLOWED_MIME.includes(file.type)) {
    photoError.value = t('users.profile.badFormat');
    return;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    photoError.value = t('users.profile.tooLarge');
    return;
  }
  photoUploading.value = true;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(t('users.profile.readFailed')));
      reader.readAsDataURL(file);
    });
    await apiPost('/users/me/photo', { data_base64: dataUrl, mime_type: file.type });
    await auth.fetchMe(); // refresh photo di header & halaman ini
  } catch (err) {
    photoError.value = errorMessage(err, t('users.profile.uploadFailed'));
  } finally {
    photoUploading.value = false;
    if (photoInput.value) photoInput.value.value = '';
  }
}

// ── Data diri ────────────────────────────────────────────
const form = ref({
  name_lengkap: auth.user?.name_lengkap ?? '',
  number_wa: auth.user?.number_wa ?? '',
});
const savingProfile = ref(false);
const profileMsg = ref('');
const profileError = ref('');

async function saveProfile() {
  savingProfile.value = true;
  profileMsg.value = '';
  profileError.value = '';
  try {
    await apiPatch('/users/me', {
      name_lengkap: form.value.name_lengkap,
      number_wa: form.value.number_wa || null,
    });
    await auth.fetchMe();
    profileMsg.value = t('users.profile.saved');
  } catch (e) {
    profileError.value = errorMessage(e, t('users.profile.saveFailed'));
  } finally {
    savingProfile.value = false;
  }
}

// ── Ganti email (hanya super admin) ──────────────────────
// Akun lain diganti emailnya by admin di menu Users; super admin no punya
// atasan, jadi ia menggantinya sendiri dengan konfirmasi password.
const isSuperAdmin = computed(() => auth.roles.includes('super_admin'));
const emailForm = ref({ email: '', password_saat_ini: '' });
const showEmailForm = ref(false);
const savingEmail = ref(false);
const emailMsg = ref('');
const emailError = ref('');

async function changeEmail() {
  emailMsg.value = '';
  emailError.value = '';
  savingEmail.value = true;
  try {
    await apiPatch('/users/me/email', {
      email: emailForm.value.email.trim(),
      password_saat_ini: emailForm.value.password_saat_ini,
    });
    await auth.fetchMe();
    emailForm.value = { email: '', password_saat_ini: '' };
    showEmailForm.value = false;
    emailMsg.value = t('users.profile.emailChanged');
  } catch (e) {
    emailError.value = errorMessage(e, t('users.profile.emailChangeFailed'));
  } finally {
    savingEmail.value = false;
  }
}

// ── Ganti password ───────────────────────────────────────
const pwd = ref({ password_lama: '', password_baru: '', konfirmasi: '' });
const savingPwd = ref(false);
const pwdMsg = ref('');
const pwdError = ref('');

async function changePassword() {
  pwdMsg.value = '';
  pwdError.value = '';
  if (pwd.value.password_baru !== pwd.value.konfirmasi) {
    pwdError.value = t('users.profile.mismatch');
    return;
  }
  savingPwd.value = true;
  try {
    await apiPatch('/users/me/password', {
      password_lama: pwd.value.password_lama,
      password_baru: pwd.value.password_baru,
    });
    pwd.value = { password_lama: '', password_baru: '', konfirmasi: '' };
    pwdMsg.value = t('users.profile.passwordChanged');
  } catch (e) {
    pwdError.value = errorMessage(e, t('users.profile.passwordFailed'));
  } finally {
    savingPwd.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader :title="t('users.profile.title')" :subtitle="t('users.profile.subtitle')" />

    <div class="grid gap-6 lg:grid-cols-[20rem,1fr]">
      <!-- Kartu profile (ala Cursus) -->
      <div class="card h-fit p-6 text-center">
        <div class="relative mx-auto h-28 w-28">
          <div class="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-500 text-3xl font-bold text-white ring-4 ring-brand-100">
            <img
              v-if="auth.user?.profile_picture"
              :src="assetUrl(auth.user.profile_picture)"
              :alt="auth.user?.name_lengkap"
              class="h-full w-full object-cover"
            />
            <template v-else>{{ initials }}</template>
          </div>
          <button
            class="absolute -bottom-1 -end-1 grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-white shadow-md transition hover:bg-brand-600"
            :title="t('users.profile.changePhoto')"
            :disabled="photoUploading"
            @click="photoInput?.click()"
          >
            <Icon name="plus" :size="16" />
          </button>
          <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onPhotoPicked" />
        </div>

        <div v-if="photoUploading" class="mt-3 text-xs text-slate-400">{{ t('users.profile.uploading') }}</div>
        <div v-else-if="photoError" class="mt-3 text-xs text-rose-600">{{ photoError }}</div>
        <p v-else class="mt-3 text-xs text-slate-400">{{ t('users.profile.photoHint') }}</p>

        <h2 class="mt-4 section-title">{{ auth.user?.name_lengkap }}</h2>
        <p class="text-sm text-slate-400">{{ auth.user?.email }}</p>

        <div class="mt-4 flex flex-wrap justify-center gap-1.5">
          <span
            v-for="r in auth.roles"
            :key="r"
            class="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600"
          >
            {{ roleLabel(r) }}
          </span>
        </div>
      </div>

      <div class="space-y-6">
        <!-- Data diri -->
        <form class="card p-6" @submit.prevent="saveProfile">
          <h3 class="section-title">{{ t('users.profile.infoTitle') }}</h3>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label">{{ t('users.profile.fullName') }}</label>
              <input v-model="form.name_lengkap" class="input" required minlength="2" />
            </div>
            <div>
              <label class="label">{{ t('users.profile.whatsapp') }}</label>
              <input v-model="form.number_wa" class="input" type="tel" :placeholder="t('users.form.whatsappPlaceholder')" />
            </div>
            <div>
              <label class="label">{{ t('users.profile.email') }}</label>
              <input :value="auth.user?.email ?? '—'" class="input bg-slate-50 text-slate-400" disabled />
              <p v-if="!isSuperAdmin" class="mt-1 text-xs text-slate-400">{{ t('users.profile.emailLocked') }}</p>
              <button
                v-else
                type="button"
                class="mt-1 text-xs font-medium text-brand-600 hover:underline"
                @click="showEmailForm = !showEmailForm"
              >
                {{ t('users.profile.changeEmail') }}
              </button>
            </div>
            <div>
              <label class="label">{{ t('users.profile.accountStatus') }}</label>
              <input :value="statusLabel(auth.user?.status)" class="input bg-slate-50 text-slate-400" disabled />
            </div>
          </div>
          <div v-if="profileMsg" class="mt-4 alert-success">{{ profileMsg }}</div>
          <div v-if="profileError" class="mt-4 alert-error">{{ profileError }}</div>
          <div class="mt-5">
            <button class="btn-primary" :disabled="savingProfile">
              {{ savingProfile ? t('common.state.saving') : t('users.profile.saveChanges') }}
            </button>
          </div>
        </form>

        <!-- Ganti email — super admin saja -->
        <div v-if="emailMsg" class="alert-success">{{ emailMsg }}</div>
        <form v-if="isSuperAdmin && showEmailForm" class="card p-6" @submit.prevent="changeEmail">
          <h3 class="section-title">{{ t('users.profile.changeEmail') }}</h3>
          <p class="mt-1 text-xs text-slate-400">{{ t('users.profile.changeEmailHint') }}</p>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="new-email">{{ t('users.profile.newEmail') }}</label>
              <input id="new-email" v-model="emailForm.email" class="input" type="email" required autocomplete="email" />
            </div>
            <div>
              <label class="label" for="email-pwd">{{ t('users.profile.currentPassword') }}</label>
              <input
                id="email-pwd"
                v-model="emailForm.password_saat_ini"
                class="input"
                type="password"
                required
                autocomplete="current-password"
              />
            </div>
          </div>
          <div v-if="emailError" class="mt-4 alert-error">{{ emailError }}</div>
          <div class="mt-5 flex gap-2">
            <button class="btn-primary" :disabled="savingEmail">
              {{ savingEmail ? t('common.state.saving') : t('users.profile.saveEmail') }}
            </button>
            <button type="button" class="btn-outline" @click="showEmailForm = false">{{ t('common.action.cancel') }}</button>
          </div>
        </form>

        <!-- Ganti kata sandi -->
        <form class="card p-6" @submit.prevent="changePassword">
          <h3 class="section-title">{{ t('users.profile.passwordTitle') }}</h3>
          <div class="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label class="label">{{ t('users.profile.oldPassword') }}</label>
              <input v-model="pwd.password_lama" class="input" type="password" required />
            </div>
            <div>
              <label class="label">{{ t('users.profile.newPassword') }}</label>
              <input v-model="pwd.password_baru" class="input" type="password" required minlength="8" />
            </div>
            <div>
              <label class="label">{{ t('users.profile.confirm') }}</label>
              <input v-model="pwd.konfirmasi" class="input" type="password" required minlength="8" />
            </div>
          </div>
          <div v-if="pwdMsg" class="mt-4 alert-success">{{ pwdMsg }}</div>
          <div v-if="pwdError" class="mt-4 alert-error">{{ pwdError }}</div>
          <div class="mt-5">
            <button class="btn-primary" :disabled="savingPwd">
              {{ savingPwd ? t('common.state.saving') : t('users.profile.changePassword') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
