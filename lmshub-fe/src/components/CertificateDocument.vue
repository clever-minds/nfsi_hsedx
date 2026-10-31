<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import DOMPurify from 'dompurify';
// @ts-ignore
import QRCode from '@/lib/qrcode-bundle.js';
import { getLocalizedText } from '@/lib/course-localization';

export interface CertData {
  name: string;
  course: string;
  instructor?: string | null;
  certificate_number?: string | null;
  verification_code?: string | null;
  qr_code_url?: string | null;
  publish_date?: string | null;
  verify_url?: string | null;
  duration?: string | null;
  content?: string | null;
  score?: string | number | null;
}

const props = defineProps<{ cert: CertData }>();

const localizedCourseTitle = computed(() => {
  return getLocalizedText(props.cert.course);
});

const displayDuration = computed(() => {
  if (props.cert.duration && props.cert.duration.trim()) {
    return props.cert.duration;
  }
  return '12 hours';
});

const displayInstructor = computed(() => {
  if (props.cert.instructor && props.cert.instructor.trim() && !/rina|wijaya/i.test(props.cert.instructor)) {
    return props.cert.instructor;
  }
  return 'Dr. Chiragkumar Makwana';
});

function fmtIssueDate(dateStr?: string | null): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[validDate.getMonth()]} ${validDate.getDate()}, ${validDate.getFullYear()}`;
}

const verificationPageUrl = computed(() => {
  if (props.cert.verify_url) return props.cert.verify_url;
  if (props.cert.certificate_number && typeof window !== 'undefined') {
    return `${window.location.origin}/certificates/${encodeURIComponent(props.cert.certificate_number)}`;
  }
  return '';
});

const localQrDataUrl = ref<string>('');

async function generateQrCode() {
  const url = verificationPageUrl.value;
  if (!url) {
    localQrDataUrl.value = '';
    return;
  }
  try {
    localQrDataUrl.value = await QRCode.toDataURL(url, {
      margin: 1,
      width: 140,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });
  } catch (e) {
    console.error('Failed to generate local QR code:', e);
  }
}

watch(verificationPageUrl, () => {
  generateQrCode();
}, { immediate: true });

onMounted(() => {
  generateQrCode();
});

const qrUrl = computed(() => {
  if (localQrDataUrl.value) return localQrDataUrl.value;
  if (props.cert.qr_code_url && !props.cert.qr_code_url.startsWith('data:image/png;base64,iVBORw0KGgo')) {
    return props.cert.qr_code_url;
  }
  return '';
});

function replaceAllTokens(rawText: string): string {
  if (!rawText) return '';
  const courseTitle = localizedCourseTitle.value || props.cert.course || 'Safety Title Course';
  const studentName = props.cert.name || 'Parth Soni';
  const certNumber = props.cert.certificate_number || 'CERT-13-H0T92K';
  const dateStr = fmtIssueDate(props.cert.publish_date);
  const durationStr = displayDuration.value;
  const scoreStr = props.cert.score ? String(props.cert.score) : '100';
  const instructorStr = displayInstructor.value;

  let text = rawText;

  // Replace {name}, {{name}}, :name, [name], {student_name}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(name|student_name)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-name">${studentName}</strong>`);

  // Replace {title}, {{title}}, {course}, {{course}}, :title, [title], [course]
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(title|course|course_title|course_name)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-course">${courseTitle}</strong>`);

  // Replace {duration}, {{duration}}, :duration, [duration]
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(duration|course_duration)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${durationStr}</strong>`);

  // Replace {date}, {{date}}, {publish_date}, [date], :date
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(date|publish_date|completion_date|issue_date)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${dateStr}</strong>`);

  // Replace {certificate_code}, {number}, {{number}}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(certificate_code|number|certificate_number|cert_number)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${certNumber}</strong>`);

  // Replace {score}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*score\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${scoreStr}</strong>`);

  // Replace {instructor}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(instructor|signatory|instructor_name)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${instructorStr}</strong>`);

  return text;
}

const formattedCustomContent = computed(() => {
  if (!props.cert.content || !props.cert.content.trim()) return '';
  const parsed = replaceAllTokens(props.cert.content);
  let html = parsed;
  if (!/<[a-z][\s\S]*>/i.test(parsed)) {
    html = parsed
      .replace(/\r\n/g, '\n')
      .split(/\n\n+/)
      .map(p => `<p>${p.replace(/\n/g, '<br />')}</p>`)
      .join('');
  }

  // Normalize separate <p> tags so consecutive lines match design-4
  html = html
    .replace(/<\/p>\s*<p>\s*(has successfully completed)/gi, '<br />$1')
    .replace(/<\/p>\s*<p>\s*(<strong>Date of Completion:<\/strong>|Date of Completion:)/gi, '<br />$1');

  return DOMPurify.sanitize(html);
});
</script>

