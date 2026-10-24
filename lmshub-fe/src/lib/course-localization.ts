import { currentLocale } from '@/i18n';

/**
 * Parses and returns the localized version of a bilingual string.
 * Supports delimiters:
 * - " | " (standard for course titles)
 * - " / " (standard for section and lesson titles)
 * - [EN]...[/EN] and [HI]...[/HI] tags
 */
export function getLocalizedText(rawText: string | null | undefined, forceLocale?: string): string {
  if (!rawText) return '';
  const loc = (forceLocale || currentLocale() || 'en').toLowerCase();
  const text = rawText.trim();

  // 1. Tag based: [EN]...[/EN] and [HI]...[/HI]
  if (text.includes('[EN]') || text.includes('[HI]')) {
    if (loc === 'hi') {
      const match = text.match(/\[HI\]([\s\S]*?)\[\/HI\]/i);
      if (match && match[1].trim()) return match[1].trim();
    } else {
      const match = text.match(/\[EN\]([\s\S]*?)\[\/EN\]/i);
      if (match && match[1].trim()) return match[1].trim();
    }
  }

  // 2. Pipe delimiter: "English Title | हिन्दी शीर्षक"
  if (text.includes(' | ')) {
    const parts = text.split(' | ');
    if (parts.length >= 2) {
      if (loc === 'hi') {
        return parts.slice(1).join(' | ').trim();
      } else {
        // Strip "(English + Hindi)" or similar bilingual tags if present in EN part
        return parts[0].replace(/\s*\((?:English\s*\+\s*Hindi|Bilingual)\)/i, '').trim();
      }
    }
  }

  // 3. Slash delimiter: "Section 1 English / सेक्शन 1 हिन्दी"
  if (text.includes(' / ')) {
    const parts = text.split(' / ');
    if (parts.length >= 2) {
      if (loc === 'hi') {
        return parts.slice(1).join(' / ').trim();
      } else {
        return parts[0].trim();
      }
    }
  }

  return text;
}

/**
 * Splits raw bilingual text into separate { en, hi } components.
 */
export function splitLocalizedText(rawText: string | null | undefined, defaultDelimiter: ' | ' | ' / ' = ' | '): { en: string; hi: string } {
  if (!rawText) return { en: '', hi: '' };
  const text = rawText.trim();

  if (text.includes(' | ')) {
    const parts = text.split(' | ');
    return {
      en: parts[0].replace(/\s*\((?:English\s*\+\s*Hindi|Bilingual)\)/i, '').trim(),
      hi: parts.slice(1).join(' | ').trim(),
    };
  }

  if (text.includes(' / ')) {
    const parts = text.split(' / ');
    return {
      en: parts[0].trim(),
      hi: parts.slice(1).join(' / ').trim(),
    };
  }

  return { en: text, hi: '' };
}

/**
 * Combines separate English and Hindi texts into a single bilingual string.
 */
export function combineLocalizedText(enText: string | null | undefined, hiText: string | null | undefined, delimiter: ' | ' | ' / ' = ' | '): string {
  const en = (enText ?? '').trim();
  const hi = (hiText ?? '').trim();

  if (en && hi) {
    return `${en}${delimiter}${hi}`;
  }
  return en || hi || '';
}

/**
 * Filters bilingual HTML content to display either English, Hindi, or Both.
 */
export function filterLessonHtml(html: string | null | undefined, lang: 'en' | 'hi' | 'both'): string {
  if (!html) return '';
  if (lang === 'both') return html;

  // 1. Tag based: [EN]...[/EN] and [HI]...[/HI]
  if (html.includes('[EN]') || html.includes('[HI]')) {
    if (lang === 'hi') {
      const match = html.match(/\[HI\]([\s\S]*?)\[\/HI\]/i);
      if (match && match[1].trim()) return match[1].trim();
    } else {
      const match = html.match(/\[EN\]([\s\S]*?)\[\/EN\]/i);
      if (match && match[1].trim()) return match[1].trim();
    }
  }

  // 2. DOM based filtering for dual-card layouts
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Look for cards marked with data-lang
      const enElements = doc.querySelectorAll('[data-lang="en"], .card-lang-en');
      const hiElements = doc.querySelectorAll('[data-lang="hi"], .card-lang-hi');

      if (enElements.length > 0 || hiElements.length > 0) {
        // Change parent grid from 2 columns to 1 column
        const grid = (enElements[0] || hiElements[0])?.parentElement;
        if (grid) {
          grid.className = grid.className.replace(/md:grid-cols-2/g, 'grid-cols-1');
        }

        if (lang === 'en') {
          hiElements.forEach((el) => el.remove());
        } else if (lang === 'hi') {
          enElements.forEach((el) => el.remove());
        }
        return doc.body.innerHTML;
      }

      // Look for bilingual cards containing EN or हिन्दी badges
      const allDivs = doc.querySelectorAll('div');
      let foundEnCard: HTMLElement | null = null;
      let foundHiCard: HTMLElement | null = null;

      allDivs.forEach((div) => {
        const text = div.textContent || '';
        if (text.includes('English Video Script') || (text.includes('EN') && text.includes('English'))) {
          if (!foundEnCard && div.children.length > 0) foundEnCard = div as HTMLElement;
        }
        if (text.includes('हिन्दी व्याख्या') || (text.includes('हिन्दी') && text.includes('स्क्रिप्ट'))) {
          if (!foundHiCard && div.children.length > 0) foundHiCard = div as HTMLElement;
        }
      });

      if (foundEnCard && foundHiCard) {
        const grid = (foundEnCard as HTMLElement).parentElement;
        if (grid) {
          grid.className = grid.className.replace(/md:grid-cols-2/g, 'grid-cols-1');
        }
        if (lang === 'en') {
          (foundHiCard as HTMLElement).remove();
        } else if (lang === 'hi') {
          (foundEnCard as HTMLElement).remove();
        }
        return doc.body.innerHTML;
      }
    } catch {
      // Fallback to raw html if parsing fails
    }
  }

  return html;
}

