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
  } = options;

  let bgPath = path.resolve(__dirname, '../../../assets/certificates/design-4.jpg');
  if (!fs.existsSync(bgPath)) {
    // Fallback to frontend public img path if available
    bgPath = path.resolve(__dirname, '../../../../lmshub-fe/public/img/design-4.jpg');
  }

  const bgBytes = fs.readFileSync(bgPath);
  const bgLength = bgBytes.length;

  const pageWidth = 1100;
  const pageHeight = 620;

  // Vector QR code generation
  const qrTarget = verifyUrl || `https://hsedx.nfsi.in/certificates/${encodeURIComponent(certNumber)}`;
  const qr = QRCode.create(qrTarget, { errorCorrectionLevel: 'M' });
  const qrSize = qr.modules.size;
  const qrDisplaySize = 110;
  const qrCellSize = qrDisplaySize / qrSize;
  const qrX = 870;
  const qrY = 320;

  let qrDraw = '';
  qrDraw += `1 1 1 rg ${qrX - 5} ${qrY - 5} ${qrDisplaySize + 10} ${qrDisplaySize + 10} re f\n`;
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

  let stream = '';

  // 1. Draw background image
  stream += `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im1 Do\nQ\n`;

  // 2. Verified Header
  stream += `BT\n/F2 38 Tf\n0.16 0.77 0.19 rg\n50 540 Td\n(VERIFIED) Tj\nET\n`;
  stream += `BT\n/F2 13 Tf\n0.16 0.77 0.19 rg\n50 520 Td\n(CERTIFICATE OF ACHIEVEMENT) Tj\nET\n`;

  // 3. Main Certificate Body text (matches design-4 layout and gaps)
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

  // 4. Vector QR code + scan badge
  stream += `q\n${qrDraw}\nQ\n`;
  stream += `BT\n/F2 7.5 Tf\n0.09 0.64 0.29 rg\n${qrX + 16} ${qrY - 17} Td\n(SCAN TO VERIFY) Tj\nET\n`;

  // 5. Signature
  stream += `BT\n/F2 11 Tf\n0 0 0 rg\n840 100 Td\n(${esc(instructor)}) Tj\nET\n`;
  stream += `BT\n/F1 9.5 Tf\n0.2 0.2 0.2 rg\n850 86 Td\n(Authorised Signature) Tj\nET\n`;

  // 6. Bottom metadata
  stream += `BT\n/F2 8 Tf\n0.33 0.33 0.33 rg\n170 24 Td\n(VERIFIED CERTIFICATE) Tj\nET\n`;
  stream += `BT\n/F2 8 Tf\n0.33 0.33 0.33 rg\n330 24 Td\n(VALID CERTIFICATE ID: ) Tj\n/F2 8.5 Tf\n0 0 0 rg\n(${esc(certNumber)}) Tj\nET\n`;
  stream += `BT\n/F2 7.5 Tf\n0.27 0.27 0.27 rg\n720 28 Td\n(Recognized by Directorate of Industrial, Safety &) Tj\nET\n`;
  stream += `BT\n/F2 7.5 Tf\n0.27 0.27 0.27 rg\n740 18 Td\n(Health \\(DISH\\), Govt. Of Gujarat) Tj\nET\n`;

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
  write(`<< /Type /XObject /Subtype /Image /Width 1600 /Height 1067 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bgLength} >>\nstream\n`);
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
