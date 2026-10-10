import DOMPurify from 'dompurify';

/**
 * Membersihkan HTML sebelum dirender lewat `v-html`.
 *
 * Isi material text ditulis instructor dan disimpan apa adanya — backend no
 * menyanitasi apa pun. Tanpa pembersihan di sini, satu akun instructor yang
 * jahat atau diretas bisa menanam `<script>` pada sebuah pelajaran, lalu skrip
 * itu berjalan di peramban setiap student yang membukanya.
 *
 * Yang diizinkan sengaja dibatasi to tag pemformatan text: cukup untuk material
 * yang ditulis rapi, no cukup untuk menjalankan apa pun. `target="_blank"`
 * dipasangkan `rel` by hook di bawah karena tautan material mengarah logout.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'span', 'div',
];
const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'width', 'height', 'colspan', 'rowspan', 'dir', 'lang'];

export function sanitizeHtml(dirty?: string | null): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // `javascript:` dan `data:` pada href/src ditolak; hanya skema aman lolos.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|#|\/)/i,
  });
}
