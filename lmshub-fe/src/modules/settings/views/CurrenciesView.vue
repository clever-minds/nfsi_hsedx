<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiDelete, apiGet, apiPost, apiPut, errorMessage } from '@/lib/api';
import { CURRENCIES } from '@/lib/currencies';
import { useCurrencyStore } from '@/stores/currency';
import PageHeader from '@/components/ui/PageHeader.vue';
import Icon from '@/components/ui/Icon.vue';

/**
 * Master data mata uang.
 *
 * Kurs dibaca sebagai "1 <basis> = X <mata uang ini>", dan itu ditulis apa
 * adanya di layar — arah kurs adalah kesalahan yang paling mudah dibuat dan
 * paling sulit disadari, karena hasilnya tetap berupa angka yang tampak wajar.
 *
 * Baris basis dikunci: kursnya selalu 1 dan tidak bisa dinonaktifkan atau
 * dihapus. Aturannya ditegakkan backend; di sini kontrolnya sekadar tidak
 * ditawarkan supaya tidak ada yang mencoba lalu ditolak.
 */

interface Row {
  id: string;
  kode: string;
  nama: string;
  simbol: string;
  rate: string;
  desimal: number;
  is_aktif: boolean;
  urutan: number;
  is_basis: boolean;
}

const { t } = useI18n();
const store = useCurrencyStore();

const rows = ref<Row[]>([]);
const base = ref('');
const loading = ref(false);
const error = ref('');
const showForm = ref(false);
const saving = ref(false);

const draft = reactive({ kode: '', nama: '', simbol: '', rate: 1, desimal: 2, urutan: 0 });

/** Kode yang belum dipakai — mencegah duplikat sebelum request dikirim. */
const available = computed(() => {
  const used = new Set(rows.value.map((r) => r.kode.toUpperCase()));
  return CURRENCIES.filter((c) => !used.has(c.code));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const d = await apiGet<{ base: string; currencies: Row[] }>('/currencies');
    rows.value = d.currencies;
    base.value = d.base;
  } catch (e) {
    error.value = errorMessage(e, t('settings.currencies.loadFailed'));
  } finally {
    loading.value = false;
  }
}

function openForm() {
  Object.assign(draft, { kode: '', nama: '', simbol: '', rate: 1, desimal: 2, urutan: rows.value.length });
  showForm.value = true;
}

/** Nama resmi ISO diisikan otomatis begitu kode dipilih. */
function onPickCode() {
  const found = CURRENCIES.find((c) => c.code === draft.kode);
  if (found && !draft.nama) draft.nama = found.name;
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    await apiPost('/currencies', { ...draft });
    showForm.value = false;
    await refresh();
  } catch (e) {
    error.value = errorMessage(e, t('settings.currencies.saveFailed'));
  } finally {
    saving.value = false;
  }
}

/**
 * `changes` bukan `Partial<Row>`: `rate` datang dari database sebagai string
 * numeric, sementara yang dikirim ke API adalah number. Memaksakan satu tipe
 * untuk dua arah hanya menghasilkan cast yang menyembunyikan perbedaan itu.
 */
async function patch(row: Row, changes: Record<string, unknown>) {
  error.value = '';
  try {
    await apiPut(`/currencies/${row.id}`, changes);
    await refresh();
  } catch (e) {
    error.value = errorMessage(e, t('settings.currencies.saveFailed'));
    await load();
  }
}

async function remove(row: Row) {
  if (!confirm(t('settings.currencies.confirmDelete', { code: row.kode }))) return;
  error.value = '';
  try {
    await apiDelete(`/currencies/${row.id}`);
    await refresh();
  } catch (e) {
    error.value = errorMessage(e, t('settings.currencies.deleteFailed'));
  }
}

/** Muat ulang daftar publik juga, supaya harga di layar langsung ikut kurs baru. */
async function refresh() {
  await load();
  store.ready = false;
  await store.bootstrap();
}

onMounted(load);
</script>