<template>
  <div class="cert-outer-wrapper">
    <div class="certificate" id="printable-certificate">
      <!-- 1. TOP-LEFT: GREEN VERIFIED HEADINGS -->
      <div class="verified">
        VERIFIED
        <span>CERTIFICATE OF ACHIEVEMENT</span>
      </div>

      <!-- 2. MAIN BODY CONTENT (LEFT SIDE) -->
      <div class="left-content">
        <!-- If dynamic template content is configured, display it with all shortcodes parsed -->
        <div v-if="formattedCustomContent" class="cert-dynamic-content" v-html="formattedCustomContent"></div>

        <!-- Default structured layout matching design-4 image -->
        <template v-else>
          <p class="cert-intro">This is to inform that</p>
          
          <p class="cert-student-name">
            Mr. / Mrs. / Ms. <strong>{{ cert.name || 'Parth Soni' }}</strong><br />
            has successfully completed the certification course titled
          </p>

          <p class="cert-course-title">
            <strong>{{ localizedCourseTitle || cert.course || 'Safety Title Course' }}</strong>
          </p>

          <p class="cert-standards-text">
            The participant has fulfilled all the requirements and standards of the course and is hereby awarded this certificate as a mark of achievement.
          </p>

          <p class="cert-meta-info">
            <strong>Course Duration:</strong> {{ displayDuration }}<br />
            <strong>Date of Completion:</strong> {{ fmtIssueDate(cert.publish_date) }}
          </p>

          <p class="cert-recognition-closing">
            This certificate is issued in recognition of the successful completion of the above-mentioned course.
          </p>
        </template>
      </div>

      <!-- 3. RIGHT SIDE: SCANNABLE QR CODE -->
      <div class="right-content">
        <a :href="verificationPageUrl" target="_blank" class="qr-action-link" title="Click or Scan to Verify Certificate">
          <img v-if="qrUrl" :src="qrUrl" alt="Verification QR Code" class="qr-image" />
          <div class="qr-scan-badge">
            <span class="qr-scan-text">SCAN TO VERIFY</span>
          </div>
        </a>
      </div>

      <!-- 4. BOTTOM-RIGHT: AUTHORISED SIGNATURE -->
      <div class="signature-section">
        <div class="sig-name">{{ displayInstructor }}</div>
        <div class="sig-title">Authorised Signature</div>
      </div>

      <!-- 5. BOTTOM BAR: FOOTER METADATA & RECOGNITION -->
      <div class="bottom-bar">
        <div class="bottom-left">
          <span class="cert-badge-text">VERIFIED CERTIFICATE</span>
          <div class="cert-id-group">
            <span class="cert-id-label">VALID CERTIFICATE ID</span>
            <span class="cert-id-val">{{ cert.certificate_number || 'CERT-13-H0T92K' }}</span>
          </div>
        </div>
        <div class="bottom-right">
          <span>Recognized by Directorate of Industrial, Safety & Health (DISH), Govt. Of Gujarat</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Outer display container with smooth scroll for mobile responsiveness */
.cert-outer-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 1.5rem 0;
  overflow-x: auto;
  background-color: transparent;
}

/* Certificate container matching original 1100px x 620px (1.77:1 aspect ratio) */
.certificate {
  position: relative;
  width: 1100px;
  min-width: 1100px;
  height: 620px;
  min-height: 620px;
  background-image: url('/img/design-4.jpg');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: #ffffff;
  padding: 40px 50px;
  box-sizing: border-box;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  color: #000000;
  border-radius: 4px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  user-select: text;
  -webkit-font-smoothing: antialiased;
}

/* ── 1. TOP-LEFT GREEN HEADINGS ─────────────────────────────────────── */
.verified {
  color: #29c531;
  font-size: 48px;
  font-weight: 700;
  letter-spacing: 2px;
  line-height: 1;
  margin: 0;
}

.verified span {
  display: block;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  color: #29c531;
  margin-top: 5px;
}

/* ── 2. MAIN BODY (LEFT SIDE) ───────────────────────────────────────── */
.left-content {
  width: 58%;
  max-width: 560px;
  margin-top: 28px;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  color: #000000;
}

/* Dynamic content parsed from template */
.cert-dynamic-content {
  font-size: 13.5px;
  line-height: 1.45;
  color: #000000;
}

