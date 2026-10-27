import { Request, Response } from 'express';
import { ok, created } from '../../core/http/envelope';
import { AppError } from '../../core/http/AppError';
import { validated } from '../../core/validation/validate';
import * as service from './blogs.service';
import { CreateBlogInput, ListBlogQuery, UpdateBlogInput } from './blogs.validation';

const auth = (req: Request) => {
  if (!req.auth) throw AppError.unauthorized();
  return req.auth;
};

export async function listPublic(req: Request, res: Response) {
  const query = (req.query as unknown) as ListBlogQuery;
  const result = await service.listPublicBlogs({
    page: Number(query.page || 1),
    limit: Number(query.limit || 12),
    search: typeof query.search === 'string' ? query.search : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
  });
  return ok(res, result.rows, {
    total: result.total,
    page: Number(query.page || 1),
    limit: Number(query.limit || 12),
  });
}

export async function getPublicDetail(req: Request, res: Response) {
  const post = await service.getPublicBlogDetail(req.params.slug);
  return ok(res, post);
}

export async function listCategories(_req: Request, res: Response) {
  const categories = await service.listCategories();
  return ok(res, categories);
}

export async function listAdmin(req: Request, res: Response) {
  const query = (req.query as unknown) as ListBlogQuery;
  const result = await service.listAdminBlogs({
    page: Number(query.page || 1),
    limit: Number(query.limit || 10),
    search: typeof query.search === 'string' ? query.search : undefined,
    category: typeof query.category === 'string' ? query.category : undefined,
    status: typeof query.status === 'string' ? (query.status as any) : undefined,
  });
  return ok(res, result.rows, {
    total: result.total,
    page: Number(query.page || 1),
    limit: Number(query.limit || 10),
  });
}

export async function getAdminDetail(req: Request, res: Response) {
  const post = await service.getAdminBlogDetail(req.params.id);
  return ok(res, post);
}

export async function createAdmin(req: Request, res: Response) {
  const input = validated<CreateBlogInput>(req);
  const post = await service.createAdminBlog(auth(req), input);
  return created(res, post);
}

export async function updateAdmin(req: Request, res: Response) {
  const input = validated<UpdateBlogInput>(req);
  const post = await service.updateAdminBlog(req.params.id, input);
  return ok(res, post);
}

export async function deleteAdmin(req: Request, res: Response) {
  await service.deleteAdminBlog(req.params.id);
  return ok(res, { success: true });
}

export async function renderBlogSocialPreview(req: Request, res: Response) {
  try {
    const post = await service.getPublicBlogDetail(req.params.slug);
    if (!post) {
      return res.redirect('/blog');
    }

    const host = req.get('x-forwarded-host') || req.get('host') || 'hsedx.nfsi.in';
    const proto = req.get('x-forwarded-proto') || 'https';
    const appOrigin = `${proto}://${host}`;
    const articleUrl = `${appOrigin}/blog/${encodeURIComponent(post.slug)}`;

    let imageUrl = post.cover_image_url || `${appOrigin}/img/logo.png`;
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = `${appOrigin}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }

    const cleanSummary = (post.summary || post.content || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);

    const escapeHtml = (str: string) =>
      str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const escapedTitle = escapeHtml(post.title);
    const escapedSummary = escapeHtml(cleanSummary);
    const escapedImage = escapeHtml(imageUrl);
    const escapedUrl = escapeHtml(articleUrl);

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapedTitle} · HSEdx</title>
  <meta name="description" content="${escapedSummary}">
  <link rel="canonical" href="${escapedUrl}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="HSEdx · National Fire &amp; Safety">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedSummary}">
  <meta property="og:image" content="${escapedImage}">
  <meta property="og:image:secure_url" content="${escapedImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapedUrl}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedSummary}">
  <meta name="twitter:image" content="${escapedImage}">

  <!-- Fast redirect for normal browsers -->
  <meta http-equiv="refresh" content="0;url=/blog/${encodeURIComponent(post.slug)}">
</head>
<body>
  <p>Redirecting to <a href="${escapedUrl}">${escapedTitle}</a>...</p>
  <script>window.location.replace('/blog/' + encodeURIComponent(${JSON.stringify(post.slug)}));</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (_err) {
    return res.redirect('/blog');
  }
}
