import { describe, it, expect } from 'vitest';
import { acceptedMimeTypes } from '../../src/modules/media/media.service';
import { createBlogSchema, updateBlogSchema } from '../../src/modules/blogs/blogs.validation';

describe('Security Audit Fixes & Regressions', () => {
  describe('File Upload Security & MIME Allowlist', () => {
    it('only contains safe, approved media types in acceptedMimeTypes', () => {
      // Must not allow executable or HTML/SVG types
      expect(acceptedMimeTypes).not.toContain('text/html');
      expect(acceptedMimeTypes).not.toContain('image/svg+xml');
      expect(acceptedMimeTypes).not.toContain('application/javascript');
      expect(acceptedMimeTypes).not.toContain('application/x-php');
      expect(acceptedMimeTypes).not.toContain('application/octet-stream');

      // Must allow legitimate media types
      expect(acceptedMimeTypes).toContain('image/jpeg');
      expect(acceptedMimeTypes).toContain('image/png');
      expect(acceptedMimeTypes).toContain('image/webp');
      expect(acceptedMimeTypes).toContain('application/pdf');
      expect(acceptedMimeTypes).toContain('video/mp4');
    });
  });

  describe('Blog Module Validation & Authorization Guards', () => {
    it('validates blog post creation correctly and requires title, slug, content', () => {
      const invalid = createBlogSchema.safeParse({});
      expect(invalid.success).toBe(false);

      const valid = createBlogSchema.safeParse({
        title: 'Industrial Fire Safety Protocols 2026',
        slug: 'industrial-fire-safety-protocols-2026',
        summary: 'A comprehensive guide to fire safety in factories.',
        content: '<p>Always keep fire extinguishers accessible.</p>',
        category: 'Fire Fighting',
        status: 'published',
      });
      expect(valid.success).toBe(true);
    });

    it('rejects invalid or malformed slugs in blog posts', () => {
      const invalidSlug = createBlogSchema.safeParse({
        title: 'Bad Slug Article',
        slug: 'invalid slug with spaces!',
        content: '<p>Content</p>',
      });
      expect(invalidSlug.success).toBe(false);
    });

    it('supports draft and published statuses only', () => {
      const badStatus = createBlogSchema.safeParse({
        title: 'Status Test',
        slug: 'status-test',
        content: '<p>Content</p>',
        status: 'archived_invalid',
      });
      expect(badStatus.success).toBe(false);

      const goodDraft = createBlogSchema.safeParse({
        title: 'Draft Test',
        slug: 'draft-test',
        content: '<p>Content</p>',
        status: 'draft',
      });
      expect(goodDraft.success).toBe(true);
    });

    it('allows partial updates through updateBlogSchema', () => {
      const update = updateBlogSchema.safeParse({
        title: 'Updated Title',
        status: 'published',
      });
      expect(update.success).toBe(true);
    });
  });
});
