import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';

export interface CertificatePdfOptions {
  studentName: string;
  courseTitle: string;
  certNumber: string;
  completionDate: string;
  duration?: string;
  instructor?: string;
  verifyUrl?: string;
  template?: 'default' | 'participation';
  organization?: string;
}

export function generateCertificatePdf(options: CertificatePdfOptions): Buffer {
  const {
    studentName,
    courseTitle,
    certNumber,
    completionDate,
    duration = '12 hours',
    instructor = 'Dr. Chiragkumar Makwana',
    verifyUrl,
    template = 'default',
    organization = 'Individual',
  } = options;

  const isParticipation = template === 'participation';

  let bgFileName = isParticipation ? 'certificate-participation.jpg' : 'design-4.jpg';
  let bgPath = path.resolve(__dirname, `../../../assets/certificates/${bgFileName}`);
  if (!fs.existsSync(bgPath)) {
    bgPath = path.resolve(__dirname, `../../../../lmshub-fe/public/img/${bgFileName}`);
  }

  const bgBytes = fs.readFileSync(bgPath);
  const bgLength = bgBytes.length;

  const pageWidth = isParticipation ? 1024 : 1100;
  const pageHeight = isParticipation ? 723 : 620;
  const imgWidth = isParticipation ? 1024 : 1600;
  const imgHeight = isParticipation ? 723 : 1067;

  // Vector QR code generation
  const qrTarget = verifyUrl || `https://hsedx.nfsi.in/certificates/${encodeURIComponent(certNumber)}`;
  const qr = QRCode.create(qrTarget, { errorCorrectionLevel: 'M' });
  const qrSize = qr.modules.size;
  const qrDisplaySize = isParticipation ? 96 : 110;
  const qrCellSize = qrDisplaySize / qrSize;
  const qrX = isParticipation ? 820 : 870;
  const qrY = isParticipation ? 140 : 320;

  let qrDraw = '';
  qrDraw += `1 1 1 rg ${qrX - 4} ${qrY - 4} ${qrDisplaySize + 8} ${qrDisplaySize + 8} re f\n`;
  qrDraw += `0 0 0 rg\n`;
  for (let r = 0; r < qrSize; r++) {
    for (let c = 0; c < qrSize; c++) {
      if (qr.modules.get(c, r)) {
        const x = qrX + c * qrCellSize;
        const y = qrY + (qrSize - 1 - r) * qrCellSize;
        qrDraw += `${x.toFixed(2)} ${y.toFixed(2)} ${(qrCellSize + 0.1).toFixed(2)} ${(qrCellSize + 0.1).toFixed(2)} re f\n`;
      }
    }
  }

  const esc = (str: string | number | null | undefined) =>
    String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

  const approxWidth = (text: string, fontSize: number, bold: boolean = false): number => {
    return text.length * fontSize * (bold ? 0.58 : 0.52);
  };

  let stream = '';

  // 1. Draw background image
  stream += `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im1 Do\nQ\n`;

  if (isParticipation) {
    // ──────── PARTICIPATION TEMPLATE LAYOUT ────────
    // Left ribbon is from x=0 to ~185.
    // Content area is from x=210 to x=990 (center = 600)
    const centerX = 600;

    // Header Authority
    const orgHeader = 'HIMAYA PREVENTION PRIVATE LIMITED';
    const orgX = Math.round(centerX - approxWidth(orgHeader, 15, true) / 2);
    stream += `BT\n/F2 15 Tf\n0.11 0.22 0.54 rg\n${orgX} 615 Td\n(${esc(orgHeader)}) Tj\nET\n`;

    // Subtitle
    const presText = 'THIS IS PROUDLY PRESENTED TO';
    const presX = Math.round(centerX - approxWidth(presText, 11, true) / 2);
    stream += `BT\n/F2 11 Tf\n0.42 0.50 0.60 rg\n${presX} 575 Td\n(${esc(presText)}) Tj\nET\n`;

    // Participant Name (Bold and prominent)
    const nameStr = studentName.trim();
    const nameFontSize = nameStr.length > 28 ? 24 : 28;
    const nameX = Math.round(centerX - approxWidth(nameStr, nameFontSize, true) / 2);
    stream += `BT\n/F2 ${nameFontSize} Tf\n0.08 0.16 0.36 rg\n${nameX} 518 Td\n(${esc(nameStr)}) Tj\nET\n`;

    // Decorative underline rule
    const lineHalf = Math.min(260, Math.max(160, Math.round(approxWidth(nameStr, nameFontSize, true) / 2 + 30)));
    stream += `0.80 0.85 0.92 rg\n${centerX - lineHalf} 505 ${lineHalf * 2} 1.5 re f\n`;

    // Organization / Company
    const compText = organization ? organization.trim() : 'Individual';
    const compX = Math.round(centerX - approxWidth(compText, 13, true) / 2);
    stream += `BT\n/F2 13 Tf\n0.25 0.35 0.48 rg\n${compX} 480 Td\n(${esc(compText)}) Tj\nET\n`;

    // Statement
    const statement = 'for actively participating and demonstrating safety awareness in';
    const stX = Math.round(centerX - approxWidth(statement, 11.5, false) / 2);
    stream += `BT\n/F1 11.5 Tf\n0.20 0.25 0.30 rg\n${stX} 435 Td\n(${esc(statement)}) Tj\nET\n`;

    // Course / Blog Assessment Title
    const titleStr = courseTitle.trim();
    const titleFontSize = titleStr.length > 40 ? 15 : 17;
    const titleX = Math.round(centerX - approxWidth(titleStr, titleFontSize, true) / 2);
    stream += `BT\n/F2 ${titleFontSize} Tf\n0.08 0.16 0.36 rg\n${titleX} 398 Td\n(${esc(titleStr)}) Tj\nET\n`;

    // Awareness & Consent Disclaimer (Per user's exact participation consent)
    const disc1 = 'This certificate is issued for awareness purposes only by Himaya Prevention Private Limited and';
    const disc2 = 'does not constitute formal authorization, competency evidence, training certification or a qualification.';
    const d1X = Math.round(centerX - approxWidth(disc1, 8.5, false) / 2);
    const d2X = Math.round(centerX - approxWidth(disc2, 8.5, false) / 2);
    stream += `BT\n/F1 8.5 Tf\n0.48 0.54 0.60 rg\n${d1X} 345 Td\n(${esc(disc1)}) Tj\nET\n`;
    stream += `BT\n/F1 8.5 Tf\n0.48 0.54 0.60 rg\n${d2X} 332 Td\n(${esc(disc2)}) Tj\nET\n`;

    // Left info metadata block
    const metaX = 260;
    stream += `BT\n/F2 9.5 Tf\n0.20 0.25 0.32 rg\n${metaX} 220 Td\n(Date of Issue: ) Tj\n/F1 9.5 Tf\n(${esc(completionDate)}) Tj\nET\n`;
    stream += `BT\n/F2 9.5 Tf\n0.20 0.25 0.32 rg\n${metaX} 202 Td\n(Certificate ID: ) Tj\n/F2 9.5 Tf\n0.08 0.16 0.36 rg\n(${esc(certNumber)}) Tj\nET\n`;
    stream += `BT\n/F2 9 Tf\n0.11 0.55 0.28 rg\n${metaX} 184 Td\n(VERIFIED PARTICIPATION RECORD) Tj\nET\n`;

    // Center Signature Section
    const sigX = 540;
    stream += `0.75 0.80 0.85 rg\n${sigX - 30} 185 180 1 re f\n`;
    stream += `BT\n/F2 11 Tf\n0.08 0.16 0.36 rg\n${sigX - 20} 168 Td\n(Himaya Prevention Pvt. Ltd.) Tj\nET\n`;
    stream += `BT\n/F1 9 Tf\n0.42 0.50 0.58 rg\n${sigX + 10} 154 Td\n(Authorized Signatory) Tj\nET\n`;

    // Right QR Code
    stream += `q\n${qrDraw}\nQ\n`;
    stream += `BT\n/F2 7.5 Tf\n0.11 0.22 0.54 rg\n${qrX + 11} ${qrY - 14} Td\n(SCAN TO VERIFY) Tj\nET\n`;

    // Bottom verification notice
    const footNotice = `Verify certificate authenticity online at ${qrTarget}`;
    const fnX = Math.round(centerX - approxWidth(footNotice, 8, false) / 2);
    stream += `BT\n/F1 8 Tf\n0.55 0.60 0.68 rg\n${fnX} 45 Td\n(${esc(footNotice)}) Tj\nET\n`;
  } else {
    // ──────── DEFAULT COURSE CERTIFICATE LAYOUT ────────
    // Verified Header
    stream += `BT\n/F2 38 Tf\n0.16 0.77 0.19 rg\n50 540 Td\n(VERIFIED) Tj\nET\n`;
    stream += `BT\n/F2 13 Tf\n0.16 0.77 0.19 rg\n50 520 Td\n(CERTIFICATE OF ACHIEVEMENT) Tj\nET\n`;

    // Main Certificate Body text (matches design-4 layout and gaps)
    stream += `BT\n/F1 10.5 Tf\n0 0 0 rg\n50 480 Td\n(This is to inform that) Tj\nET\n`;

    stream += `BT\n/F1 10.5 Tf\n0 0 0 rg\n50 452 Td\n(Mr. / Mrs. / Ms. ) Tj\n/F2 10.5 Tf\n(${esc(studentName)}) Tj\nET\n`;
    stream += `BT\n/F1 10.5 Tf\n0 0 0 rg\n50 436 Td\n(has successfully completed the certification course titled) Tj\nET\n`;

    stream += `BT\n/F2 14.5 Tf\n0 0 0 rg\n50 405 Td\n(${esc(courseTitle)}) Tj\nET\n`;

    stream += `BT\n/F1 10 Tf\n0 0 0 rg\n50 375 Td\n(The participant has fulfilled all the requirements and standards of the course and is hereby) Tj\nET\n`;
    stream += `BT\n/F1 10 Tf\n0 0 0 rg\n50 361 Td\n(awarded this certificate as a mark of achievement.) Tj\nET\n`;

    stream += `BT\n/F2 10 Tf\n0 0 0 rg\n50 332 Td\n(Course Duration: ) Tj\n/F1 10 Tf\n(${esc(duration)}) Tj\nET\n`;
    stream += `BT\n/F2 10 Tf\n0 0 0 rg\n50 318 Td\n(Date of Completion: ) Tj\n/F1 10 Tf\n(${esc(completionDate)}) Tj\nET\n`;

    stream += `BT\n/F1 10 Tf\n0 0 0 rg\n50 290 Td\n(This certificate is issued in recognition of the successful completion of the above-mentioned) Tj\nET\n`;
    stream += `BT\n/F1 10 Tf\n0 0 0 rg\n50 276 Td\n(course.) Tj\nET\n`;

    // Vector QR code + scan badge
    stream += `q\n${qrDraw}\nQ\n`;
    stream += `BT\n/F2 7.5 Tf\n0.09 0.64 0.29 rg\n${qrX + 16} ${qrY - 17} Td\n(SCAN TO VERIFY) Tj\nET\n`;

    // Signature
    stream += `BT\n/F2 11 Tf\n0 0 0 rg\n840 100 Td\n(${esc(instructor)}) Tj\nET\n`;
    stream += `BT\n/F1 9.5 Tf\n0.2 0.2 0.2 rg\n850 86 Td\n(Authorised Signature) Tj\nET\n`;

    // Bottom metadata
    stream += `BT\n/F2 8 Tf\n0.33 0.33 0.33 rg\n170 24 Td\n(VERIFIED CERTIFICATE) Tj\nET\n`;
    stream += `BT\n/F2 8 Tf\n0.33 0.33 0.33 rg\n330 24 Td\n(VALID CERTIFICATE ID: ) Tj\n/F2 8.5 Tf\n0 0 0 rg\n(${esc(certNumber)}) Tj\nET\n`;
    stream += `BT\n/F2 7.5 Tf\n0.27 0.27 0.27 rg\n720 28 Td\n(Recognized by Directorate of Industrial, Safety &) Tj\nET\n`;
    stream += `BT\n/F2 7.5 Tf\n0.27 0.27 0.27 rg\n740 18 Td\n(Health \\(DISH\\), Govt. Of Gujarat) Tj\nET\n`;
  }

  const streamBuf = Buffer.from(stream, 'utf-8');

  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let pos = 0;

  function write(strOrBuf: string | Buffer) {
    const buf = Buffer.isBuffer(strOrBuf) ? strOrBuf : Buffer.from(strOrBuf, 'utf-8');
    chunks.push(buf);
    pos += buf.length;
  }

  function startObj(num: number) {
    offsets[num] = pos;
    write(`${num} 0 obj\n`);
  }

  function endObj() {
    write(`endobj\n`);
  }

  // PDF-1.4 Header
  write('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // Object 1: Catalog
  startObj(1);
  write(`<< /Type /Catalog /Pages 2 0 R >>\n`);
  endObj();

  // Object 2: Pages
  startObj(2);
  write(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n`);
  endObj();

  // Object 3: Page
  startObj(3);
  write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources 5 0 R >>\n`);
  endObj();

  // Object 4: Page Content Stream
  startObj(4);
  write(`<< /Length ${streamBuf.length} >>\nstream\n`);
  write(streamBuf);
  write(`\nendstream\n`);
  endObj();

  // Object 5: Resources Dictionary
  startObj(5);
  write(`<< /ProcSet [/PDF /Text /ImageC] /Font << /F1 6 0 R /F2 7 0 R >> /XObject << /Im1 8 0 R >> >>\n`);
  endObj();

  // Object 6: Font 1: Helvetica (Regular)
  startObj(6);
  write(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n`);
  endObj();

  // Object 7: Font 2: Helvetica-Bold
  startObj(7);
  write(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n`);
  endObj();

  // Object 8: Background Image XObject (JPEG)
  startObj(8);
  write(`<< /Type /XObject /Subtype /Image /Width ${imgWidth} /Height ${imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bgLength} >>\nstream\n`);
  write(bgBytes);
  write(`\nendstream\n`);
  endObj();

  // Cross-reference table
  const xrefOffset = pos;
  write(`xref\n0 9\n0000000000 65535 f \n`);
  for (let i = 1; i <= 8; i++) {
    write(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }

  // Trailer
  write(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.concat(chunks);
}
