// Helper Google Identity Services (GSI) untuk tombol "Masuk dengan Google".
// Client ID diambil dari GET /auth/oauth-config (nilai `google_client_id`), yang di backend
// dikonfigurasi lewat pengaturan super admin (key `google.client_id`, grup `auth` — lihat SettingsView).
// Jika belum diisi, `google_enabled` bernilai false dan tombol Google harus disembunyikan oleh pemanggil.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            ux_mode?: 'popup' | 'redirect';
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options?: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number | string;
              logo_alignment?: 'left' | 'center';
            },
          ) => void;
          prompt?: () => void;
        };
      };
    };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise: Promise<void> | null = null;

/** Muat skrip Google Identity Services sekali (idempotent). */
export function loadGoogleSignInScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load the Google Sign-In script')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the Google Sign-In script'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Muat skrip GSI, inisialisasi dengan client id, lalu render tombol Google di elemen `el`.
 * `onCredential` dipanggil dengan JWT `credential` (id_token) saat pengguna berhasil memilih akun.
 */
export async function renderGoogleSignInButton(
  el: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
): Promise<void> {
  await loadGoogleSignInScript();
  if (!window.google?.accounts?.id) throw new Error('Google Sign-In is unavailable');
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
    ux_mode: 'popup',
  });
  window.google.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: 320,
  });
}
