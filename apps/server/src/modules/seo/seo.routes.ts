import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';

const router = Router();

/**
 * GET /share/places/:slug
 * Trả về HTML tối ưu SEO / OpenGraph cho bot mạng xã hội và web crawler
 * CHỈ phục vụ từ dữ liệu quán ĐÃ XUẤT BẢN (PUBLISHED)
 */
router.get('/share/places/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    const projection = await prisma.placePublishedProjection.findFirst({
      where: { slug },
      include: {
        publishedRevision: { select: { snapshotData: true } },
      },
    });

    if (!projection) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <title>Địa điểm không tồn tại - SSG</title>
        </head>
        <body>
          <h1>404 - Địa điểm không tồn tại hoặc chưa được xuất bản</h1>
        </body>
        </html>
      `);
    }

    const snap = projection.publishedRevision?.snapshotData as any;
    const title = `${projection.name} - Không gian học tập sinh viên | SSG`;
    const description = snap?.address ? `Khám phá ${projection.name} tại ${snap.address}. Đánh giá: ${projection.ratingOverall}/5 (${projection.reviewCount} đánh giá).` : `Khám phá ${projection.name} trên nền tảng SSG.`;
    const canonicalUrl = `${clientUrl}/places/${projection.slug}`;
    const coverPhoto = snap?.gallery?.find((g: any) => g.isCover)?.url || snap?.gallery?.[0]?.url || `${clientUrl}/og-default.png`;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'CafeOrCoffeeShop',
      name: projection.name,
      url: canonicalUrl,
      image: coverPhoto,
      address: snap?.address || '',
      priceRange: projection.priceMin && projection.priceMax ? `${projection.priceMin} - ${projection.priceMax} VND` : undefined,
      aggregateRating: projection.reviewCount > 0 ? {
        '@type': 'AggregateRating',
        ratingValue: projection.ratingOverall,
        reviewCount: projection.reviewCount,
      } : undefined,
    };

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl}">
  
  <!-- OpenGraph / Facebook -->
  <meta property="og:type" content="place">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${coverPhoto}">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${coverPhoto}">

  <!-- Structured Data JSON-LD -->
  <script type="application/ld+json">
    ${JSON.stringify(jsonLd)}
  </script>
</head>
<body>
  <h1>${escapeHtml(projection.name)}</h1>
  <p>${escapeHtml(description)}</p>
  <p><a href="${canonicalUrl}">Xem chi tiết trên ứng dụng SSG</a></p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /sitemap.xml
 * Sinh sitemap XML động cho toàn bộ quán đã xuất bản
 */
router.get('/sitemap.xml', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const places = await prisma.placePublishedProjection.findMany({
      select: { slug: true, updatedAt: true },
    });

    const urls = places.map((p) => `
  <url>
    <loc>${clientUrl}/places/${p.slug}</loc>
    <lastmod>${p.updatedAt.toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${clientUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /robots.txt
 */
router.get('/robots.txt', (_req: Request, res: Response) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const robots = `User-agent: *\nAllow: /\nSitemap: ${clientUrl}/sitemap.xml\n`;
  res.setHeader('Content-Type', 'text/plain');
  return res.send(robots);
});

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default router;
