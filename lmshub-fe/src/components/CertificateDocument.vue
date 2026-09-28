<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { fmtTanggalPanjang } from '@/lib/format';

export interface CertData {
  nama: string;
  kursus: string;
  instruktur?: string | null;
  nomor_sertifikat?: string | null;
  kode_verifikasi?: string | null;
  qr_code_url?: string | null;
  tanggal_terbit?: string | null;
  verify_url?: string | null;
}
defineProps<{ cert: CertData }>();

const { t } = useI18n();
</script>

<template>
  <div class="cert-wrap">
    <div class="cert">
      <!-- Ornamen sudut -->
      <span class="corner tl"></span><span class="corner tr"></span>
      <span class="corner bl"></span><span class="corner br"></span>

      <div class="cert-inner">
        <div class="brand">
          <span class="brand-mark">▦</span>
          <span class="brand-name">LMS HUB</span>
        </div>
        <div class="eyebrow">{{ t('certificates.doc.eyebrow') }}</div>
        <h1 class="title">{{ t('certificates.doc.title') }}</h1>
        <div class="divider"><span></span>❖<span></span></div>

        <p class="lead">{{ t('certificates.doc.leadTo') }}</p>
        <div class="nama">{{ cert.nama }}</div>
        <p class="lead">{{ t('certificates.doc.leadFor') }}</p>
        <div class="kursus">{{ cert.kursus }}</div>

        <div class="meta">
          <div class="meta-col">
            <div class="meta-line"></div>
            <div class="meta-label">{{ cert.instruktur || t('certificates.doc.instructor') }}</div>
            <div class="meta-sub">{{ t('certificates.doc.instructor') }}</div>
          </div>
          <div class="seal">★</div>
          <div class="meta-col">
            <div class="meta-line"></div>
            <div class="meta-label">{{ t('certificates.doc.academicDirector') }}</div>
            <div class="meta-sub">LMS Hub</div>
          </div>
        </div>

        <div class="footer">
          <div class="foot-left">
            <div><b>{{ t('certificates.doc.number') }}</b> {{ cert.nomor_sertifikat || '—' }}</div>
            <div><b>{{ t('certificates.doc.date') }}</b> {{ fmtTanggalPanjang(cert.tanggal_terbit) }}</div>
            <div v-if="cert.kode_verifikasi" class="kode">{{ t('certificates.doc.code', { value: cert.kode_verifikasi }) }}</div>
          </div>
          <div class="foot-right">
            <img v-if="cert.qr_code_url" :src="cert.qr_code_url" :alt="t('certificates.doc.qrAlt')" class="qr" />
            <div class="verify-note">{{ t('certificates.doc.verifyNote') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cert-wrap {
  width: 100%;
  display: flex;
  justify-content: center;
}
.cert {
  position: relative;
  width: 100%;
  max-width: 900px;
  aspect-ratio: 1.414 / 1;
  background: linear-gradient(135deg, #fbfdfb 0%, #f4f8f4 100%);
  border: 2px solid #b98a2e;
  box-shadow: 0 10px 40px rgba(18, 53, 38, 0.12);
  font-family: Georgia, 'Times New Roman', serif;
  color: #143d2f;
  overflow: hidden;
}
.cert-inner {
  position: absolute;
  inset: 14px;
  border: 1px solid #d8b25a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3% 8%;
}
.corner {
  position: absolute;
  width: 34px;
  height: 34px;
  border: 3px solid #b98a2e;
}
.corner.tl { top: 6px; left: 6px; border-right: 0; border-bottom: 0; }
.corner.tr { top: 6px; right: 6px; border-left: 0; border-bottom: 0; }
.corner.bl { bottom: 6px; left: 6px; border-right: 0; border-top: 0; }
.corner.br { bottom: 6px; right: 6px; border-left: 0; border-top: 0; }
.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.brand-mark {
  width: 26px; height: 26px; border-radius: 6px; background: #164031; color: #fff;
  display: grid; place-items: center; font-size: 15px;
}
.brand-name { letter-spacing: 3px; font-weight: 700; font-size: 14px; color: #164031; }
.eyebrow { letter-spacing: 4px; font-size: 10px; color: #b98a2e; font-weight: 700; margin-top: 4px; }
.title { font-size: clamp(20px, 4vw, 38px); margin: 4px 0 0; color: #123526; font-weight: 700; }
.divider { display: flex; align-items: center; gap: 10px; color: #d8b25a; margin: 8px 0 4px; }
.divider span { width: clamp(40px, 12vw, 90px); height: 1px; background: #d8b25a; display: inline-block; }
.lead { font-size: clamp(10px, 1.6vw, 13px); color: #4a6157; font-style: italic; margin: 6px 0 2px; }
.nama {
  font-size: clamp(24px, 5vw, 44px); color: #164031; font-weight: 700;
  border-bottom: 2px solid #d8b25a; padding: 0 12px 4px; margin: 2px 0 4px; line-height: 1.1;
}
.kursus { font-size: clamp(14px, 2.6vw, 22px); color: #1f6b4c; font-weight: 700; margin-top: 2px; }
.meta { display: flex; align-items: flex-end; justify-content: center; gap: clamp(20px, 8vw, 80px); margin-top: auto; padding-top: 3%; width: 100%; }
.meta-col { text-align: center; min-width: 120px; }
.meta-line { height: 1px; background: #143d2f66; margin-bottom: 4px; }
.meta-label { font-size: clamp(11px, 1.6vw, 14px); font-weight: 700; }
.meta-sub { font-size: 9px; color: #6a7a70; letter-spacing: 1px; text-transform: uppercase; }
.seal {
  width: clamp(38px, 6vw, 54px); height: clamp(38px, 6vw, 54px); border-radius: 50%;
  background: radial-gradient(circle, #d8b25a, #b98a2e); color: #fff;
  display: grid; place-items: center; font-size: clamp(18px, 3vw, 26px);
  box-shadow: 0 2px 8px rgba(185, 138, 46, 0.5); border: 2px solid #fff;
}
.footer { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; margin-top: 3%; font-size: 9px; color: #4a6157; }
.foot-left { text-align: left; line-height: 1.5; }
.foot-left .kode { font-family: 'SF Mono', Menlo, monospace; font-size: 7.5px; color: #8a978f; word-break: break-all; max-width: 220px; }
.foot-right { text-align: center; }
.qr { width: clamp(46px, 8vw, 70px); height: auto; }
.verify-note { font-size: 7px; color: #8a978f; margin-top: 2px; }

@media print {
  :global(body *) { visibility: hidden; }
  .cert-wrap, .cert-wrap * { visibility: visible; }
  .cert-wrap { position: absolute; inset: 0; }
  .cert { max-width: none; width: 100%; box-shadow: none; }
  @page { size: A4 landscape; margin: 8mm; }
}
</style>
