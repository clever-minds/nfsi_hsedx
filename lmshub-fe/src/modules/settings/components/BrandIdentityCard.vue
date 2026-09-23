<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiPost, apiPut, errorMessage } from '@/lib/api';
import { useAppConfigStore } from '@/stores/appConfig';
import Icon from '@/components/ui/Icon.vue';
import type { SettingItem } from '../settings-schema';

/**
 * Identitas merek: nama aplikasi, baris footer, logo, dan ikon browser.
 *
 * Dipisah dari daftar setting generik karena dua field-nya adalah unggahan
 * berkas, bukan pasangan key/value — dan karena admin memerlukan pratinjau
 * untuk menilai hasilnya.
 */
const props = defineProps<{ items: SettingItem[]; canEdit: boolean }>();

const { t } = useI18n();
const appConfig = useAppConfigStore();

const KEY = {
  name: 'brand.nama_aplikasi',
  footer: 'brand.footer',
  logo: 'brand.logo_url',
  icon: 'brand.icon_url',
} as const;

const find = (key: string) => props.items.find((i) => i.key === key);

const name = ref(find(KEY.name)?.nilai ?? '');
const footer = ref(find(KEY.footer)?.nilai ?? '');

const saving = ref(false);
const saved = ref(false);
const error = ref('');
const uploading = ref<'logo' | 'icon' | ''>('');

const MAX_BYTES = 512 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

const logoInput = ref<HTMLInputElement | null>(null);
const iconInput = ref<HTMLInputElement | null>(null);

async function saveText() {
  if (!name.value.trim()) {
    error.value = t('settings.brand.nameRequired');
    return;
  }
  saving.value = true;
  error.value = '';
  saved.value = false;
  try {
    await apiPut(`/settings/${KEY.name}`, { nilai: name.value.trim() });
    await apiPut(`/settings/${KEY.footer}`, { nilai: footer.value });
    appConfig.setBrand({ appName: name.value.trim(), footerTemplate: footer.value });
    saved.value = true;
    setTimeout(() => (saved.value = false), 1500);
  } catch (e) {
    error.value = errorMessage(e, t('settings.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function onPick(jenis: 'logo' | 'icon', event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // agar memilih berkas yang sama lagi tetap memicu change
  if (!file) return;

  error.value = '';
  if (!ALLOWED.includes(file.type)) {
    error.value = t('settings.brand.badFormat');
    return;
  }
  if (file.size > MAX_BYTES) {
    error.value = t('settings.brand.tooLarge');
    return;
  }

  uploading.value = jenis;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(t('settings.brand.readFailed')));
      reader.readAsDataURL(file);
    });
    const res = await apiPost<{ key: string; nilai: string }>('/settings/brand-asset', {
      jenis,
      data_base64: dataUrl,
      mime_type: file.type,
    });
    appConfig.setBrand(jenis === 'logo' ? { logoUrl: res.nilai } : { iconUrl: res.nilai });
  } catch (e) {
    error.value = errorMessage(e, t('settings.brand.uploadFailed'));
  } finally {
    uploading.value = '';
  }
}

async function clearAsset(jenis: 'logo' | 'icon') {
  uploading.value = jenis;
  error.value = '';
  try {
    await apiDelete(`/settings/brand-asset/${jenis}`);
    appConfig.setBrand(jenis === 'logo' ? { logoUrl: '' } : { iconUrl: '' });
  } catch (e) {
    error.value = errorMessage(e, t('settings.brand.uploadFailed'));
  } finally {
    uploading.value = '';
  }
}
</script>

