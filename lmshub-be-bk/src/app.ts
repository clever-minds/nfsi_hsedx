import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './core/config/env';
import { logger } from './core/logger/logger';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './core/http/errorHandler';

export function createApp() {
  const app = express();

  /**
   * Satu lompatan proxy (Nginx) di depan aplikasi.
   *
   * Tanpa ini Express tidak mempercayai `X-Forwarded-For`, sehingga pembatas
   * laju melihat semua permintaan datang dari alamat soket Nginx — satu jatah
   * 50 percobaan login per 15 menit dipakai bersama seluruh pengunjung, dan
   * segelintir orang bisa mengunci yang lain. Angka 1, bukan `true`: `true`
   * mempercayai header apa pun yang dikirim klien, termasuk yang dipalsukan.
   */
  app.set('trust proxy', 1);

  // Query parser 'simple' (bukan 'extended'/qs). Seluruh controller membaca
  // filter sebagai kunci harfiah — `req.query['filter[status]']` — sesuai yang
  // dikirim frontend. Parser 'extended' bawaan Express justru memecahnya menjadi
  // objek bersarang `req.query.filter.status`, sehingga SETIAP filter terbaca
  // undefined dan diam-diam diabaikan. Tidak ada parameter lain yang bersarang,
  // jadi 'simple' aman.
  app.set('query parser', 'simple');

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  // 4MB: gambar hero dibatasi 2MB, tapi dikirim sebagai data URL base64 yang
  // membengkak ~33%. Batas 2MB di sini akan menolaknya sebagai 413 sebelum
  // validasi ukuran yang sebenarnya sempat berjalan.
  app.use(
    express.json({
      limit: '4mb',
      // Payment gateways sign the bytes they sent, not a re-encoding of them.
      verify: (req, _res, buf) => {
        if (buf.length) (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get('/', (_req, res) => res.json({ name: 'lmshub-be', version: '0.1.0' }));

  // Wizard pemasangan pertama. Disajikan backend, bukan frontend, supaya tetap
  // terjangkau saat frontend belum ter-deploy atau alamat API-nya belum benar —
  // dua hal yang justru diperbaiki oleh wizard ini.
  app.use(
    '/install',
    express.static(path.resolve(process.cwd(), 'assets', 'install'), {
      index: 'index.html',
      // Jangan di-cache: setelah terpasang halamannya harus segera berubah.
      etag: false,
      maxAge: 0,
    }),
  );

  // File statis unggahan (foto profil dll). CORP di-relax agar bisa dimuat FE beda origin.
  app.use(
    '/uploads',
    express.static(path.resolve(process.cwd(), 'uploads'), {
      maxAge: '7d',
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    }),
  );

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
