import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from '../../src/core/html/sanitize';
import { sniffImageMime } from '../../src/core/upload/image';
import { normalizeKonten } from '../../src/modules/documents/documents.service';

describe('sanitizeRichText (content halaman statis)', () => {
  it('membuang script, event handler, dan javascript: URL', () => {
    const out = sanitizeRichText(
      '<p onclick="steal()">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src="x" onerror="alert(1)">',
    );
    expect(out).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(out).toContain('<p>Hi</p>');
  });
  it('membuang iframe/style/form', () => {
    expect(sanitizeRichText('<iframe src="https://evil"></iframe><style>*{}</style><form><input></form>ok')).toBe('ok');
  });
  it('mempertahankan format text dan tautan aman', () => {
    const html = '<h2>Title</h2><p><strong>b</strong> <a href="/pages/contact">c</a> <a href="mailto:a@b.co">m</a></p><ul><li>x</li></ul>';
    expect(sanitizeRichText(html)).toBe(html);
  });
  it('target=_blank selalu diberi rel noopener', () => {
    expect(sanitizeRichText('<a href="https://x.co" target="_blank">x</a>')).toContain('rel="noopener noreferrer"');
  });
  it('data: URL di gambar ditolak', () => {
    expect(sanitizeRichText('<img src="data:text/html;base64,PHNjcmlwdD4=">')).not.toContain('data:');
  });
});

describe('normalizeKonten', () => {
  it('konten_html disimpan sebagai {format, html} yang sudah bersih', () => {
    expect(normalizeKonten({ konten_html: '<p>a</p><script>x</script>' })).toEqual({ format: 'html', html: '<p>a</p>' });
  });
  it('klien lama: objek content yang membawa html ikut dibersihkan', () => {
    expect(normalizeKonten({ content: { html: '<b onmouseover="x">b</b>', extra: 1 } })).toEqual({
      html: '<b>b</b>',
      extra: 1,
      format: 'html',
    });
  });
  it('no ada field content → undefined (no diubah)', () => {
    expect(normalizeKonten({})).toBeUndefined();
  });
});

describe('sniffImageMime (unggahan hero)', () => {
  it('mengenali JPG, PNG, WebP from byte awal', () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(sniffImageMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))).toBe('image/webp');
  });
  it('menolak HTML/SVG/GIF yang mengaku gambar', () => {
    expect(sniffImageMime(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageMime(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});