<template>
  <section id="setting-group-brand" class="card mb-6 scroll-mt-24 p-5">
    <h2 class="section-title">{{ t('settings.group.brand') }}</h2>
    <p class="mt-1 text-xs text-slate-400">{{ t('settings.brand.intro') }}</p>

    <div v-if="error" class="mt-3 alert-error">{{ error }}</div>

    <!-- Nama aplikasi -->
    <div class="mt-4 border-t border-slate-100 pt-4">
      <label class="label" for="brand-name">{{ t('settings.item.brand_nama_aplikasi.label') }}</label>
      <p class="mb-1.5 text-xs text-slate-400">{{ t('settings.item.brand_nama_aplikasi.desc') }}</p>
      <input id="brand-name" v-model="name" class="input" :disabled="!canEdit" />
    </div>

    <!-- Baris footer -->
    <div class="mt-4 border-t border-slate-100 pt-4">
      <label class="label" for="brand-footer">{{ t('settings.item.brand_footer.label') }}</label>
      <p class="mb-1.5 text-xs text-slate-400">{{ t('settings.item.brand_footer.desc') }}</p>
      <input
        id="brand-footer"
        v-model="footer"
        class="input"
        :placeholder="t('settings.brand.footerPlaceholder')"
        :disabled="!canEdit"
      />
      <p v-if="appConfig.footerText" class="mt-1.5 text-xs text-slate-500">
        {{ t('settings.brand.preview') }} <span class="text-slate-700">{{ appConfig.footerText }}</span>
      </p>
    </div>

    <button v-if="canEdit" class="btn-primary mt-4" :disabled="saving" @click="saveText">
      {{ saving ? t('common.state.saving') : saved ? t('settings.saved') : t('common.action.save') }}
    </button>

    <!-- Logo & ikon -->
    <div class="mt-5 grid gap-5 border-t border-slate-100 pt-4 sm:grid-cols-2">
      <div>
        <label class="label">{{ t('settings.item.brand_logo_url.label') }}</label>
        <p class="mb-2 text-xs text-slate-400">{{ t('settings.item.brand_logo_url.desc') }}</p>
        <div class="grid h-24 place-items-center rounded border border-slate-200 bg-slate-50 p-3">
          <img
            v-if="appConfig.logoUrl"
            :src="appConfig.logoUrl"
            :alt="appConfig.appName"
            class="max-h-16 w-auto max-w-full object-contain"
          />
          <span v-else class="text-xs text-slate-400">{{ t('settings.brand.noLogo') }}</span>
        </div>
        <div v-if="canEdit" class="mt-2 flex gap-2">
          <input ref="logoInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onPick('logo', $event)" />
          <button class="btn-outline btn-sm" :disabled="uploading === 'logo'" @click="logoInput?.click()">
            <Icon name="download" :size="14" class="rotate-180" />
            {{ uploading === 'logo' ? t('common.state.uploading') : t('settings.brand.replace') }}
          </button>
          <button
            v-if="appConfig.logoUrl"
            class="btn-outline btn-sm text-rose-600"
            :disabled="uploading === 'logo'"
            @click="clearAsset('logo')"
          >
            {{ t('common.action.remove') }}
          </button>
        </div>
      </div>

      <div>
        <label class="label">{{ t('settings.item.brand_icon_url.label') }}</label>
        <p class="mb-2 text-xs text-slate-400">{{ t('settings.item.brand_icon_url.desc') }}</p>
        <div class="grid h-24 place-items-center rounded border border-slate-200 bg-slate-50 p-3">
          <img
            v-if="appConfig.iconUrl"
            :src="appConfig.iconUrl"
            :alt="appConfig.appName"
            class="h-12 w-12 object-contain"
          />
          <span v-else class="text-xs text-slate-400">{{ t('settings.brand.noIcon') }}</span>
        </div>
        <div v-if="canEdit" class="mt-2 flex gap-2">
          <input ref="iconInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="onPick('icon', $event)" />
          <button class="btn-outline btn-sm" :disabled="uploading === 'icon'" @click="iconInput?.click()">
            <Icon name="download" :size="14" class="rotate-180" />
            {{ uploading === 'icon' ? t('common.state.uploading') : t('settings.brand.replace') }}
          </button>
          <button
            v-if="appConfig.iconUrl"
            class="btn-outline btn-sm text-rose-600"
            :disabled="uploading === 'icon'"
            @click="clearAsset('icon')"
          >
            {{ t('common.action.remove') }}
          </button>
        </div>
      </div>
    </div>

    <p class="mt-3 text-xs text-slate-400">{{ t('settings.brand.fileHint') }}</p>
  </section>
</template>
