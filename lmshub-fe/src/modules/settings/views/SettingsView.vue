<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiGetFull, apiPut, errorMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useAppConfigStore } from '@/stores/appConfig';
import PageHeader from '@/components/ui/PageHeader.vue';
import Icon from '@/components/ui/Icon.vue';
import BrandIdentityCard from '../components/BrandIdentityCard.vue';
import PaymentGatewayInfo, { type GatewayMeta } from '../components/PaymentGatewayInfo.vue';
import SearchableSelect from '@/components/ui/SearchableSelect.vue';
import {
  compareGroups,
  compareSettings,
  controlFor,
  groupLabel,
  isRetired,
  parseTiers,
  selectOptions,
  serializeTiers,
  settingDescription,
  settingLabel,
  unitLabel,
  type CommissionTier,
  type SettingItem,
} from '../settings-schema';

const auth = useAuthStore();
const appConfig = useAppConfigStore();
const { t } = useI18n();
const canEdit = auth.can('pengaturan.update');

const settings = ref<SettingItem[]>([]);
const loading = ref(true);
const error = ref('');
const savingKey = ref<string | null>(null);
const savedKey = ref<string | null>(null);

/** Seksi yang sedang terlihat — menyorot item di panel navigasi kiri. */
const activeGroup = ref('');

/** Draft tier komisi per key, supaya tabelnya bisa diubah sebelum disimpan. */
const tierDrafts = ref<Record<string, CommissionTier[]>>({});

/**
 * Metadata gateway (status + URL webhook) dari server. Dimuat terpisah dari
 * daftar setting karena URL webhook dihitung dari APP_URL, bukan disimpan
 * sebagai setting — pembeli tidak boleh perlu mengetiknya.
 */
const gateways = ref<GatewayMeta[]>([]);
const gatewayFor = (grup: string) =>
  gateways.value.find((g) => `payment_${g.id}` === grup) ?? null;

async function loadGateways() {
  try {
    gateways.value = await apiGet<GatewayMeta[]>('/settings/payment-gateways');
  } catch {
    // Tanpa metadata halaman tetap berfungsi; hanya kartu webhook yang absen.
    gateways.value = [];
  }
}

/** Kelompokkan setting per `grup`, urut sesuai GROUP_ORDER. */
const groups = computed(() => {
  const map = new Map<string, SettingItem[]>();
  for (const item of settings.value) {
    const g = item.grup || 'umum';
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => compareGroups(a, b))
    .map(([grup, items]) => ({ grup, label: groupLabel(grup), items: [...items].sort(compareSettings) }));
});

