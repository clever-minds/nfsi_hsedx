<script setup lang="ts">
import { computed, onMounted } from 'vue';
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
  duration?: string | null;
  company_address?: string | null;
}

const props = defineProps<{ cert: CertData }>();
const { t } = useI18n();
const appConfig = useAppConfigStore();

onMounted(() => {
  if (!appConfig.ready) {
    appConfig.bootstrap();
  }
});

const localizedCourseTitle = computed(() => {
  return getLocalizedText(props.cert.course);
});

const displayScore = computed(() => {
  if (props.cert.score !== null && props.cert.score !== undefined && String(props.cert.score).trim() !== '') {
    return String(props.cert.score);
  }
  return '18';
});

const scoreDenominator = computed(() => {
  const num = Number(displayScore.value);
  if (!isNaN(num) && num <= 20) {
    return '20';
  }
  return '100';
});

const displayDuration = computed(() => {
  if (props.cert.duration && props.cert.duration.trim()) {
    return props.cert.duration;
  }
  return '12 hours';
});

const displayAffiliation = computed(() => {
  const ins = props.cert.instructor;
  if (!ins || /rina|wijaya/i.test(ins)) {
    return 'National Fire Safety Institute (NFSI)';
  }
  return ins;
});

const companyAddress = computed(() => {
  return (
    props.cert.company_address ||
    'National Fire Safety Institute (NFSI) · Shree C.K. Bhagat Patidar Chatralaya, Opp. Old Krishna Cinema, Siddhnath Road, Vadodara - 390001, Gujarat, India · (+91) 90333 88440 · info@nfsi.in · www.nfsi.in'
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

function replaceAllTokens(rawText: string): string {
  if (!rawText) return '';
  const courseTitle = localizedCourseTitle.value || props.cert.course || 'Chemical Safety Awareness Course';
  const studentName = props.cert.name || 'Recipient Name';
  const certNumber = props.cert.certificate_number || 'HP-QMS-261016200521';
  const dateStr = fmtIssueDate(props.cert.publish_date);
  const durationStr = displayDuration.value;
  const scoreStr = `${displayScore.value} / ${scoreDenominator.value}`;
  const instructorStr = displayAffiliation.value;

  let text = rawText;

  // Replace {name}, {{name}}, :name, [name]
  text = text.replace(/(\{1,2}|\[|:)\s*name\s*(\}{1,2}|\])?/gi, studentName);

  // Replace {title}, {{title}}, {course}, {{course}}, :title, [title], [course]
  text = text.replace(/(\{1,2}|\[|:)\s*(title|course)\s*(\}{1,2}|\])?/gi, courseTitle);

  // Replace {duration}, {{duration}}, :duration, [duration]
  text = text.replace(/(\{1,2}|\[|:)\s*duration\s*(\}{1,2}|\])?/gi, durationStr);

  // Replace {date}, {{date}}, {publish_date}, {{publish_date}}, [date], :date
  text = text.replace(/(\{1,2}|\[|:)\s*(date|publish_date|completion_date)\s*(\}{1,2}|\])?/gi, dateStr);

  // Replace {number}, {{number}}, {certificate_number}, {{certificate_number}}, [number], :number
  text = text.replace(/(\{1,2}|\[|:)\s*(number|certificate_number|cert_number)\s*(\}{1,2}|\])?/gi, certNumber);

  // Replace {score}, {{score}}, [score], :score
  text = text.replace(/(\{1,2}|\[|:)\s*score\s*(\}{1,2}|\])?/gi, scoreStr);

  // Replace {instructor}, {{instructor}}, [instructor], :instructor
  text = text.replace(/(\{1,2}|\[|:)\s*(instructor|signatory)\s*(\}{1,2}|\])?/gi, instructorStr);

  return text;
}

const formattedCustomContent = computed(() => {
  if (!props.cert.content || !props.cert.content.trim()) return '';
  const parsed = replaceAllTokens(props.cert.content);
  // If plain text (no HTML tags), convert newlines to <br />
  if (!/<[a-z][\s\S]*>/i.test(parsed)) {
    return parsed.replace(/\n\n/g, '<br /><br />').replace(/\n/g, '<br />');
  }
  return parsed;
});
</script>

