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
    'Himaya Prevention Private Limited · CIN: U74999GJ2017PTC096981 · GSTIN: 24AAECH1623D1Z8 · Vadodara, Gujarat, India · info@himpre.com'
  );
});

function fmtIssueDate(dateStr?: string | null): string {
  if (!dateStr) return '16-Oct-2026';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
}
</script>

<template>
  <div class="cert-wrap">
    <div class="cert">
      <div class="cert-inner">
        <!-- TOP HEADER: Organization Logo & Certificate No -->
        <div class="cert-header">
          <div class="cert-logo-wrap">
            <img
              v-if="appConfig.logoUrl"
              :src="appConfig.logoUrl"
              :alt="appConfig.appName || 'Logo'"
              class="cert-logo-img"
            />
            <BrandMark v-else size="lg" />
          </div>
          <div class="cert-meta-no">
            <span class="meta-label">CERTIFICATE NO.</span>
            <span class="meta-val">{{ cert.certificate_number || 'HP-QMS-261016200521' }}</span>
          </div>
        </div>

        <!-- MAIN BODY CONTENT -->
        <div class="cert-main">
          <!-- Course / Subject Title -->
          <h1 class="course-title">{{ localizedCourseTitle || 'ISO 9001:2026 TRANSITION QUIZ' }}</h1>

          <!-- Presentation Subtitle -->
          <p class="presented-to">This certificate is proudly presented to</p>

          <!-- Recipient Name -->
          <h2 class="recipient-name">{{ cert.name || 'Recipient Name' }}</h2>

          <!-- Sub-affiliation -->
          <p class="affiliation-text">{{ cert.instructor || 'Himaya Prevention Private Limited' }}</p>

          <!-- Award Description Citation -->
          <p class="award-description">
            for participating in the <strong class="text-slate-900">{{ localizedCourseTitle || 'Certification Course' }}</strong>,<br />
            and showing commitment to quality culture, risk-based planning and continual improvement.
          </p>
        </div>

        <!-- BOTTOM METADATA: Date | Circular Seal | QR/Score -->
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
                  HIMAYA PREVENTION PRIVATE LIMITED ★
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

          <!-- QR Code or Quiz Score -->
          <div class="meta-block text-right">
            <div v-if="cert.qr_code_url" class="qr-box">
              <img :src="cert.qr_code_url" alt="QR Verification" class="qr-img" />
              <div class="qr-info">
                <span class="meta-sublabel">VERIFIED ONLINE</span>
                <span class="qr-code-id">{{ cert.certificate_number ? cert.certificate_number.slice(-8) : 'VERIFIED' }}</span>
              </div>
            </div>
            <div v-else class="score-box">
              <div class="score-numbers">
                <span class="score-num">{{ cert.score || '18' }}</span>
                <span class="score-max">/ 20</span>
              </div>
              <span class="meta-sublabel">QUIZ SCORE</span>
            </div>
          </div>
        </div>

        <!-- FOOTER: Multi-Color HSE Banner + Legal Disclaimer -->
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
  padding: 30px 40px 18px 21.5%;
  box-sizing: border-box;
}

/* ── HEADER ─────────────────────────────────────────────────── */
.cert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cert-logo-wrap {
  display: flex;
  align-items: center;
  max-width: 250px;
  min-height: 48px;
}

.cert-logo-img {
  max-height: 52px;
  max-width: 220px;
  width: auto;
  object-fit: contain;
}

.cert-meta-no {
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
  font-size: 13.5px;
  font-weight: 700;
  color: #0e1729;
  letter-spacing: 0.03em;
}

/* ── MAIN BODY ──────────────────────────────────────────────── */
.cert-main {
  text-align: center;
  margin: auto 0;
  padding: 6px 0;
}

.course-title {
  font-size: 27px;
  font-weight: 800;
  color: #1b62ae;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.25;
  margin: 0 0 10px 0;
}

.presented-to {
  font-size: 13px;
  color: #475569;
  margin: 0 0 6px 0;
  font-weight: 500;
}

.recipient-name {
  font-family: 'Georgia', serif;
  font-size: 38px;
  font-weight: 700;
  color: #0e1729;
  letter-spacing: 0.01em;
  margin: 0 0 4px 0;
  line-height: 1.15;
}

.affiliation-text {
  font-size: 13px;
  font-weight: 600;
  color: #64738b;
  margin: 0 0 12px 0;
}

.award-description {
  font-size: 12.5px;
  color: #334155;
  line-height: 1.55;
  max-width: 640px;
  margin: 0 auto;
}

/* ── METADATA ROW (Date | Seal | QR/Score) ───────────────────── */
.cert-meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
  margin-bottom: 6px;
}

.meta-block {
  display: flex;
  flex-direction: column;
  min-width: 130px;
}

.meta-date {
  font-size: 14.5px;
  font-weight: 700;
  color: #0e1729;
}

.meta-sublabel {
  font-size: 9.5px;
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
  width: 78px;
  height: 78px;
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.08));
}

.qr-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qr-img {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}

.qr-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.qr-code-id {
  font-size: 11px;
  font-weight: 700;
  color: #1b62ae;
}

.score-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.score-numbers {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.score-num {
  font-size: 18px;
  font-weight: 800;
  color: #0e1729;
}

.score-max {
  font-size: 13px;
  font-weight: 600;
  color: #64738b;
}

/* ── FOOTER ─────────────────────────────────────────────────── */
.cert-footer {
  text-align: center;
  border-top: 1px solid #f1f5f9;
  padding-top: 8px;
}

.hse-bar {
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.15em;
  margin-bottom: 4px;
}

.hse-health { color: #1b62ae; }
.hse-safety { color: #1b62ae; }
.hse-env { color: #61b444; }
.hse-fire { color: #d41d28; }
.hse-quality { color: #9d1a83; }
.hse-sep { color: #cbd5e1; margin: 0 4px; font-weight: normal; }

.disclaimer-text {
  font-size: 8px;
  color: #64738b;
  margin: 0 0 2px 0;
  line-height: 1.35;
}

.company-text {
  font-size: 8px;
  color: #64738b;
  margin: 0 0 2px 0;
  line-height: 1.35;
}

.system-credit {
  font-size: 7.8px;
  color: #94a2b8;
  margin: 0;
}

/* ── PRINT STYLES ───────────────────────────────────────────── */
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