function sectionId(grup: string): string {
  return `setting-group-${grup}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await apiGetFull<SettingItem[]>('/settings');
    // Buang setting yang sudah dipensiunkan — instalasi yang belum dimigrasi
    // masih mengirimnya, dan tidak ada kode yang membaca nilainya lagi.
    settings.value = (res.data ?? []).filter((item) => !isRetired(item));
    // Siapkan draft untuk setiap setting bertipe tier komisi.
    const drafts: Record<string, CommissionTier[]> = {};
    for (const item of settings.value) {
      if (controlFor(item) === 'commissionTiers') drafts[item.key] = parseTiers(item.nilai);
    }
    tierDrafts.value = drafts;
    if (!activeGroup.value && groups.value.length) activeGroup.value = groups.value[0].grup;
  } catch (e) {
    error.value = errorMessage(e, t('settings.loadFailed'));
    settings.value = [];
  } finally {
    loading.value = false;
  }
}

async function save(item: SettingItem) {
  savingKey.value = item.key;
  savedKey.value = null;
  error.value = '';

  // Setting JSON dikirim sebagai teks JSON sekaligus objek, agar kolom `nilai`
  // dan `nilai_json` di backend tidak saling bertentangan.
  let nilai = item.nilai;
  let nilaiJson: unknown;
  const control = controlFor(item);
  if (control === 'commissionTiers') {
    nilai = serializeTiers(tierDrafts.value[item.key] ?? []);
    item.nilai = nilai;
  }
  if (item.tipe_nilai === 'json') {
    try {
      nilaiJson = JSON.parse(nilai || 'null');
    } catch {
      error.value = t('settings.invalidJson', { label: settingLabel(item) });
      savingKey.value = null;
      return;
    }
  }

  try {
    await apiPut(`/settings/${item.key}`, nilaiJson === undefined ? { nilai } : { nilai, nilai_json: nilaiJson });
    // Mata uang memengaruhi seluruh harga — terapkan tanpa perlu muat ulang.
    if (item.key === 'currency.code') appConfig.setCurrency(nilai);
    savedKey.value = item.key;
    setTimeout(() => (savedKey.value === item.key ? (savedKey.value = null) : null), 1500);
  } catch (e) {
    error.value = errorMessage(e, t('settings.saveFailed'));
  } finally {
    savingKey.value = null;
  }
}

// ── Tier komisi ────────────────────────────────────────────────
function addTier(key: string) {
  (tierDrafts.value[key] ??= []).push({ kategori: '', rate: 0 });
}
function removeTier(key: string, index: number) {
  tierDrafts.value[key]?.splice(index, 1);
}

// ── Navigasi seksi ─────────────────────────────────────────────
function goToGroup(grup: string) {
  activeGroup.value = grup;
  document.getElementById(sectionId(grup))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Sorot seksi yang sedang dibaca. `rootMargin` atas dibuat setinggi header
 * tetap (64px) plus sedikit jarak, supaya seksi dianggap aktif tepat saat
 * judulnya lewat di bawah header, bukan saat menyentuh tepi viewport.
 */
let observer: IntersectionObserver | null = null;

function observeSections() {
  observer?.disconnect();
  if (typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) activeGroup.value = visible.target.id.replace('setting-group-', '');
    },
    { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
  );
  for (const g of groups.value) {
    const el = document.getElementById(sectionId(g.grup));
    if (el) observer.observe(el);
  }
}

watch(groups, () => nextTick(observeSections));
onMounted(() => {
  load();
  loadGateways();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div>
    <PageHeader :title="t('settings.title')" :subtitle="t('settings.subtitle')">
      <template #actions>
        <RouterLink class="btn-outline" :to="{ name: 'pengaturan-rekening' }">
          {{ t('settings.bankAccounts') }}
        </RouterLink>
        <RouterLink class="btn-outline" :to="{ name: 'my-profile' }">{{ t('settings.myProfile') }}</RouterLink>
      </template>
    </PageHeader>

    <div v-if="loading" class="text-slate-400">{{ t('common.state.loading') }}</div>

    <template v-else>
      <div v-if="error" class="mb-4 alert-error">{{ error }}</div>
      <div v-if="!settings.length" class="empty-state">{{ t('settings.empty') }}</div>

      <div v-else class="grid items-start gap-6 lg:grid-cols-[16rem,1fr]">
        <!-- ── Navigasi seksi (sticky, menyorot seksi yang sedang dibaca) ── -->
        <nav class="card sticky top-20 hidden max-h-[calc(100vh-7rem)] overflow-y-auto p-2 lg:block">
          <button
            v-for="group in groups"
            :key="group.grup"
            type="button"
            class="flex w-full items-center gap-2 rounded px-3 py-2 text-start text-sm transition"
            :class="
              activeGroup === group.grup
                ? 'bg-brand-50 font-medium text-brand-600'
                : 'text-slate-600 hover:bg-slate-50'
            "
            @click="goToGroup(group.grup)"
          >
            <span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
            <span class="num shrink-0 text-xs text-slate-400">{{ group.items.length }}</span>
          </button>
        </nav>

        <!-- ── Seksi setting ── -->
        <div class="min-w-0">
          <p v-if="!canEdit" class="mb-4 alert-warning">
            {{ t('settings.readOnly') }}
          </p>

          <template v-for="group in groups" :key="group.grup">
          <!-- Grup dengan komponen khusus (identitas merek) digambar sendiri. -->
          <BrandIdentityCard v-if="group.grup === 'brand'" :items="group.items" :can-edit="canEdit" />

          <section v-else :id="sectionId(group.grup)" class="card mb-6 scroll-mt-24 p-5">
            <h2 class="section-title">{{ group.label }}</h2>

            <!-- Grup kredensial gateway: status + URL webhook siap salin. -->
            <PaymentGatewayInfo
              v-if="gatewayFor(group.grup)"
              class="mt-3"
              :gateway="gatewayFor(group.grup)!"
            />
            <p v-else-if="group.grup === 'payment'" class="mt-2 text-xs text-slate-400">
              {{ t('settings.payment.manualNote') }}
            </p>

            <div
              v-for="item in group.items"
              :key="item.key"
              class="mt-4 border-t border-slate-100 pt-4 first:mt-3 first:border-0 first:pt-0"
            >
              <label class="label" :for="`setting-${item.key}`">{{ settingLabel(item) }}</label>
              <p v-if="settingDescription(item)" class="mb-1.5 text-xs text-slate-400">
                {{ settingDescription(item) }}
              </p>

              <!-- Tier komisi: tabel kategori + rate, bukan JSON mentah -->
              <div v-if="controlFor(item) === 'commissionTiers'" class="space-y-2">
                <div
                  v-for="(tier, i) in tierDrafts[item.key] ?? []"
                  :key="i"
                  class="flex flex-wrap items-center gap-2"
                >
                  <input
                    v-model="tier.kategori"
                    class="input min-w-0 flex-1"
                    :placeholder="t('settings.tier.categoryPlaceholder')"
                    :disabled="!canEdit"
                  />
                  <div class="flex items-center gap-1.5">
                    <input
                      v-model.number="tier.rate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      class="input w-24"
                      :disabled="!canEdit"
                    />
                    <span class="text-sm text-slate-400">%</span>
                  </div>
                  <button
                    v-if="canEdit"
                    type="button"
                    class="btn-outline btn-icon text-rose-600"
                    :title="t('common.action.remove')"
                    @click="removeTier(item.key, i)"
                  >
                    <Icon name="x" :size="15" />
                  </button>
                </div>

                <p v-if="!(tierDrafts[item.key] ?? []).length" class="text-sm text-slate-400">
                  {{ t('settings.tier.empty') }}
                </p>

                <div class="flex flex-wrap gap-2 pt-1">
                  <button v-if="canEdit" type="button" class="btn-outline btn-sm" @click="addTier(item.key)">
                    <Icon name="plus" :size="14" /> {{ t('settings.tier.add') }}
                  </button>
                  <button
                    v-if="canEdit"
                    type="button"
                    class="btn-primary btn-sm"
                    :disabled="savingKey === item.key"
                    @click="save(item)"
                  >
                    {{
                      savingKey === item.key
                        ? t('common.state.saving')
                        : savedKey === item.key
                          ? t('settings.saved')
                          : t('common.action.save')
                    }}
                  </button>
                </div>
              </div>

              <!-- Kontrol satu baris: dropdown / angka / boolean / teks / JSON -->
              <div v-else class="flex flex-wrap items-start gap-2">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <!-- Dropdown dengan pencarian: daftar mata uang bisa panjang,
                       dan menggulirnya untuk satu baris adalah pekerjaan sia-sia. -->
                  <SearchableSelect
                    v-if="controlFor(item) === 'select'"
                    v-model="item.nilai"
                    :options="selectOptions(item.key)"
                    :disabled="!canEdit"
                    :empty-hint="item.key === 'currency.code' ? t('settings.currencies.emptyForBase') : ''"
                  />

                  <!-- Sakelar biner adalah kotak centang, bukan dropdown Ya/Tidak.
                       Delapan gateway berarti delapan dropdown yang harus dibuka
                       satu per satu hanya untuk melihat mana yang aktif; dengan
                       kotak centang statusnya terbaca sekali lihat. -->
                  <label
                    v-else-if="controlFor(item) === 'boolean'"
                    class="flex cursor-pointer items-center gap-2.5 select-none"
                    :class="canEdit ? '' : 'cursor-not-allowed opacity-60'"
                  >
                    <input
                      :id="`setting-${item.key}`"
                      type="checkbox"
                      class="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                      :checked="item.nilai === 'true'"
                      :disabled="!canEdit"
                      @change="item.nilai = ($event.target as HTMLInputElement).checked ? 'true' : 'false'"
                    />
                    <span class="text-sm text-slate-600">
                      {{ item.nilai === 'true' ? t('common.action.yes') : t('common.action.no') }}
                    </span>
                  </label>

                  <textarea
                    v-else-if="controlFor(item) === 'json'"
                    :id="`setting-${item.key}`"
                    v-model="item.nilai"
                    rows="3"
                    class="input font-mono text-xs"
                    spellcheck="false"
                    :disabled="!canEdit"
                  ></textarea>

                  <input
                    v-else
                    :id="`setting-${item.key}`"
                    v-model="item.nilai"
                    class="input"
                    :type="
                      controlFor(item) === 'password' ? 'password' : controlFor(item) === 'number' ? 'number' : 'text'
                    "
                    :autocomplete="controlFor(item) === 'password' ? 'new-password' : 'off'"
                    :disabled="!canEdit"
                  />

                  <span v-if="unitLabel(item, appConfig.currency)" class="shrink-0 text-sm text-slate-400">
                    {{ unitLabel(item, appConfig.currency) }}
                  </span>
                </div>

                <button
                  v-if="canEdit"
                  class="btn-outline shrink-0"
                  :disabled="savingKey === item.key"
                  @click="save(item)"
                >
                  {{
                    savingKey === item.key
                      ? t('common.state.saving')
                      : savedKey === item.key
                        ? t('settings.saved')
                        : t('common.action.save')
                  }}
                </button>
              </div>
            </div>
          </section>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