<template>
  <section>
    <PageHeader :title="t('settings.currencies.title')" :subtitle="t('settings.currencies.subtitle', { code: base })">
      <template #actions>
        <button class="btn-primary rounded-full px-4 py-2 text-sm" @click="openForm">
          + {{ t('settings.currencies.add') }}
        </button>
      </template>
    </PageHeader>

    <div v-if="error" class="mb-4 alert-error">{{ error }}</div>

    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-4 py-3 text-start">{{ t('settings.currencies.colCode') }}</th>
            <th class="px-4 py-3 text-start">{{ t('settings.currencies.colName') }}</th>
            <th class="px-4 py-3 text-start">{{ t('settings.currencies.colSymbol') }}</th>
            <th class="px-4 py-3 text-start">{{ t('settings.currencies.colRate', { code: base }) }}</th>
            <th class="px-4 py-3 text-start">{{ t('settings.currencies.colDecimals') }}</th>
            <th class="px-4 py-3 text-start">{{ t('settings.currencies.colActive') }}</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="7" class="px-4 py-6 text-center text-slate-400">{{ t('common.state.loading') }}</td></tr>
          <tr v-for="r in rows" :key="r.id" class="border-t border-slate-100">
            <td class="px-4 py-3 font-semibold text-slate-900">
              {{ r.kode }}
              <span v-if="r.is_basis" class="ms-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600">
                {{ t('settings.currencies.baseBadge') }}
              </span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ r.nama }}</td>
            <td class="px-4 py-3 text-slate-600">{{ r.simbol || '—' }}</td>
            <td class="px-4 py-3">
              <span v-if="r.is_basis" class="text-slate-400">1.00</span>
              <input
                v-else
                type="number" step="0.00000001" min="0.00000001"
                class="input w-40" :value="Number(r.rate)"
                @change="patch(r, { rate: Number(($event.target as HTMLInputElement).value) })"
              />
            </td>
            <td class="px-4 py-3 text-slate-600">{{ r.desimal }}</td>
            <td class="px-4 py-3">
              <input
                type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-500"
                :checked="r.is_aktif" :disabled="r.is_basis"
                @change="patch(r, { is_aktif: ($event.target as HTMLInputElement).checked })"
              />
            </td>
            <td class="px-4 py-3 text-end">
              <button v-if="!r.is_basis" class="row-action row-action-danger" @click="remove(r)">
                <Icon name="trash" :size="16" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-3 text-xs leading-relaxed text-slate-400">{{ t('settings.currencies.note', { code: base }) }}</p>

    <!-- Form tambah -->
    <div v-if="showForm" class="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4">
      <div class="card w-full max-w-md rounded-2xl p-5">
        <h3 class="card-title">{{ t('settings.currencies.add') }}</h3>

        <label class="label mt-4">{{ t('settings.currencies.colCode') }}</label>
        <select v-model="draft.kode" class="input" @change="onPickCode">
          <option value="" disabled>{{ t('settings.currencies.pickCode') }}</option>
          <option v-for="c in available" :key="c.code" :value="c.code">{{ c.code }} — {{ c.name }}</option>
        </select>

        <label class="label mt-3">{{ t('settings.currencies.colName') }}</label>
        <input v-model="draft.nama" class="input" />

        <div class="mt-3 flex gap-3">
          <div class="flex-1">
            <label class="label">{{ t('settings.currencies.colSymbol') }}</label>
            <input v-model="draft.simbol" class="input" placeholder="$" />
          </div>
          <div class="w-28">
            <label class="label">{{ t('settings.currencies.colDecimals') }}</label>
            <input v-model.number="draft.desimal" type="number" min="0" max="4" class="input" />
          </div>
        </div>

        <label class="label mt-3">{{ t('settings.currencies.colRate', { code: base }) }}</label>
        <input v-model.number="draft.rate" type="number" step="0.00000001" min="0.00000001" class="input" />
        <p class="mt-1 text-xs text-slate-400">
          {{ t('settings.currencies.rateHint', { base, code: draft.kode || '—' }) }}
        </p>

        <button class="btn-primary mt-5 w-full rounded-full" :disabled="saving || !draft.kode || !draft.nama" @click="save">
          {{ saving ? t('common.state.saving') : t('common.action.save') }}
        </button>
        <button class="mt-2 w-full text-center text-sm text-slate-400 hover:text-slate-600" @click="showForm = false">
          {{ t('common.action.cancel') }}
        </button>
      </div>
    </div>
  </section>
</template>
