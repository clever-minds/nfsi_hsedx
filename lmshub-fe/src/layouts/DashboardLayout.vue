<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { navSections } from '@/config/nav';
import { assetUrl } from '@/lib/api';
import { roleLabel } from '@/lib/labels';
import Icon from '@/components/ui/Icon.vue';
import BrandMark from '@/components/ui/BrandMark.vue';
import CurrencySwitcher from '@/components/ui/CurrencySwitcher.vue';
import LocaleSwitcher from '@/components/ui/LocaleSwitcher.vue';
import { useAppConfigStore } from '@/stores/appConfig';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const appConfig = useAppConfigStore();

const sidebarOpen = ref(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
const userMenuOpen = ref(false);

// Seksi navigasi yang punya minimal satu item lolos gating izin + peran.
function itemVisible(n: { permission?: string; roles?: string[]; hideForRoles?: string[] }) {
  if (n.permission && !auth.can(n.permission)) return false;
  if (n.hideForRoles?.some((r) => auth.roles.includes(r))) return false;
  if (n.roles && !n.roles.some((r) => auth.roles.includes(r))) return false;
  return true;
}

// Label diterjemahkan di sini (bukan di config) agar ikut berubah saat ganti bahasa.
const visibleSections = computed(() =>
  navSections
    .map((s) => ({
      title: t(s.titleKey),
      items: s.items.filter(itemVisible).map((i) => ({ ...i, label: t(i.labelKey) })),
    }))
    .filter((s) => s.items.length > 0),
);

const initials = computed(() =>
  (auth.user?.nama_lengkap ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase(),
);

/** Item cocok bila path-nya sama persis atau merupakan induk dari path saat ini. */
function matches(to: string): boolean {
  if (to === '/d') return route.path === '/d'; // '/d' hanya aktif persis
  return route.path === to || route.path.startsWith(`${to}/`);
}

/**
 * Hanya item paling spesifik yang disorot. Tanpa ini `/d/pengaturan` ikut menyala
 * saat membuka `/d/pengaturan/rekening`, sehingga dua menu tampak aktif bersamaan.
 */
function isActive(to: string) {
  if (!matches(to)) return false;
  return !visibleSections.value.some((s) =>
    s.items.some((i) => i.to !== to && i.to.length > to.length && matches(i.to)),
  );
}

function closeSidebarOnMobile() {
  if (window.innerWidth < 768) sidebarOpen.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('[data-user-menu]')) userMenuOpen.value = false;
}

async function logout() {
  await auth.logout();
  router.push({ name: 'login' });
}

onMounted(() => document.addEventListener('click', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside));

const tahun = new Date().getFullYear();
</script>

<template>
  <div class="min-h-screen bg-surface">
    <!-- ── Header (fixed, ala Cursus) ─────────────────────────────── -->
    <header class="fixed inset-x-0 top-0 z-40 flex h-16 items-center bg-white shadow-header">
      <!-- Hamburger sengaja netral: merah disisakan untuk aksi utama, nav
           aktif, dan badge — bukan untuk mewarnai perabot. -->
      <button
        class="grid h-16 w-16 shrink-0 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        :aria-label="t('nav.header.toggleMenu')"
        @click="sidebarOpen = !sidebarOpen"
      >
        <Icon name="menu" :size="22" />
      </button>

      <!-- Logo -->
      <RouterLink to="/d" class="ms-4">
        <BrandMark />
      </RouterLink>

      <!-- Search -->
      <div class="mx-6 hidden max-w-xl flex-1 md:block">
        <div class="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 transition focus-within:border-brand-400 focus-within:bg-white">
          <Icon name="search" :size="16" class="shrink-0 text-slate-400" />
          <input
            type="search"
            :placeholder="t('nav.header.searchDashboard')"
            class="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div class="ms-auto flex items-center gap-1 pe-4 sm:gap-2">
        <!-- CTA buat kursus (hanya instruktur/admin yang punya izin membuat) -->
        <RouterLink v-if="auth.can('kursus.create')" to="/d/kursus/tambah" class="btn-primary hidden py-2 lg:inline-flex">
          {{ t('nav.header.newCourse') }}
        </RouterLink>

        <CurrencySwitcher />
        <LocaleSwitcher />

        <!-- Ikon aksi -->
        <RouterLink
          v-if="auth.can('diskusi.view')"
          to="/d/diskusi"
          class="header-icon-btn"
          :title="t('nav.item.discussions')"
        >
          <Icon name="mail" :size="19" />
        </RouterLink>
        <RouterLink
          v-if="auth.can('notifikasi.view')"
          to="/d/notifikasi"
          class="header-icon-btn"
          :title="t('nav.item.notifications')"
        >
          <Icon name="bell" :size="19" />
        </RouterLink>
      </div>
    </header>

    <!-- ── Backdrop mobile ────────────────────────────────────────── -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-20 bg-black/40 md:hidden"
      @click="sidebarOpen = false"
    />

    <!-- ── Sidebar putih ──────────────────────────────────────────── -->
    <aside
      class="fixed bottom-0 start-0 top-16 z-30 flex w-64 transform flex-col border-e border-slate-200 bg-white transition-transform duration-200"
      :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'"
    >
      <!-- Navigasi berkelompok dengan judul seksi -->
      <nav class="flex-1 overflow-y-auto py-3">
        <div v-for="section in visibleSections" :key="section.title" class="mb-1">
          <div class="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {{ section.title }}
          </div>
          <RouterLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ 'nav-item-active': isActive(item.to) }"
            @click="closeSidebarOnMobile"
          >
            <Icon :name="item.icon ?? 'grid'" :size="18" class="shrink-0" />
            {{ item.label }}
          </RouterLink>
        </div>
      </nav>

      <!-- ── Footer sidebar: profil pengguna + menu ────────────────── -->
      <div class="relative border-t border-slate-200" data-user-menu>
        <!-- Menu naik ke atas saat dibuka -->
        <Transition
          enter-active-class="transition duration-100"
          enter-from-class="translate-y-2 opacity-0"
          leave-active-class="transition duration-75"
          leave-to-class="translate-y-2 opacity-0"
        >
          <div
            v-if="userMenuOpen"
            class="absolute inset-x-2 bottom-full mb-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
          >
            <!-- Kartu identitas -->
            <div class="flex flex-col items-center gap-1 bg-brand-500 px-4 py-4 text-center text-white">
              <span class="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-white/20 text-sm font-bold">
                <img
                  v-if="auth.user?.foto_profil"
                  :src="assetUrl(auth.user.foto_profil)"
                  :alt="auth.user?.nama_lengkap"
                  class="h-full w-full object-cover"
                />
                <template v-else>{{ initials }}</template>
              </span>
              <div class="font-semibold leading-tight">{{ auth.user?.nama_lengkap }}</div>
              <div v-if="auth.user?.email" class="text-xs text-white/80">{{ auth.user.email }}</div>
              <div v-if="auth.user?.nomor_wa" class="num text-xs text-white/80">{{ auth.user.nomor_wa }}</div>
            </div>

            <!-- Ganti peran (bila punya lebih dari satu) -->
            <div v-if="auth.roles.length > 1" class="border-b border-slate-100 px-4 py-3">
              <label class="label text-xs">{{ t('nav.header.switchRole') }}</label>
              <select
                class="input py-1.5 text-xs"
                :value="auth.activeRole ?? ''"
                @change="auth.setActiveRole(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="r in auth.roles" :key="r" :value="r">{{ roleLabel(r) }}</option>
              </select>
            </div>

            <RouterLink
              to="/d/profil"
              class="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-500"
              @click="userMenuOpen = false"
            >
              <Icon name="user" :size="16" /> {{ t('common.nav.profile') }}
            </RouterLink>
            <RouterLink
              v-if="auth.can('pengaturan.view')"
              to="/d/pengaturan"
              class="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-500"
              @click="userMenuOpen = false"
            >
              <Icon name="settings" :size="16" /> {{ t('common.nav.settings') }}
            </RouterLink>
            <button
              class="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-500"
              @click="logout"
            >
              <Icon name="log-out" :size="16" /> {{ t('common.action.logout') }}
            </button>
          </div>
        </Transition>

        <!-- Baris pemicu -->
        <button
          class="flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-slate-50"
          @click="userMenuOpen = !userMenuOpen"
        >
          <span class="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500 text-sm font-bold text-white">
            <img
              v-if="auth.user?.foto_profil"
              :src="assetUrl(auth.user.foto_profil)"
              :alt="auth.user?.nama_lengkap"
              class="h-full w-full object-cover"
            />
            <template v-else>{{ initials }}</template>
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-slate-900">{{ auth.user?.nama_lengkap }}</span>
            <span class="block truncate text-xs text-slate-400">
              {{ auth.activeRole ? roleLabel(auth.activeRole) : t('common.role.user') }}
            </span>
          </span>
          <Icon
            name="chevron-down"
            :size="18"
            class="shrink-0 text-slate-400 transition-transform"
            :class="userMenuOpen ? 'rotate-180' : ''"
          />
        </button>
      </div>
    </aside>

    <!-- ── Konten ─────────────────────────────────────────────────── -->
    <div
      class="flex min-h-screen flex-col pt-16 transition-all duration-200"
      :class="sidebarOpen ? 'md:ps-64' : 'md:ps-0'"
    >
      <main class="flex-1">
        <div class="p-4 sm:p-6">
          <RouterView />
        </div>
      </main>

      <!-- ── Footer bawah halaman ─────────────────────────────────── -->
      <footer class="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div class="flex flex-col items-center justify-center gap-2 text-xs text-slate-400 sm:flex-row">
          <div v-if="appConfig.footerText">{{ appConfig.footerText }}</div>
          <div v-else>© {{ tahun }} <span class="font-medium text-slate-500">{{ appConfig.appName }}</span></div>
        </div>
      </footer>
    </div>
  </div>
</template>
