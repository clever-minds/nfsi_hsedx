import { ref } from 'vue';
import { apiPost, errorMessage } from '@/lib/api';
import { t } from '@/i18n';
import { paySnap } from '@/lib/payments';

export interface CheckoutItem {
  item_type: 'course' | 'bundle' | 'path' | 'subscription';
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
  /** Bentuk lama khusus Midtrans; tetap read agar klien lama no pecah. */
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
   * Selain itu, id gateway from `/orders/payment-config` — mis. 'stripe',
   * 'paypal', 'midtrans'. Kosong = gateway active pertama mensort_order backend.
   */
  method?: string;
  /** Catatan/referensi sender untuk transfer manual. */
  referensi?: string;
  couponKode?: string;
}

export type CheckoutStatus = 'idle' | 'sukses' | 'pending' | 'cancelled' | 'menunggu_konfirmasi' | 'dialihkan';

/**
 * Alur beli: buat order → bayar.
 *
 * - 'transfer': catat payment manual, admin yang mengonfirmasi.
 * - Midtrans: popup Snap, pembeli tetap di halaman.
 * - Gateway lain: backend mengembalikan URL checkout dan kita mengalihkan
 *   browser to sana. Order tetap dilunasi by webhook, bukan by kepulangan
 *   pembeli to halaman return.
 * - Mode DEV (no ada gateway dikonfigurasi): backend auto-settle.
 */
export function useCheckout() {
  const loading = ref(false);
  const error = ref('');
  const status = ref<CheckoutStatus>('idle');

  async function buy(items: CheckoutItem[], opts: BuyOptions = {}): Promise<boolean> {
    const method = opts.method ?? '';
    loading.value = true;
    error.value = '';
    status.value = 'idle';

    try {
      const order = await apiPost<OrderResp>('/orders', { items, coupon_kode: opts.couponKode });

      // Order bernilai nol — course gratis, atau kupon yang memotong habis —
      // sudah diaktifkan backend di dalam transaction pembuatannya. no ada yang
      // perlu dibayar, dan meneruskannya to channel gateway justru berakhir
      // `order.free_no_payment`.
      if (order.status === 'access_active') {
        status.value = 'sukses';
        return true;
      }

      if (method === 'transfer') {
        await apiPost<PayResp>(`/orders/${order.id}/pay`, {
          type: 'full',
          amount: Number(order.total),
          method: 'transfer_bank',
          gateway_reference: opts.referensi,
        });
        status.value = 'menunggu_konfirmasi';
        return true;
      }

      const pg = await apiPost<PayGatewayResp>(`/orders/${order.id}/pay-gateway`, {
        provider: method || undefined,
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
        else status.value = 'cancelled';
        return result === 'success';
      }

      // Gateway hosted: tinggalkan halaman. no ada value balik yang berarti
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
