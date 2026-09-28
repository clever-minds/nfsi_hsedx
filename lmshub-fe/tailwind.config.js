/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts,js}'],
  theme: {
    extend: {
      colors: {
        // Palet merah ala Cursus; key `brand` dipertahankan agar semua modul ikut.
        brand: {
          50: '#fdecec',
          100: '#fbd6d5',
          200: '#f6a9a7',
          300: '#f17c79',
          400: '#ec4f4b',
          500: '#ed2a26',
          600: '#d21f1b',
          700: '#b01a17',
          800: '#8d1512',
          900: '#6a100e',
        },
        // Aksen kuning untuk rating/bestseller badge.
        accent: { 400: '#ffc107', 500: '#f5a623', 600: '#e09112' },
        surface: '#f7f7f7',
      },
      fontFamily: {
        // Noto Sans Arabic/Devanagari ikut di stack: browser memilih otomatis
        // per rentang glyph, jadi satu kelas font cukup untuk 4 bahasa.
        sans: [
          'Roboto',
          'Noto Sans Arabic',
          'Noto Sans Devanagari',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        serif: ['Georgia', 'Noto Sans Arabic', 'Noto Sans Devanagari', 'serif'],
      },
      boxShadow: {
        header: '0 1px 4px rgba(0,0,0,0.08)',
        card: '0 2px 6px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
