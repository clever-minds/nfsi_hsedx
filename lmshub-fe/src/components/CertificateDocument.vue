<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getLocalizedText } from '@/lib/course-localization';
import { useAppConfigStore } from '@/stores/appConfig';
import BrandMark from '@/components/ui/BrandMark.vue';

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
  score?: string | number | null;
  company_address?: string | null;
}

const props = defineProps<{ cert: CertData }>();
const { t } = useI18n();
const appConfig = useAppConfigStore();

const localizedCourseTitle = computed(() => {
  return getLocalizedText(props.cert.course);
});

const companyAddress = computed(() => {
  return (
    props.cert.company_address ||
    'National Fire Safety Institute (NFSI) · Shree C.K. Bhagat Patidar Chatralaya, Opp. Old Krishna Cinema, Siddhnath Road, Vadodara - 390001, Gujarat, India · (+91) 90333 88440 · info@nfsi.in · www.nfsi.in'
  );
});

function fmtIssueDate(dateStr?: string | null): string {
  if (!dateStr) {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day}-${months[today.getMonth()]}-${today.getFullYear()}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

const verificationPageUrl = computed(() => {
  if (props.cert.verify_url) return props.cert.verify_url;
  if (props.cert.certificate_number && typeof window !== 'undefined') {
    return `${window.location.origin}/certificates/verify/${encodeURIComponent(props.cert.certificate_number)}`;
  }
  return '';
});

const qrUrl = computed(() => {
  if (props.cert.qr_code_url) return props.cert.qr_code_url;
  if (verificationPageUrl.value) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(verificationPageUrl.value)}`;
  }
  return '';
});

const dynamicContent = computed(() => {
  const courseTitle = localizedCourseTitle.value || props.cert.course || 'Safety Training Course';
  const studentName = props.cert.name || 'Recipient Name';
  const certNumber = props.cert.certificate_number || '';
  const dateStr = fmtIssueDate(props.cert.publish_date);
  const scoreStr = props.cert.score ? `${props.cert.score}%` : '';
  const instructorStr = props.cert.instructor || '';

  if (props.cert.content && props.cert.content.trim()) {
    let text = props.cert.content;
    text = text.replace(/\{\{\s*name\s*\}\}/gi, studentName);
    text = text.replace(/\{\{\s*course\s*\}\}/gi, courseTitle);
    text = text.replace(/\{\{\s*number\s*\}\}/gi, certNumber);
    text = text.replace(/\{\{\s*date\s*\}\}/gi, dateStr);
    text = text.replace(/\{\{\s*score\s*\}\}/gi, scoreStr);
    text = text.replace(/\{\{\s*instructor\s*\}\}/gi, instructorStr);
    return text;
  }

  return `for successfully participating in and completing the <strong class="course-highlight">${courseTitle}</strong>, demonstrating professional knowledge and commitment to workplace health, safety, risk-based planning and continual improvement standards.`;
});
</script>

<template>
  <div class="cert-wrap">
    <div class="cert">
      <div class="cert-inner">
        <!-- TOP HEADER: Centered Organization Logo & Pinned Certificate No -->
        <div class="cert-header">
          <!-- Centered Organization Logo -->
          <div class="cert-logo-center">
            <img
              v-if="appConfig.logoUrl"
              :src="appConfig.logoUrl"
              :alt="appConfig.appName || 'Logo'"
              class="cert-logo-img"
            />
            <BrandMark v-else size="lg" />
          </div>

          <!-- Top-Right Certificate Number -->
          <div class="cert-meta-no">
            <span class="meta-label">CERTIFICATE NO.</span>
            <span class="meta-val">{{ cert.certificate_number || 'NFSI-CERTIFICATE' }}</span>
          </div>
        </div>

        <!-- MAIN BODY CONTENT: Beautiful Centered Alignment -->
        <div class="cert-main">
          <!-- Course / Subject Title -->
          <h1 class="course-title">{{ localizedCourseTitle || 'CERTIFICATE OF ACHIEVEMENT' }}</h1>

          <!-- Presentation Subtitle with decorative accent lines -->
          <div class="presentation-divider">
            <span class="divider-line"></span>
            <span class="presented-to">THIS CERTIFICATE IS PROUDLY PRESENTED TO</span>
            <span class="divider-line"></span>
          </div>

          <!-- Recipient Name with dynamic underline -->
          <div class="recipient-wrap">
            <h2 class="recipient-name">{{ cert.name || 'Recipient Name' }}</h2>
            <div class="recipient-underline"></div>
          </div>

          <!-- Dynamic Award Description Citation -->
          <div class="award-description" v-html="dynamicContent"></div>
        </div>

        <!-- BOTTOM METADATA: Date | Circular Seal | QR Code & Score -->
        <div class="cert-meta-row">
          <!-- Date of Issue -->
          <div class="meta-block text-left">
            <span class="meta-date">{{ fmtIssueDate(cert.publish_date) }}</span>
            <span class="meta-sublabel">DATE OF ISSUE</span>
          </div>

          <!-- Official Circular Seal -->
          <div class="meta-seal">
            <svg class="seal-svg" viewBox="0 0 160 160">
              <defs>
                <path id="sealCircle" d="M 80, 80 m -61, 0 a 61,61 0 1,1 122,0 a 61,61 0 1,1 -122,0" />
              </defs>
              <!-- Outer decorative rings -->
              <circle cx="80" cy="80" r="77" fill="#f8fafc" stroke="#12345b" stroke-width="2.5" />
              <circle cx="80" cy="80" r="72" fill="none" stroke="#29a7df" stroke-width="1.2" stroke-dasharray="2.5 2.5" />
              <circle cx="80" cy="80" r="51" fill="#ffffff" stroke="#12345b" stroke-width="1.5" />

              <!-- Circular text -->
              <text font-size="8.8" font-family="'Arial', sans-serif" font-weight="bold" fill="#12345b" letter-spacing="1">
                <textPath href="#sealCircle" startOffset="50%" text-anchor="middle">
                  NATIONAL FIRE SAFETY INSTITUTE · NFSI ★
                </textPath>
              </text>

              <!-- Seal Center Icon & Mottos -->
              <polygon points="80,57 82.5,64 90,64 84,68.5 86,75.5 80,71 74,75.5 76,68.5 70,64 77.5,64" fill="#f59e0b" />
              <text x="80" y="88" font-size="7.8" font-family="'Arial', sans-serif" font-weight="bold" fill="#12345b" text-anchor="middle" letter-spacing="1.5">
                PLAN · DO
              </text>
              <text x="80" y="100" font-size="7.8" font-family="'Arial', sans-serif" font-weight="bold" fill="#12345b" text-anchor="middle" letter-spacing="1.5">
                CHECK · ACT
              </text>
            </svg>
          </div>

          <!-- Verification QR Code and Score -->
          <div class="meta-block text-right">
            <div v-if="qrUrl" class="qr-box">
              <img :src="qrUrl" alt="QR Verification" class="qr-img" />
              <div class="qr-info">
                <span class="meta-sublabel">VERIFIED ONLINE</span>
                <span class="qr-code-id">{{ cert.certificate_number ? cert.certificate_number.slice(-10) : (cert.verification_code || 'VERIFIED') }}</span>
                <span v-if="cert.score" class="score-chip">Score: {{ cert.score }}%</span>
              </div>
            </div>
            <div v-else-if="cert.score" class="score-box">
              <div class="score-numbers">
                <span class="score-num">{{ cert.score }}</span>
                <span class="score-max">%</span>
              </div>
              <span class="meta-sublabel">FINAL SCORE</span>
            </div>
            <div v-else class="qr-info">
              <span class="meta-sublabel">VERIFIED ONLINE</span>
              <span class="qr-code-id">{{ cert.certificate_number || 'VERIFIED' }}</span>
            </div>
          </div>
        </div>

        <!-- FOOTER: Multi-Color HSE Banner + Legal Disclaimer + Accreditation -->
        <div class="cert-footer">
          <!-- Categories Bar -->
          <div class="hse-bar">
            <span class="hse-health">H E A L T H</span>
            <span class="hse-sep">|</span>
            <span class="hse-safety">S A F E T Y</span>
            <span class="hse-sep">|</span>
            <span class="hse-env">E N V I R O N M E N T</span>
            <span class="hse-sep">|</span>
            <span class="hse-fire">F I R E</span>
            <span class="hse-sep">|</span>
            <span class="hse-quality">Q U A L I T Y</span>
          </div>

          <!-- Disclaimer Statement -->
          <p class="disclaimer-text">
            Awareness and participation only — not an authorization to work, evidence of competence, a training certificate or a qualification.
          </p>

          <!-- Company Details -->
          <p class="company-text">
            {{ companyAddress }}
          </p>

          <!-- System Credit -->
          <p class="system-credit">
            Certificate system designed &amp; automated by <span class="font-bold text-slate-800">hsefq.com</span>
          </p>
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
  padding: 1rem 0;
  background-color: transparent;
}

.cert {
  position: relative;
  width: 100%;
  max-width: 1020px;
  aspect-ratio: 1.414 / 1;
  background: url('/img/certificate-bg.jpg') center/cover no-repeat;
  background-color: #ffffff;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  overflow: hidden;
  font-family: 'Arial', 'Segoe UI', Helvetica, sans-serif;
  color: #0e1729;
}

.cert-inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  /* Left ribbon is ~18.2% of the width, so padding-left is 21.5% to clear it cleanly */
  padding: 24px 36px 16px 21.5%;
  box-sizing: border-box;
}

/* ── HEADER (Logo in Center, Certificate No in Top-Right) ─── */
.cert-header {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 52px;
}

.cert-logo-center {
  display: flex;
  justify-content: center;
  align-items: center;
  max-width: 260px;
  margin: 0 auto;
}

.cert-logo-img {
  max-height: 52px;
  max-width: 230px;
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.08));
}

.cert-meta-no {
  position: absolute;
  right: 0;
  top: 2px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.meta-label {
  font-size: 9.5px;
  font-weight: 700;
  color: #64738b;
  letter-spacing: 0.12em;
  margin-bottom: 2px;
}

.meta-val {
  font-size: 13px;
  font-weight: 700;
  color: #0e1729;
  letter-spacing: 0.03em;
}

/* ── MAIN BODY (Centered, Prestigious Typography) ────────── */
.cert-main {
  text-align: center;
  margin: auto 0;
  padding: 2px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.course-title {
  font-size: 23px;
  font-weight: 800;
  color: #1b62ae;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.25;
  margin: 0 0 8px 0;
  max-width: 640px;
}

.presentation-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 500px;
  margin-bottom: 6px;
}

.divider-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, #cbd5e1, transparent);
}

.presented-to {
  font-size: 10px;
  color: #64748b;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.recipient-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  margin: 0 auto 8px auto;
}

.recipient-name {
  font-family: 'Playfair Display', 'Georgia', serif;
  font-size: 35px;
  font-weight: 700;
  color: #0e1729;
  letter-spacing: 0.02em;
  line-height: 1.15;
  margin: 0;
}

.recipient-underline {
  width: 85%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #1b62ae, transparent);
  margin-top: 4px;
  border-radius: 2px;
}

.award-description {
  font-size: 12px;
  color: #334155;
  line-height: 1.55;
  max-width: 630px;
  margin: 0 auto;
}

:deep(.course-highlight) {
  color: #0f172a;
  font-weight: 700;
}

/* ── METADATA ROW (Date | Seal | QR/Score) ───────────────── */
.cert-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px;
  margin-bottom: 6px;
}

.meta-block {
  display: flex;
  flex-direction: column;
  min-width: 140px;
}

.meta-date {
  font-size: 14px;
  font-weight: 700;
  color: #0e1729;
}

.meta-sublabel {
  font-size: 9px;
  font-weight: 700;
  color: #64738b;
  letter-spacing: 0.12em;
  margin-top: 2px;
}

.meta-seal {
  display: flex;
  justify-content: center;
  align-items: center;
}

.seal-svg {
  width: 76px;
  height: 76px;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.08));
}

.qr-box {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.qr-img {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
}

.qr-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.qr-code-id {
  font-size: 10.5px;
  font-weight: 700;
  color: #1b62ae;
}

.score-chip {
  display: inline-block;
  font-size: 9.5px;
  font-weight: 700;
  color: #047857;
  background-color: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 1px 6px;
  border-radius: 9999px;
  margin-top: 2px;
}

.score-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.score-numbers {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.score-num {
  font-size: 18px;
  font-weight: 800;
  color: #0e1729;
}

.score-max {
  font-size: 12px;
  font-weight: 700;
  color: #64738b;
}

/* ── FOOTER ─────────────────────────────────────────────── */
.cert-footer {
  text-align: center;
  border-top: 1px solid #f1f5f9;
  padding-top: 6px;
}

.hse-bar {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.15em;
  margin-bottom: 3px;
}

.hse-health { color: #1b62ae; }
.hse-safety { color: #1b62ae; }
.hse-env { color: #61b444; }
.hse-fire { color: #d41d28; }
.hse-quality { color: #9d1a83; }
.hse-sep { color: #cbd5e1; margin: 0 4px; font-weight: normal; }

.disclaimer-text {
  font-size: 7.8px;
  color: #64738b;
  margin: 0 0 2px 0;
  line-height: 1.3;
}

.company-text {
  font-size: 7.8px;
  color: #64738b;
  margin: 0 0 2px 0;
  line-height: 1.3;
}

.system-credit {
  font-size: 7.5px;
  color: #94a2b8;
  margin: 0;
}

/* ── PRINT STYLES ───────────────────────────────────────── */
@media print {
  :global(body *) {
    visibility: hidden;
  }
  .cert-wrap,
  .cert-wrap * {
    visibility: visible;
  }
  .cert-wrap {
    position: fixed;
    inset: 0;
    margin: 0;
    padding: 0;
    background: none;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .cert {
    max-width: 100%;
    width: 100vw;
    height: 100vh;
    box-shadow: none;
    border-radius: 0;
    page-break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page {
    size: A4 landscape;
    margin: 0;
  }
}
</style>
