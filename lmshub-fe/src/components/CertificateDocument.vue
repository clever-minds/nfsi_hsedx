<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { fmtTanggalPanjang } from '@/lib/format';
import { useAppConfigStore } from '@/stores/appConfig';

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
const appConfig = useAppConfigStore();
</script>

<template>
  <div class="cert-wrap">
    <div class="cert">
      <div class="cert-inner">
        <!-- Header -->
        <div class="cert-header">
          <div class="header-left">
            <h1 class="verified-title">VERIFIED</h1>
            <p class="verified-sub">CERTIFICATE OF ACHIEVEMENT</p>
          </div>
          <div class="header-right">
            <!-- Dynamic Logo -->
            <img v-if="appConfig.logoUrl" :src="appConfig.logoUrl" alt="Logo" class="nfsi-logo" />
          </div>
        </div>

        <!-- Body -->
        <div class="cert-body">
          <p class="lead">This is to inform that</p>
          <div class="nama">Mr. / Mrs. / Ms. {{ cert.nama }}</div>
          
          <p class="lead mt-4">has successfully completed the certification course titled</p>
          <div class="kursus">{{ cert.kursus }}</div>
          
          <p class="desc mt-4">
            The participant has fulfilled all the requirements and standards of the course and is hereby
            awarded this certificate as a mark of achievement.
          </p>

          <div class="details">
            <div><strong>Course Duration:</strong> 12 hours</div>
            <div><strong>Date of Completion:</strong> {{ cert.tanggal_terbit ? fmtTanggalPanjang(cert.tanggal_terbit) : 'January 21, 2026' }}</div>
          </div>

          <p class="desc">
            This certificate is issued in recognition of the successful completion of the above-mentioned
            course.
          </p>
        </div>

        <!-- Signature -->
        <div class="signature-section">
          <div class="signature">
            <div class="sig-name">Dr. Chiragkumar Makwana</div>
            <div class="sig-title">Authorised Signature</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="cert-footer">
          <div class="foot-left">
            <span class="brand-hsedx"><span style="color:red">HSE</span><span style="color:navy">d</span><span style="color:goldenrod">x</span></span>
            <span class="foot-text">VERIFIED CERTIFICATE</span>
            <span class="foot-text">VALID CERTIFICATE ID <br> <span class="text-black font-normal">{{ cert.nomor_sertifikat || '—' }}</span></span>
          </div>
          <div class="foot-right">
            Recognized by Directorate of Industrial, Safety &<br>
            Health (DISH), Govt. Of Gujarat
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
  max-width: 1000px;
  aspect-ratio: 1.414 / 1;
  background: url('/img/certificate-bg.jpg') center/cover no-repeat;
  background-color: #fdfdfd;
  box-shadow: 0 10px 40px rgba(0,0,0,0.08);
  font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
  color: #111;
  overflow: hidden;
}
.cert-inner {
  position: absolute;
  inset: 40px;
  display: flex;
  flex-direction: column;
  z-index: 10;
}
.cert::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: var(--bg-watermark, none);
  background-size: 50%;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0.05;
  z-index: 1;
}

/* Header */
.cert-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 30px;
  padding-left: 20px;
}
.verified-title {
  color: #00b050;
  font-size: 46px;
  font-weight: 800;
  letter-spacing: 2px;
  margin: 0;
  line-height: 1;
}
.verified-sub {
  color: #00b050;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  margin: 6px 0 0 2px;
}
.nfsi-logo {
  height: 90px;
  width: auto;
  object-fit: contain;
}

/* Body */
.cert-body {
  padding-left: 20px;
  flex: 1;
}
.lead {
  font-size: 14px;
  color: #333;
  margin: 0 0 10px 0;
}
.mt-4 {
  margin-top: 16px;
}
.nama {
  font-size: 16px;
  font-weight: 700;
  color: #000;
  margin: 0 0 15px 0;
}
.kursus {
  font-size: 22px;
  font-weight: 800;
  color: #000;
  margin: 0 0 15px 0;
}
.desc {
  font-size: 13px;
  color: #333;
  line-height: 1.6;
  margin: 0 0 20px 0;
}
.details {
  font-size: 13px;
  color: #000;
  margin-bottom: 20px;
  line-height: 1.8;
}

/* Signature */
.signature-section {
  display: flex;
  justify-content: flex-end;
  padding-right: 60px;
  margin-bottom: 25px;
}
.signature {
  text-align: center;
}
.sig-name {
  font-weight: 700;
  font-size: 14px;
  color: #000;
}
.sig-title {
  font-size: 12px;
  color: #555;
  margin-top: 4px;
}

/* Footer */
.cert-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 0 20px;
}
.foot-left {
  display: flex;
  align-items: center;
  gap: 30px;
}
.brand-hsedx {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -1px;
}
.foot-text {
  font-size: 10px;
  color: #555;
  font-weight: 700;
  line-height: 1.4;
}
.text-black { color: #000; }
.font-normal { font-weight: 400; }
.foot-right {
  text-align: right;
  font-size: 10px;
  color: #555;
  line-height: 1.5;
}

@media print {
  :global(body *) { visibility: hidden; }
  .cert-wrap, .cert-wrap * { visibility: visible; }
  .cert-wrap { position: absolute; inset: 0; }
  .cert { max-width: none; width: 100%; box-shadow: none; }
  @page { size: A4 landscape; margin: 8mm; }
}
</style>
