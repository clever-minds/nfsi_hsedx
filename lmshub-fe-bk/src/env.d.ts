/* eslint-disable @typescript-eslint/no-unused-vars -- berkas ini hanya berisi
   deklarasi augmentasi tipe; tidak ada yang "dipakai" dalam arti runtime. */
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

import 'vue-router';
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    guestOnly?: boolean;
    permission?: string;
    /** Sembunyikan/blok rute untuk pengguna dengan salah satu peran ini. */
    hideForRoles?: string[];
    title?: string;
  }
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Runtime configuration injected by `public/config.js` before the app boots.
 * Optional on purpose — the app must still start if the file is missing or has
 * been emptied, falling back to `/api/v1` on the current origin.
 */
interface LmsHubRuntimeConfig {
  apiUrl?: string;
}

declare global {
  interface Window {
    __LMSHUB_CONFIG__?: LmsHubRuntimeConfig;
  }
}

export {};
