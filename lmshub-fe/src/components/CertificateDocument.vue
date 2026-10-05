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
        <!-- Body Content -->
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

        <!-- Certificate ID placed at the bottom center/left where the background says VALID CERTIFICATE ID -->
        <div class="cert-id">
          {{ cert.nomor_sertifikat || '—' }}
        </div>

        <!-- QR Code -->
        <div v-if="cert.qr_code_url || cert.verify_url" class="cert-qr">
          <img v-if="cert.qr_code_url" :src="cert.qr_code_url" alt="QR Code" />
          <vue-qrcode v-else-if="cert.verify_url" :value="cert.verify_url" :options="{ width: 70 }" />
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
  inset: 0;
  display: flex;
  flex-direction: column;
  z-index: 10;
}

/* Body */
.cert-body {
  padding-left: 60px; /* Aligned with the 'V' of VERIFIED */
  padding-top: 200px; /* Pushed down below the VERIFIED header */
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
  font-size: 18px;
  font-weight: 700;
  color: #000;
  margin: 0 0 15px 0;
}
.kursus {
  font-size: 24px;
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

/* ID at bottom */
.cert-id {
  position: absolute;
  bottom: 53px;
  left: 450px;
  font-size: 11px;
  font-weight: 700;
  color: #3b82f6; /* matching the blue color */
  background-color: #fff; /* covers the dummy text from background */
  padding: 0 4px;
}

/* QR Code */
.cert-qr {
  position: absolute;
  bottom: 30px;
  left: 200px; /* Placing it between logo and the VERIFIED CERTIFICATE text */
}
.cert-qr img,
.cert-qr canvas {
  width: 70px;
  height: 70px;
  object-fit: contain;
}

@media print {
  :global(body *) { visibility: hidden; }
  .cert-wrap, .cert-wrap * { visibility: visible; }
  .cert-wrap { position: absolute; inset: 0; }
  .cert { max-width: none; width: 100%; box-shadow: none; }
  @page { size: A4 landscape; margin: 8mm; }
}
</style>
