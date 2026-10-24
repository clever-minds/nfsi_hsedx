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
        // Change parent grid to 1 column
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
