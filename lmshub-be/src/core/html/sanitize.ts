import sanitizeHtmlLib from 'sanitize-html';

/**
 * Membersihkan HTML yang ditulis admin sebelum disimpan.
 *
 * Frontend juga menyaring lewat DOMPurify saat merender, tetapi halaman statis
 * dibaca tanpa login dan bisa saja dirender klien lain (aplikasi mobile, tema
 * kustom pembeli) yang tidak menyaring. Karena itu yang tersimpan sudah bersih.
 *
 * Daftar tag sama dengan `src/lib/sanitize.ts` di frontend: cukup untuk text
 * yang ditulis rapi, tidak cukup untuk menjalankan apa pun.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'span', 'div',
];

export function sanitizeRichText(dirty: string | null | undefined): string {
  if (!dirty) return '';
  return sanitizeHtmlLib(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      '*': ['dir', 'lang'],
    },
    // `javascript:` dan `data:` ditolak; path relatif (/uploads/…) tetap boleh.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => {
        const out: Record<string, string> = { ...attribs };
        if (out.target === '_blank') out.rel = 'noopener noreferrer';
        else delete out.target;
        return { tagName, attribs: out };
      },
    },
  });
}
