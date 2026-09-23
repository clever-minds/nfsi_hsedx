import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { t, te } from '@/i18n';

export interface Envelope<T> {
  data: T | null;
  meta: Record<string, unknown> | null;
  /** `key` names the specific error so the client can localise it; `message` is the English fallback. */
  error: { code: string; message: string; details?: unknown; key?: string } | null;
}

/**
 * Where the backend lives.
 *
 * Resolved in three steps, most specific first:
 *
 *  1. `config.js` on the deployed server — editable after the fact, which is the
 *     point: moving the API to another domain must not require the buyer to
 *     install Node and rebuild the site.
 *  2. `VITE_API_URL` at build time — still honoured so existing deployments and
 *     the dev workflow keep behaving exactly as before.
 *  3. `/api/v1` on the current origin — correct whenever one reverse proxy
 *     serves both, which is how most installations end up.
 */
function resolveBaseUrl(): string {
  const runtime = window.__LMSHUB_CONFIG__?.apiUrl?.trim();
  if (runtime) return runtime.replace(/\/+$/, '');
  const buildTime = import.meta.env.VITE_API_URL?.trim();
  if (buildTime) return buildTime.replace(/\/+$/, '');
  return '/api/v1';
}

const BASE_URL = resolveBaseUrl();

/**
 * Resolve URL aset statis BE (mis. `/uploads/avatars/x.jpg`).
 * Dev: dilayani via proxy Vite; prod dengan VITE_API_URL absolut: pakai origin BE.
 */
export function assetUrl(p: string | null | undefined): string {
  if (!p) return '';
  if (/^https?:\/\//.test(p)) return p;
  if (/^https?:\/\//.test(BASE_URL)) return new URL(BASE_URL).origin + p;
  return p;
}

let accessToken: string | null = localStorage.getItem('access_token');
let refreshToken: string | null = localStorage.getItem('refresh_token');

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem('access_token', access);
  else localStorage.removeItem('access_token');
  if (refresh) localStorage.setItem('refresh_token', refresh);
  else localStorage.removeItem('refresh_token');
}

export const http: AxiosInstance = axios.create({ baseURL: BASE_URL, timeout: 20000 });

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await axios.post<Envelope<{ tokens: { access_token: string; refresh_token: string } }>>(
      `${BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
    );
    const t = res.data.data?.tokens;
    if (t) {
      setTokens(t.access_token, t.refresh_token);
      return true;
    }
  } catch {
    /* fallthrough */
  }
  setTokens(null, null);
  return false;
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && refreshToken) {
      original._retry = true;
      refreshing = refreshing ?? doRefresh();
      const ok = await refreshing;
      refreshing = null;
      if (ok) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
        return http(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Ambil payload `data` dari envelope; lempar Error dengan pesan backend bila gagal. */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await http.get<Envelope<T>>(url, { params });
  return res.data.data as T;
}
export async function apiGetFull<T>(url: string, params?: Record<string, unknown>): Promise<Envelope<T>> {
  const res = await http.get<Envelope<T>>(url, { params });
  return res.data;
}
export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<Envelope<T>>(url, body);
  return res.data.data as T;
}
export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put<Envelope<T>>(url, body);
  return res.data.data as T;
}
export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.patch<Envelope<T>>(url, body);
  return res.data.data as T;
}
export async function apiDelete<T = void>(url: string): Promise<T> {
  const res = await http.delete<Envelope<T>>(url);
  return res.data.data as T;
}

/**
 * Pesan error untuk ditampilkan ke pengguna.
 *
 * Urutan: pesan spesifik dari BE → `fallback` yang diberikan pemanggil →
 * pesan generik per status HTTP (sudah diterjemahkan).
 *
 * Catatan: pesan validasi dari BE masih berbahasa Indonesia karena i18n
 * belum ada di sisi server. `fallback` yang diterjemahkan menutup kasus
 * error jaringan/timeout yang tidak punya body.
 */
/**
 * Turn a failed request into something worth showing a person.
 *
 * Order matters. The backend sends both a translation `key` (`order.already_paid`)
 * and an English `message`; the key is preferred so the reader sees their own
 * language. The server message is the next best thing — it is always English and
 * always specific, which beats a generic fallback. Only when neither exists do we
 * fall back to the caller's text or a message derived from the status code.
 *
 * Older backends send no `key` at all, so the message path has to keep working.
 */
export function errorMessage(err: unknown, fallback?: string): string {
  const ax = err as AxiosError<Envelope<unknown>>;
  const serverError = ax.response?.data?.error;

  const key = serverError?.key;
  if (key && te(`errors.${key}`)) return t(`errors.${key}`);

  const fromServer = serverError?.message;
  if (fromServer) return fromServer;
  if (fallback) return fallback;

  const status = ax.response?.status;
  if (!ax.response) return t('common.error.network');
  if (status === 401) return t('common.error.unauthorized');
  if (status === 403) return t('common.error.forbidden');
  if (status === 404) return t('common.error.notFound');
  if (status && status >= 500) return t('common.error.server');
  return t('common.state.error');
}