<template>
  <div class="cert-wrap">
    <div class="cert">
      <!-- CENTER WATERMARK IMAGE: Clearly visible official NFSI emblem -->
      <div class="cert-watermark" aria-hidden="true">
        <img
          src="/img/nfsi-seal-watermark.png"
          alt="NFSI Official Emblem Watermark"
          class="watermark-img"
        />
      </div>

      <div class="cert-inner">
        <!-- TOP HEADER: Organization & Tagline on Left, Certificate No on Right -->
        <div class="cert-header">
          <div class="cert-org">
            <img
              v-if="appConfig.logoUrl"
              :src="appConfig.logoUrl"
              :alt="appConfig.appName || 'Logo'"
              class="cert-logo-img"
            />
            <template v-else>
              <h2 class="org-name">National Fire Safety Institute</h2>
              <p class="org-tagline">W E &nbsp; M A K E &nbsp; W O R K P L A C E &nbsp; S A F E R</p>
            </template>
          </div>

          <div class="cert-meta-no">
            <span class="meta-label">CERTIFICATE NO.</span>
            <span class="meta-val">{{ cert.certificate_number || 'HP-QMS-261016200521' }}</span>
          </div>
        </div>

        <!-- MAIN BODY CONTENT: Exactly as in CERTI-HP-QMS-261016200521 -->
        <div class="cert-main">
          <!-- Course / Subject Title -->
          <h1 class="course-title">{{ localizedCourseTitle || 'Chemical Safety Awareness Course' }}</h1>

          <!-- Presentation Subtitle -->
          <p class="presented-to">This certificate is proudly presented to</p>

          <!-- Recipient Name -->
          <h2 class="recipient-name">{{ cert.name || 'Recipient Name' }}</h2>

          <!-- Sub-affiliation -->
          <p class="affiliation-text">{{ displayAffiliation }}</p>

          <!-- Award Description Citation -->
          <div v-if="formattedCustomContent" class="award-description" v-html="formattedCustomContent"></div>
          <p v-else class="award-description">
            for participating in the <strong class="text-slate-900">{{ localizedCourseTitle || 'Chemical Safety Awareness Course' }}</strong>,<br />
            and showing commitment to quality culture, risk-based planning and continual improvement.
          </p>
        </div>

        <!-- BOTTOM METADATA: Date | Circular Seal | Score & QR Code -->
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

          <!-- QR Code and Score Box -->
          <div class="meta-block meta-right-group">
            <div class="score-box">
              <div class="score-numbers">
                <span class="score-num">{{ displayScore }}</span>
                <span class="score-max">/ {{ scoreDenominator }}</span>
              </div>
              <span class="meta-sublabel">QUIZ SCORE</span>
            </div>

            <!-- Verification QR Code -->
            <div v-if="qrUrl" class="qr-box">
              <img :src="qrUrl" alt="QR Verification" class="qr-img" />
              <div class="qr-info">
                <span class="meta-sublabel">VERIFIED ONLINE</span>
                <span class="qr-code-id">{{ cert.certificate_number ? cert.certificate_number.slice(-8) : 'VERIFIED' }}</span>
              </div>
            </div>
            <div v-else class="qr-info">
              <span class="meta-sublabel">VERIFIED ONLINE</span>
              <span class="qr-code-id">{{ cert.certificate_number || 'VERIFIED' }}</span>
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

/* ── CENTER WATERMARK IMAGE ─────────────────────────────── */
.cert-watermark {
  position: absolute;
  top: 50%;
  left: 59%;
  transform: translate(-50%, -50%);
  width: 380px;
  height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
  opacity: 0.18; /* Clearly visible official NFSI emblem watermark! */
  user-select: none;
}

.watermark-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.cert-inner {
  position: relative;
  inset: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  /* Left ribbon is ~18.2% of the width, so padding-left is 21.5% to clear it cleanly */
  padding: 30px 40px 18px 21.5%;
  box-sizing: border-box;
  z-index: 5;
}

/* ── HEADER ─────────────────────────────────────────────────── */
.cert-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2px;
}

.cert-org {
  display: flex;
  flex-direction: column;
}

.cert-logo-img {
  max-height: 48px;
  max-width: 220px;
  width: auto;
  object-fit: contain;
}

.org-name {
  font-family: 'Georgia', serif;
  font-size: 24px;
  font-weight: 700;
  color: #0e1729;
  letter-spacing: -0.01em;
  margin: 0;
  line-height: 1.1;
}

.org-tagline {
  font-size: 9.5px;
  font-weight: 700;
  color: #64738b;
  letter-spacing: 0.18em;
  margin: 3px 0 0 0;
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
  padding: 4px 0;
}

.course-title {
  font-size: 26px;
  font-weight: 800;
  color: #1b62ae;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.25;
  margin: 0 0 8px 0;
}

.presented-to {
  font-size: 13px;
  color: #475569;
  margin: 0 0 4px 0;
  font-weight: 500;
}

.recipient-name {
  font-family: 'Georgia', serif;
  font-size: 38px;
  font-weight: 700;
  color: #0e1729;
  letter-spacing: 0.01em;
  margin: 0 0 2px 0;
  line-height: 1.15;
}

.affiliation-text {
  font-size: 13px;
  font-weight: 600;
  color: #64738b;
  margin: 0 0 8px 0;
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

.meta-right-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  min-width: 180px;
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
  background: #ffffff;
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
  .cert-watermark {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page {
    size: A4 landscape;
    margin: 0;
  }
}
</style>
