import { readFile } from 'node:fs/promises';
import { createPublicClient } from '../lib/api/security.js';

const COMPANY_ID = 'e6cf43ed-1f42-4aad-a6ed-470147a0489f';
const CODE_PATTERN = /^[A-Za-z0-9_-]{5}$/;
const SITE_ORIGIN = 'https://www.brightkeysolutions.com';
const FALLBACK_IMAGE = `${SITE_ORIGIN}/assets/og-image.png?v=2`;
const TEMPLATE_PATH = new URL('../careers/job-template.html', import.meta.url);

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function absoluteUrl(value, fallback) {
  try {
    return new URL(String(value || ''), SITE_ORIGIN).href;
  } catch {
    return fallback;
  }
}

function cleanDescription(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function buildMetadata({ title, description, image, canonicalUrl }) {
  const safeTitle = escapeAttribute(title);
  const safeDescription = escapeAttribute(description);
  const safeImage = escapeAttribute(image);
  const safeCanonicalUrl = escapeAttribute(canonicalUrl);

  return [
    `  <meta name="description" content="${safeDescription}" />`,
    `  <title>${safeTitle}</title>`,
    `  <link rel="canonical" href="${safeCanonicalUrl}" />`,
    '  <meta property="og:type" content="website" />',
    `  <meta property="og:url" content="${safeCanonicalUrl}" />`,
    `  <meta property="og:title" content="${safeTitle}" />`,
    `  <meta property="og:description" content="${safeDescription}" />`,
    `  <meta property="og:image" content="${safeImage}" />`,
    `  <meta property="og:image:secure_url" content="${safeImage}" />`,
    `  <meta property="og:image:alt" content="${safeTitle}" />`,
    '  <meta name="twitter:card" content="summary_large_image" />',
    `  <meta name="twitter:title" content="${safeTitle}" />`,
    `  <meta name="twitter:description" content="${safeDescription}" />`,
    `  <meta name="twitter:image" content="${safeImage}" />`
  ].join('\n');
}

function injectMetadata(template, metadata) {
  return template.replace(
    / {2}<meta name="description"[\s\S]*? {2}<meta property="og:image"[^>]*\/>/,
    metadata
  );
}

async function loadPublicJob(supabase, code) {
  const [jobResult, templateResult] = await Promise.all([
    supabase.rpc('get_public_job_post', {
      p_company_id: COMPANY_ID,
      p_public_code: code
    }),
    supabase.rpc('get_public_job_post_template', {
      p_company_id: COMPANY_ID,
      p_public_code: code
    })
  ]);

  if (jobResult.error) throw jobResult.error;
  if (templateResult.error) throw templateResult.error;

  return {
    job: Array.isArray(jobResult.data) ? jobResult.data[0] : null,
    template: Array.isArray(templateResult.data) ? templateResult.data[0] : null
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method not allowed');
  }

  const code = String(req.query.code || '').trim();
  if (!CODE_PATTERN.test(code)) {
    return res.status(404).send('Job opening not found');
  }

  try {
    const [template, publicJob] = await Promise.all([
      readFile(TEMPLATE_PATH, 'utf8'),
      loadPublicJob(createPublicClient(), code)
    ]);

    if (!publicJob.job) {
      return res.status(404).send('Job opening not found');
    }

    const title = String(publicJob.job.job_title || 'Job Opening').trim();
    const description = cleanDescription(publicJob.job.job_description)
      || 'View this open role at Brightkey.';
    const image = absoluteUrl(publicJob.template?.header_image_url, FALLBACK_IMAGE);
    const canonicalUrl = `${SITE_ORIGIN}/careers/${encodeURIComponent(code)}`;
    const html = injectMetadata(
      template,
      buildMetadata({ title, description, image, canonicalUrl })
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).send(req.method === 'HEAD' ? '' : html);
  } catch (error) {
    console.error('Career page rendering failed:', error);
    return res.status(500).send('This job opening is temporarily unavailable.');
  }
}
