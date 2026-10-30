<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import DOMPurify from 'dompurify';
import QRCode from 'qrcode';
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
      width: 160,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
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

  // Replace {name}, {{name}}, :name, [name], {student_name}, {{student_name}}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(name|student_name)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-name font-bold">${studentName}</strong>`);

  // Replace {title}, {{title}}, {course}, {{course}}, :title, [title], [course], {course_title}, {course_name}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(title|course|course_title|course_name)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-course font-bold">${courseTitle}</strong>`);

  // Replace {duration}, {{duration}}, :duration, [duration], {course_duration}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(duration|course_duration)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${durationStr}</strong>`);

  // Replace {date}, {{date}}, {publish_date}, {{publish_date}}, [date], :date, {completion_date}, {issue_date}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(date|publish_date|completion_date|issue_date)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${dateStr}</strong>`);

  // Replace {certificate_code}, {number}, {{number}}, {certificate_number}, {{certificate_number}}, [number], {cert_number}
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*(certificate_code|number|certificate_number|cert_number)\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${certNumber}</strong>`);

  // Replace {score}, {{score}}, [score]
  text = text.replace(/(\{\{|\{|\b\:|\[)\s*score\s*(\}\}|\}|\]|\b)/gi, `<strong class="cert-dyn-meta">${scoreStr}</strong>`);

  // Replace {instructor}, {{instructor}}, [instructor], {signatory}
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
  return DOMPurify.sanitize(html);
});
</script>

<template>
  <div class="cert-outer-wrapper">
    <div class="cert-card-container" id="printable-certificate">
      <!-- 1. TOP-LEFT: GREEN VERIFIED HEADINGS -->
      <div class="cert-verified-header">
        <h1 class="verified-main-title">VERIFIED</h1>
        <h2 class="verified-sub-title">CERTIFICATE OF ACHIEVEMENT</h2>
      </div>

      <!-- 2. MAIN BODY CONTENT (LEFT SIDE) -->
      <div class="cert-body-left">
        <!-- If dynamic template content is configured, display it with all shortcodes parsed -->
        <div v-if="formattedCustomContent" class="cert-dynamic-content" v-html="formattedCustomContent"></div>

        <!-- Default structured layout matching design-4 when template content is empty -->
        <template v-else>
          <p class="cert-intro">This is to inform that</p>
          
          <p class="cert-student-name">
            Mr. / Mrs. / Ms. <strong>{{ cert.name || 'Parth Soni' }}</strong>
          </p>

          <p class="cert-completion-lead">has successfully completed the certification course titled</p>

          <div class="cert-course-title-box">
            <span class="cert-course-name">{{ localizedCourseTitle || cert.course || 'Safety Title Course' }}</span>
          </div>

          <p class="cert-standards-text">
            The participant has fulfilled all the requirements and standards of the course and is hereby awarded this certificate as a mark of achievement.
          </p>

          <div class="cert-meta-info">
            <p class="meta-item"><strong>Course Duration:</strong> {{ displayDuration }}</p>
            <p class="meta-item"><strong>Date of Completion:</strong> {{ fmtIssueDate(cert.publish_date) }}</p>
          </div>

          <p class="cert-recognition-closing">
            This certificate is issued in recognition of the successful completion of the above-mentioned course.
          </p>
        </template>
      </div>

      <!-- 3. RIGHT SIDE: SCANNABLE QR CODE -->
      <div class="cert-qr-section">
        <a :href="verificationPageUrl" target="_blank" class="qr-action-link" title="Click or Scan to Verify Certificate">
          <img v-if="qrUrl" :src="qrUrl" alt="Verification QR Code" class="qr-image" />
          <div class="qr-scan-badge">
            <span class="qr-scan-text">SCAN TO VERIFY</span>
          </div>
        </a>
      </div>

      <!-- 4. BOTTOM-RIGHT: AUTHORISED SIGNATURE -->
      <div class="cert-signature-section">
        <div class="sig-authority-name">{{ displayInstructor }}</div>
        <div class="sig-authority-label">Authorised Signature</div>
      </div>

      <!-- 5. BOTTOM BAR: FOOTER METADATA & RECOGNITION (ALIGNED WITH HSEDX LOGO) -->
      <div class="cert-footer-bar">
        <div class="cert-footer-left">
          <span class="cert-footer-badge">VERIFIED CERTIFICATE</span>
          <div class="cert-footer-id-group">
            <span class="cert-footer-id-label">VALID CERTIFICATE ID</span>
            <span class="cert-footer-id-val">{{ cert.certificate_number || 'CERT-13-H0T92K' }}</span>
          </div>
        </div>
        <div class="cert-footer-right">
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

/* Certificate main frame: Exact 1600x1067 proportion (1100px x 733px) */
.cert-card-container {
  position: relative;
  width: 1100px;
  min-width: 1100px;
  height: 733px;
  background-image: url('/img/design-4.jpg');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: #ffffff;
  border-radius: 4px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  color: #1e293b;
  overflow: hidden;
  user-select: text;
}

/* ── 1. TOP-LEFT GREEN HEADINGS ─────────────────────────────────────── */
.cert-verified-header {
  position: absolute;
  top: 42px;
  left: 60px;
  z-index: 5;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
}

.verified-main-title {
  font-size: 38px;
  font-weight: 800;
  color: #16a34a; /* Vibrant emerald green matching reference */
  letter-spacing: 1.5px;
  line-height: 1;
  margin: 0;
}

.verified-sub-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #16a34a;
  letter-spacing: 1.5px;
  margin: 5px 0 0 0;
}

/* ── 2. MAIN BODY (LEFT SIDE) ───────────────────────────────────────── */
.cert-body-left {
  position: absolute;
  top: 114px;
  left: 60px;
  width: 630px;
  z-index: 5;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
  color: #1e293b;
}

/* DYNAMIC CONTENT STYLING (From Template) */
.cert-dynamic-content {
  font-size: 13.5px;
  color: #334155;
  line-height: 1.5;
  max-width: 620px;
}

.cert-dynamic-content :deep(p) {
  margin: 0 0 7px 0;
  line-height: 1.5;
}

.cert-dynamic-content :deep(p:last-child) {
  margin-bottom: 0;
}

.cert-dynamic-content :deep(.cert-dyn-name) {
  font-size: 16.5px;
  font-weight: 800;
  color: #0f172a;
}

.cert-dynamic-content :deep(.cert-dyn-course) {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  display: inline-block;
  margin: 3px 0 6px 0;
  line-height: 1.3;
}

.cert-dynamic-content :deep(.cert-dyn-meta) {
  font-weight: 700;
  color: #0f172a;
}

/* DEFAULT STRUCTURED FALLBACK */
.cert-intro {
  font-size: 13.5px;
  color: #334155;
  margin: 0 0 6px 0;
}

.cert-student-name {
  font-size: 14px;
  color: #334155;
  margin: 0 0 8px 0;
}

.cert-student-name strong {
  font-size: 16.5px;
  font-weight: 800;
  color: #0f172a;
  margin-left: 4px;
}

.cert-completion-lead {
  font-size: 13.5px;
  color: #334155;
  margin: 0 0 6px 0;
}

.cert-course-title-box {
  margin: 4px 0 10px 0;
}

.cert-course-name {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.3;
  display: inline-block;
}

.cert-standards-text {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
  margin: 0 0 12px 0;
  max-width: 600px;
}

.cert-meta-info {
  margin: 0 0 12px 0;
}

.meta-item {
  font-size: 13px;
  color: #1e293b;
  margin: 0 0 3px 0;
}

.meta-item strong {
  font-weight: 700;
  color: #0f172a;
}

.cert-recognition-closing {
  font-size: 12.5px;
  color: #475569;
  line-height: 1.45;
  margin: 0;
  max-width: 600px;
}

/* ── 3. RIGHT SIDE: QR CODE ─────────────────────────────────────────── */
.cert-qr-section {
  position: absolute;
  top: 220px;
  right: 120px;
  text-align: center;
  z-index: 5;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
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
  padding: 4px;
  border: 1.5px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  display: block;
}

.qr-scan-badge {
  margin-top: 6px;
}

.qr-scan-text {
  font-size: 9px;
  font-weight: 700;
  color: #16a34a;
  letter-spacing: 0.8px;
  background-color: #f0fdf4;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid #bbf7d0;
  display: inline-block;
}

/* ── 4. BOTTOM-RIGHT: SIGNATURE ─────────────────────────────────────── */
.cert-signature-section {
  position: absolute;
  bottom: 125px;
  right: 60px;
  text-align: center;
  width: 250px;
  z-index: 5;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
}

.sig-authority-name {
  font-size: 14.5px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 3px;
}

.sig-authority-label {
  font-size: 12px;
  color: #475569;
  font-weight: 500;
}

/* ── 5. BOTTOM BAR: FOOTER METADATA & RECOGNITION ──────────────────── */
.cert-footer-bar {
  position: absolute;
  bottom: 74px;
  left: 195px;
  right: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 5;
  font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
}

.cert-footer-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.cert-footer-badge {
  font-size: 10.5px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.cert-footer-id-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cert-footer-id-label {
  font-size: 10.5px;
  font-weight: 700;
  color: #475569;
  letter-spacing: 0.8px;
  text-transform: uppercase;
}

.cert-footer-id-val {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.5px;
}

.cert-footer-right {
  font-size: 10px;
  font-weight: 600;
  color: #334155;
  text-align: right;
  letter-spacing: 0.2px;
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

  .cert-card-container {
    width: 297mm !important;
    min-width: 297mm !important;
    height: 198mm !important;
    max-height: 210mm !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    page-break-inside: avoid;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