/**
 * Splits lesson body into separate English and Hindi HTML/text contents.
 * Supports:
 * - [EN]...[/EN] and [HI]...[/HI] tags
 * - DOM cards with data-lang="en" and data-lang="hi"
 * - Dual-card layout from seeded safety courses
 */
export function splitLessonContent(html: string | null | undefined): { en: string; hi: string } {
  if (!html) return { en: '', hi: '' };
  const raw = html.trim();

  // 1. Tag based: [EN]...[/EN] and [HI]...[/HI]
  const enTag = raw.match(/\[EN\]([\s\S]*?)\[\/EN\]/i);
  const hiTag = raw.match(/\[HI\]([\s\S]*?)\[\/HI\]/i);
  if (enTag || hiTag) {
    return {
      en: (enTag ? enTag[1] : '').trim(),
      hi: (hiTag ? hiTag[1] : '').trim(),
    };
  }

  // 2. DOM based parsing for card layouts
  if (typeof DOMParser !== 'undefined' && raw.includes('<')) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'text/html');

      // Find by data-lang attribute
      let enCard = doc.querySelector('[data-lang="en"], .card-lang-en');
      let hiCard = doc.querySelector('[data-lang="hi"], .card-lang-hi');

      // Fallback: search by badge / heading content
      if (!enCard || !hiCard) {
        const divs = doc.querySelectorAll('div');
        divs.forEach((div) => {
          const t = div.textContent || '';
          if (!enCard && (t.includes('English Video Script') || (t.includes('EN') && t.includes('English')))) {
            enCard = div;
          }
          if (!hiCard && (t.includes('हिन्दी व्याख्या') || (t.includes('हिन्दी') && t.includes('स्क्रिप्ट')))) {
            hiCard = div;
          }
        });
      }

      if (enCard || hiCard) {
        const extractBody = (card: Element | null): string => {
          if (!card) return '';
          const prose = card.querySelector('.prose') || card.querySelector('.whitespace-pre-line');
          if (prose) {
            return prose.innerHTML.trim();
          }
          const clone = card.cloneNode(true) as Element;
          clone.querySelectorAll('.border-b, span, h4').forEach((el) => el.remove());
          return clone.innerHTML.trim();
        };

        return {
          en: extractBody(enCard),
          hi: extractBody(hiCard),
        };
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback: check if text is mainly Devanagari (Hindi)
  const isHindi = /[\u0900-\u097F]/.test(raw) && !/[a-zA-Z]{5,}/.test(raw);
  if (isHindi) {
    return { en: '', hi: raw };
  }
  return { en: raw, hi: '' };
}

/**
 * Combines separate English and Hindi lesson texts into responsive bilingual HTML cards.
 */
export function createBilingualLessonHtml(en: string, hi: string): string {
  const enTrim = (en || '').trim();
  const hiTrim = (hi || '').trim();

  if (enTrim && hiTrim) {
    return `<div class="space-y-6">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-sm" data-lang="en">
      <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
        <span class="px-2 py-0.5 text-xs font-bold rounded bg-blue-100 text-blue-700">EN</span>
        <h4 class="font-semibold text-slate-900">English Video Script &amp; Learning</h4>
      </div>
      <div class="prose prose-sm max-w-none">
        ${enTrim.startsWith('<') ? enTrim : `<p class="mb-3 text-slate-700 leading-relaxed">${enTrim}</p>`}
      </div>
    </div>

    <div class="bg-white rounded-xl border border-emerald-100 p-5 shadow-sm bg-gradient-to-b from-white to-emerald-50/20" data-lang="hi">
      <div class="flex items-center gap-2 mb-3 pb-2 border-b border-emerald-100">
        <span class="px-2 py-0.5 text-xs font-bold rounded bg-emerald-100 text-emerald-700">हिन्दी</span>
        <h4 class="font-semibold text-slate-900">हिन्दी व्याख्या एवं स्क्रिप्ट (Hindi)</h4>
      </div>
      <div class="prose prose-sm max-w-none">
        ${hiTrim.startsWith('<') ? hiTrim : `<p class="mb-3 text-slate-800 leading-relaxed font-medium">${hiTrim}</p>`}
      </div>
    </div>
  </div>
</div>`;
  }

  if (hiTrim) return hiTrim;
  return enTrim;
}