.cert-dynamic-content :deep(p) {
  margin: 0 0 14px 0;
  line-height: 1.45;
  color: #000000;
}

.cert-dynamic-content :deep(p:last-child) {
  margin-bottom: 0;
}

.cert-dynamic-content :deep(.cert-dyn-name) {
  font-size: 13.5px;
  font-weight: 700;
  color: #000000;
}

.cert-dynamic-content :deep(.cert-dyn-course),
.cert-dynamic-content :deep(.cert-course-title) {
  font-size: 19px;
  font-weight: 700;
  color: #000000;
  display: block;
  margin: 10px 0 14px 0;
  line-height: 1.3;
}

.cert-dynamic-content :deep(.cert-dyn-meta) {
  font-weight: 700;
  color: #000000;
}

/* Default structured fallback (identical styling and gaps) */
.cert-intro {
  font-size: 13.5px;
  color: #000000;
  margin: 0 0 14px 0;
  line-height: 1.45;
}

.cert-student-name {
  font-size: 13.5px;
  color: #000000;
  line-height: 1.45;
  margin: 0 0 14px 0;
}

.cert-student-name strong {
  font-size: 13.5px;
  font-weight: 700;
  color: #000000;
}

.cert-course-title {
  margin: 10px 0 14px 0;
}

.cert-course-title strong {
  font-size: 19px;
  font-weight: 700;
  color: #000000;
  line-height: 1.3;
  display: block;
}

.cert-standards-text {
  font-size: 13px;
  color: #000000;
  line-height: 1.45;
  margin: 0 0 14px 0;
  max-width: 540px;
}

.cert-meta-info {
  font-size: 13px;
  color: #000000;
  line-height: 1.5;
  margin: 0 0 14px 0;
}

.cert-meta-info strong {
  font-weight: 700;
  color: #000000;
}

.cert-recognition-closing {
  font-size: 13px;
  color: #000000;
  line-height: 1.45;
  margin: 0;
  max-width: 540px;
}

/* ── 3. RIGHT SIDE: QR CODE ─────────────────────────────────────────── */
.right-content {
  position: absolute;
  top: 175px;
  right: 120px;
  text-align: center;
  z-index: 5;
}

.qr-action-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
}

.qr-image {
  width: 120px;
  height: 120px;
  background-color: #ffffff;
  padding: 3px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: block;
}

.qr-scan-badge {
  margin-top: 5px;
}

.qr-scan-text {
  font-size: 8.5px;
  font-weight: 700;
  color: #16a34a;
  letter-spacing: 0.8px;
  background-color: #f0fdf4;
  padding: 2px 7px;
  border-radius: 9999px;
  border: 1px solid #bbf7d0;
  display: inline-block;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
}

/* ── 4. BOTTOM-RIGHT: AUTHORISED SIGNATURE ─────────────────────────── */
.signature-section {
  position: absolute;
  bottom: 80px;
  right: 70px;
  text-align: center;
  width: 250px;
  z-index: 5;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
}

.sig-name {
  font-size: 14.5px;
  font-weight: 700;
  color: #000000;
  margin-bottom: 2px;
}

.sig-title {
  font-size: 12px;
  color: #333333;
  font-weight: normal;
}

/* ── 5. BOTTOM BAR: FOOTER METADATA & RECOGNITION ──────────────────── */
.bottom-bar {
  position: absolute;
  bottom: 20px;
  left: 170px;
  right: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 5;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
}

.bottom-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.cert-badge-text {
  font-size: 9.5px;
  font-weight: 700;
  color: #555555;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.cert-id-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cert-id-label {
  font-size: 9.5px;
  font-weight: 700;
  color: #555555;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.cert-id-val {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10.5px;
  font-weight: 700;
  color: #000000;
  letter-spacing: 0.5px;
}

.bottom-right {
  font-size: 9.5px;
  font-weight: 600;
  color: #444444;
  text-align: right;
  letter-spacing: 0.2px;
  max-width: 450px;
}

/* ── PRINT STYLES FOR FLAWLESS A4 LANDSCAPE PRINTING ───────────────── */
@page {
  size: A4 landscape;
  margin: 0;
}

@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
  }

  .no-print {
    display: none !important;
  }

  .cert-outer-wrapper {
    padding: 0 !important;
    margin: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    width: 100vw !important;
    height: 100vh !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: visible !important;
  }

  .certificate {
    width: 297mm !important;
    min-width: 297mm !important;
    height: 198mm !important;
    max-height: 210mm !important;
    margin: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    page-break-inside: avoid;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
