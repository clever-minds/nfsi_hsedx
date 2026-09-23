import { defineStore } from 'pinia';
import { apiPost, apiGet, setTokens } from '@/lib/api';

export interface AuthUser {
  id: string;
  nama_lengkap: string;
  email: string | null;
  nomor_wa: string | null;
  status: string;
  foto_profil: string | null;
  roles: string[];
  permissions: string[];
}

interface Tokens {
  access_token: string;
  refresh_token: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    activeRole: (localStorage.getItem('active_role') as string | null) || null,
    ready: false,
  }),
  getters: {
    isAuthenticated: (s) => !!s.user,
    roles: (s) => s.user?.roles ?? [],
    permissions: (s) => new Set(s.user?.permissions ?? []),
    can:
      (s) =>
      (key: string): boolean => {
        const perms = s.user?.permissions ?? [];
        return perms.includes('*') || perms.includes(key);
      },
  },
  actions: {
    async login(identifier: string, password: string) {
      const res = await apiPost<{ user: AuthUser; tokens: Tokens }>('/auth/login', { identifier, password });
      setTokens(res.tokens.access_token, res.tokens.refresh_token);
      await this.fetchMe();
    },
    async register(payload: Record<string, unknown>) {
      const res = await apiPost<{ user: AuthUser; tokens: Tokens | null }>('/auth/register', payload);
      if (res.tokens) {
        setTokens(res.tokens.access_token, res.tokens.refresh_token);
        await this.fetchMe();
      }
      return res;
    },
    async fetchMe() {
      try {
        const me = await apiGet<AuthUser>('/auth/me');
        this.user = me;
        if (!this.activeRole || !me.roles.includes(this.activeRole)) {
          this.setActiveRole(me.roles[0] ?? null);
        }
      } catch {
        this.user = null;
      } finally {
        this.ready = true;
      }
    },
    setActiveRole(role: string | null) {
      this.activeRole = role;
      if (role) localStorage.setItem('active_role', role);
      else localStorage.removeItem('active_role');
    },
    async logout() {
      const refresh = localStorage.getItem('refresh_token');
      try {
        if (refresh) await apiPost('/auth/logout', { refresh_token: refresh });
      } catch {
        /* ignore */
      }
      setTokens(null, null);
      this.user = null;
      this.setActiveRole(null);
    },
    async bootstrap() {
      if (localStorage.getItem('access_token')) await this.fetchMe();
      else this.ready = true;
    },
  },
});
