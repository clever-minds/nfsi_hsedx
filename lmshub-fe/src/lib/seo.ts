/**
 * SEO & Meta Tags Management Utility
 * Handles dynamic Title, Meta Description, Keywords, Canonical URL,
 * Open Graph (Facebook, WhatsApp, LinkedIn), Twitter Cards,
 * and Schema.org JSON-LD structured data.
 */

export interface SeoMetaOptions {
  title?: string;
  description?: string;
  keywords?: string | string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  category?: string;
  tags?: string[];
  siteName?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, any> | Array<Record<string, any>>;
}

/** Helper to strip HTML tags and limit length for clean meta descriptions */
export function cleanExcerpt(htmlOrText?: string | null, maxLength = 160): string {
  if (!htmlOrText) return '';
  const text = htmlOrText
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/** Set or update a <meta> tag by name or property attribute */
function setMetaTag(attribute: 'name' | 'property', key: string, content: string | null | undefined) {
  if (typeof document === 'undefined') return;

  const selector = `meta[${attribute}="${key}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!content) {
    if (element) {
      element.remove();
    }
    return;
  }

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    element.setAttribute('data-dynamic-seo', 'true');
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

/** Set or update <link rel="canonical"> */
function setCanonical(url?: string | null) {
  if (typeof document === 'undefined') return;

  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!url) {
    if (link) link.remove();
    return;
  }

  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('data-dynamic-seo', 'true');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

/** Injects or updates Schema.org JSON-LD structured data */
function setJsonLd(data?: Record<string, any> | Array<Record<string, any>> | null) {
  if (typeof document === 'undefined') return;

  const scriptId = 'app-dynamic-seo-ld';
  let script = document.head.querySelector<HTMLScriptElement>(`#${scriptId}`);

  if (!data) {
    if (script) script.remove();
    return;
  }

  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.type = 'application/ld+json';
    script.setAttribute('data-dynamic-seo', 'true');
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data, null, 2);
}

/**
 * Main function to update all SEO meta tags, social preview tags, and structured data
 */
export function setMetaTags(options: SeoMetaOptions) {
  if (typeof document === 'undefined') return;

  const siteName = options.siteName || 'HSEdx · National Fire & Safety';
  const fullTitle = options.title ? `${options.title} · ${siteName}` : siteName;

  // 1. Document Title
  document.title = fullTitle;

  // 2. Standard Search Engine Meta
  const description = cleanExcerpt(options.description);
  setMetaTag('name', 'description', description);

  const keywords = Array.isArray(options.keywords)
    ? options.keywords.join(', ')
    : options.keywords || (options.tags ? options.tags.join(', ') : '');
  setMetaTag('name', 'keywords', keywords);

  if (options.author) {
    setMetaTag('name', 'author', options.author);
  }
  setMetaTag('name', 'robots', options.noIndex ? 'noindex, nofollow' : 'index, follow');

  // 3. Canonical URL
  const currentUrl = options.url || (typeof window !== 'undefined' ? window.location.href : '');
  if (currentUrl) {
    setCanonical(currentUrl);
  }

  // 4. Open Graph Tags (WhatsApp, Facebook, LinkedIn, Telegram)
  const ogType = options.type || 'website';
  setMetaTag('property', 'og:site_name', siteName);
  setMetaTag('property', 'og:type', ogType);
  setMetaTag('property', 'og:title', options.title || siteName);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:url', currentUrl);
  setMetaTag('property', 'og:locale', 'en_US');

  if (options.image) {
    setMetaTag('property', 'og:image', options.image);
    setMetaTag('property', 'og:image:alt', options.title || siteName);
  }

  if (ogType === 'article') {
    if (options.publishedTime) setMetaTag('property', 'article:published_time', options.publishedTime);
    if (options.modifiedTime) setMetaTag('property', 'article:modified_time', options.modifiedTime);
    if (options.author) setMetaTag('property', 'article:author', options.author);
    if (options.category) setMetaTag('property', 'article:section', options.category);
    if (options.tags && options.tags.length > 0) {
      setMetaTag('property', 'article:tag', options.tags.join(', '));
    }
  }

  // 5. Twitter Card Tags (X)
  setMetaTag('name', 'twitter:card', options.image ? 'summary_large_image' : 'summary');
  setMetaTag('name', 'twitter:title', options.title || siteName);
  setMetaTag('name', 'twitter:description', description);
  if (options.image) {
    setMetaTag('name', 'twitter:image', options.image);
  }

  // 6. Schema.org JSON-LD Structured Data
  if (options.jsonLd) {
    setJsonLd(options.jsonLd);
  } else if (ogType === 'article') {
    // Generate standard BlogPosting schema
    const blogPostingSchema: Record<string, any> = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: options.title,
      description,
      image: options.image ? [options.image] : [],
      datePublished: options.publishedTime || new Date().toISOString(),
      dateModified: options.modifiedTime || options.publishedTime || new Date().toISOString(),
      author: {
        '@type': 'Person',
        name: options.author || 'NFSI Safety Faculty',
      },
      publisher: {
        '@type': 'Organization',
        name: siteName,
        url: typeof window !== 'undefined' ? window.location.origin : '',
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': currentUrl,
      },
      articleSection: options.category || 'Safety',
      keywords: keywords,
    };
    setJsonLd(blogPostingSchema);
  }
}

/**
 * Remove all dynamic SEO tags and reset title when unmounting view
 */
export function resetMetaTags(defaultTitle = 'HSEdx') {
  if (typeof document === 'undefined') return;

  document.title = defaultTitle;

  // Remove dynamic meta tags
  const dynamicElements = document.head.querySelectorAll('[data-dynamic-seo="true"]');
  dynamicElements.forEach((el) => el.remove());

  // Reset basic meta tags if needed
  setMetaTag('name', 'description', 'NFSI HSEdx - Health, Safety, Environment and Industrial Safety Training');
  setMetaTag('name', 'keywords', 'fire safety, industrial safety, occupational health, HSE, safety certification');
  setMetaTag('name', 'robots', 'index, follow');
}
