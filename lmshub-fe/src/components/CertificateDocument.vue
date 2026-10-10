<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmtTanggalPanjang } from '@/lib/format';
import { useAppConfigStore } from '@/stores/appConfig';

export interface CertData {
  name: string;
  course: string;
  instructor?: string | null;
  certificate_number?: string | null;
  verification_code?: string | null;
  qr_code_url?: string | null;
  publish_date?: string | null;
  verify_url?: string | null;
  content?: string | null;
}
const props = defineProps<{ cert: CertData }>();

const { t } = useI18n();
const appConfig = useAppConfigStore();

const parsedContent = computed(() => {
  if (!props.cert.content) return '';
  return props.cert.content
    .replace(/\{\{?name\}\}?/g, props.cert.name || '')
    .replace(/\{\{?title\}\}?/g, props.cert.course || '')
    .replace(/\{\{?duration\}\}?/g, '12 hours')
    .replace(/\{\{?date\}\}?/g, props.cert.publish_date ? fmtTanggalPanjang(props.cert.publish_date) : 'January 21, 2026')
    .replace(/\{\{?number\}\}?/g, props.cert.certificate_number || '—');
});
</script>

<template>
  <div class="cert-wrap">
    <div class="cert">
      <div class="cert-inner">
        <!-- Body Content -->
        <div class="cert-body">
          <template v-if="cert.content">
            <div v-html="parsedContent" class="prose max-w-none text-[#333]"></div>
          </template>
          <template v-else>
            <p class="lead">This is to inform that</p>
            <div class="name">Mr. / Mrs. / Ms. {{ cert.name }}</div>
            
            <p class="lead mt-4">has successfully completed the certification course titled</p>
            <div class="course">{{ cert.course }}</div>
            
            <p class="desc mt-4">
              The participant has fulfilled all the requirements and standards of the course and is hereby
              awarded this certificate as a mark of achievement.
            </p>
  
            <div class="details">
              <div><strong>Course Duration:</strong> 12 hours</div>
              <div><strong>Date of Completion:</strong> {{ cert.publish_date ? fmtTanggalPanjang(cert.publish_date) : 'January 21, 2026' }}</div>
            </div>
  
            <p class="desc">
              This certificate is issued in recognition of the successful completion of the above-mentioned
              course.
            </p>
          </template>
        </div>

        <!-- QR Code -->
        <div v-if="cert.qr_code_url || cert.verify_url" class="cert-qr">
          <img v-if="cert.qr_code_url" :src="cert.qr_code_url" alt="QR Code" />
          <vue-qrcode v-else-if="cert.verify_url" :value="cert.verify_url" :options="{ width: 70 }" />
        </div>

        <!-- Footer Overlay -->
        <div class="cert-footer-overlay">
          <!-- Left: Date -->
          <div class="cert-footer-col col-left">
            <div class="cert-footer-label">VERIFIED CERTIFICATE</div>
            <div class="cert-footer-value">Issued {{ cert.publish_date ? fmtTanggalPanjang(cert.publish_date) : 'Jan 2, 2026' }}</div>
          </div>

          <!-- Center: ID -->
          <div class="cert-footer-col col-center">
            <div class="cert-footer-label">VALID CERTIFICATE ID</div>
            <div class="cert-footer-value id-value">{{ cert.certificate_number || '—' }}</div>
          </div>

          <!-- Right: Signature -->
          <div class="cert-footer-col col-right">
            <div class="cert-signature-placeholder"></div>
            <div class="cert-footer-value">{{ cert.instructor || 'Sir J.P Patel' }}</div>
            <div class="cert-footer-desc">
              Founder & Professor of<br />
              Nationa Fire & Safety Institute, Vadodara
            </div>
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
  background: url('/img/design-4.jpg') center/cover no-repeat;
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
.name {
  font-size: 18px;
  font-weight: 700;
  color: #000;
  margin: 0 0 15px 0;
}
.course {
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
/* Footer Overlay covers the bottom part of the certificate */
.cert-footer-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 150px;
}

.cert-footer-col {
  position: absolute;
  display: flex;
  flex-direction: column;
}

.col-left {
  left: 220px; /* Shifted to the right of the logo */
  bottom: 35px; /* Aligned vertically with the bottom of the logo */
  align-items: flex-start;
  text-align: left;
}

.col-center {
  left: 450px; /* Shifted further right to balance */
  bottom: 35px; /* Same horizontal baseline */
  align-items: flex-start;
  text-align: left;
}

.col-right {
  right: 60px;
  bottom: 35px; /* Same horizontal baseline */
  align-items: center;
  text-align: center; /* Center-aligned as per the reference image */
}

.cert-footer-label {
  font-size: 11px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.cert-footer-value {
  font-size: 13px;
  font-weight: 700;
  color: #111;
}

.id-value {
  color: #3b82f6; /* Blue color for ID */
}

.cert-signature-img,
.cert-signature-placeholder {
  height: 60px;
  object-fit: contain;
  margin-bottom: 5px;
}

.cert-footer-desc {
  font-size: 12px;
  font-weight: 500;
  color: #111;
  line-height: 1.4;
  margin-top: 2px;
}

/* QR Code */
.cert-qr {
  position: absolute;
  bottom: 160px; /* Above the new footer overlay */
  right: 60px;
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
