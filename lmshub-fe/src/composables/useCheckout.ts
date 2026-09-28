import { ref } from 'vue';
import { apiPost, errorMessage } from '@/lib/api';
import { t } from '@/i18n';
import { paySnap } from '@/lib/payments';

export interface CheckoutItem {
  item_tipe: 'kursus' | 'bundle' | 'path' | 'langganan';
  course_id?: string;
  learning_path_id?: string;
}

interface OrderResp {
  id: string;
  total: string | number;
  status: string;
}

interface PayGatewayResp {
  payment_id: string;
  provider: string | null;
  redirect_url: string | null;
  meta: Record<string, unknown> | null;
  /** Bentuk lama khusus Midtrans; tetap dibaca agar klien lama tidak pecah. */
  snap: { token: string; redirect_url: string } | null;
  dev_auto_settled?: boolean;
  order: OrderResp;
}

interface PayResp {
  payment: { status: string };
  order: OrderResp;
}

export interface BuyOptions {
  /**
   * 'transfer' = transfer bank manual (menunggu konfirmasi admin).
   * Selain itu, id gateway dari `/orders/payment-config` — mis. 'stripe',
   * 'paypal', 'midtrans'. Kosong = gateway aktif pertama menurut backend.
   */
  metode?: string;
  /** Catatan/referensi pengirim untuk transfer manual. */
  referensi?: string;
  couponKode?: string;
}

export type CheckoutStatus = 'idle' | 'sukses' | 'pending' | 'batal' | 'menunggu_konfirmasi' | 'dialihkan';

/**
 * Alur beli: buat order → bayar.
 *
 * - 'transfer': catat pembayaran manual, admin yang mengonfirmasi.
 * - Midtrans: popup Snap, pembeli tetap di halaman.
 * - Gateway lain: backend mengembalikan URL checkout dan kita mengalihkan
 *   browser ke sana. Order tetap dilunasi oleh webhook, bukan oleh kepulangan
 *   pembeli ke halaman return.
 * - Mode DEV (tidak ada gateway dikonfigurasi): backend auto-settle.
 */
export function useCheckout() {
  const loading = ref(false);
  const error = ref('');
  const status = ref<CheckoutStatus>('idle');

  async function buy(items: CheckoutItem[], opts: BuyOptions = {}): Promise<boolean> {
    const metode = opts.metode ?? '';
    loading.value = true;
    error.value = '';
    status.value = 'idle';

    try {
      const order = await apiPost<OrderResp>('/orders', { items, coupon_kode: opts.couponKode });

      // Order bernilai nol — kursus gratis, atau kupon yang memotong habis —
      // sudah diaktifkan backend di dalam transaksi pembuatannya. Tidak ada yang
      // perlu dibayar, dan meneruskannya ke jalur gateway justru berakhir
      // `order.free_no_payment`.
      if (order.status === 'akses_aktif') {
        status.value = 'sukses';
        return true;
      }

      if (metode === 'transfer') {
        await apiPost<PayResp>(`/orders/${order.id}/pay`, {
          jenis: 'penuh',
          nominal: Number(order.total),
          metode: 'transfer_bank',
          referensi_gateway: opts.referensi,
        });
        status.value = 'menunggu_konfirmasi';
        return true;
      }

      const pg = await apiPost<PayGatewayResp>(`/orders/${order.id}/pay-gateway`, {
        provider: metode || undefined,
      });

      if (pg.dev_auto_settled) {
        status.value = 'sukses';
        return true;
      }

      // Midtrans: popup, hasilnya diketahui langsung.
      if (pg.snap?.token) {
        const result = await paySnap(pg.snap.token);
        if (result === 'success') status.value = 'sukses';
        else if (result === 'pending') status.value = 'pending';
        else status.value = 'batal';
        return result === 'success';
      }

      // Gateway hosted: tinggalkan halaman. Tidak ada nilai balik yang berarti
      // setelah ini — navigasi sudah dimulai.
      if (pg.redirect_url) {
        status.value = 'dialihkan';
        window.location.assign(pg.redirect_url);
        return true;
      }

      error.value = t('orders.checkoutFailed');
      return false;
    } catch (e) {
      error.value = errorMessage(e, t('orders.checkoutFailed'));
      return false;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, status, buy };
}
