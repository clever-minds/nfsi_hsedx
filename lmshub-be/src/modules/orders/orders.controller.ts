import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { parsePage, pageMeta } from '../../core/http/pagination';
import { validated } from '../../core/validation/validate';
import { AppError } from '../../core/http/AppError';
import * as service from './orders.service';
import { CheckoutInput, ManualOrderInput, PayInput, RefundInput, VerifyPaymentInput } from './orders.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function checkout(req: Request, res: Response) {
  return created(res, await service.checkout(auth(req), validated<CheckoutInput>(req)));
}

export async function createManual(req: Request, res: Response) {
  return created(res, await service.createManual(auth(req), validated<ManualOrderInput>(req)));
}

export async function list(req: Request, res: Response) {
  const page = parsePage(req);
  // Both spellings are accepted. The transaction screen sends plain `status=` and
  // `jalur=`, while the rest of the API uses `filter[...]`; reading only the
  // bracketed form left every control on that screen doing nothing at all.
  const pick = (name: string): string | undefined =>
    (req.query[`filter[${name}]`] as string | undefined) ?? (req.query[name] as string | undefined);

  // Nilai di luar enum dulu diteruskan apa adanya dan Postgres menolaknya sebagai
  // kegagalan internal, sehingga penyaring yang salah ketik menjawab 500.
  const ORDER_STATUS = ['menunggu_pembayaran', 'dp_cicilan_berjalan', 'lunas', 'akses_aktif', 'batal'];
  const ORDER_JALUR = ['online', 'manual'];
  const oneOf = (value: string | undefined, allowed: string[], field: string): string | undefined => {
    if (value === undefined || value === '') return undefined;
    if (!allowed.includes(value)) {
      throw AppError.badRequest(`Unknown ${field}: ${value}`, `order.invalid_${field}`);
    }
    return value;
  };

  const filters = {
    status: oneOf(pick('status'), ORDER_STATUS, 'status'),
    jalur: oneOf(pick('jalur'), ORDER_JALUR, 'jalur'),
    q: pick('q'),
    buyer_user_id: pick('buyer_user_id'),
    marketing_user_id: pick('marketing_user_id'),
  };
  const { rows, total } = await service.list(auth(req), page, filters);
  return ok(res, rows, pageMeta(page.page, page.limit, total));
}

export async function detail(req: Request, res: Response) {
  return ok(res, await service.detail(auth(req), req.params.id));
}

export async function pay(req: Request, res: Response) {
  return ok(res, await service.pay(auth(req), req.params.id, validated<PayInput>(req)));
}

// Mulai pembayaran gateway — kembalikan URL checkout provider.
// `provider` opsional: klien lama tanpa field ini memakai gateway pertama yang aktif.
export async function payGateway(req: Request, res: Response) {
  const provider = typeof req.body?.provider === 'string' ? req.body.provider : undefined;
  return ok(res, await service.payGateway(auth(req), req.params.id, provider));
}

// Daftar gateway aktif + rekening transfer manual, untuk layar checkout FE.
export async function paymentConfig(_req: Request, res: Response) {
  return ok(res, await service.paymentConfig());
}

// Webhook gateway — TANPA auth, diverifikasi oleh adapter masing-masing.
// Selalu balas 200 bila tertangani agar provider tidak mengulang kiriman.
export async function gatewayWebhook(req: Request, res: Response) {
  const result = await service.handleGatewayWebhook(req.params.provider, {
    headers: req.headers,
    rawBody: req.rawBody ?? null,
    body: req.body,
  });
  return ok(res, result);
}

export async function verify(req: Request, res: Response) {
  return ok(res, await service.verify(auth(req), req.params.id, validated<VerifyPaymentInput>(req)));
}

export async function invoice(req: Request, res: Response) {
  return ok(res, await service.invoice(auth(req), req.params.id));
}

export async function refund(req: Request, res: Response) {
  return ok(res, await service.refund(auth(req), req.params.id, validated<RefundInput>(req)));
}
