import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Create admin client to bypass RLS policies during uploads
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { fileBase64, title } = req.body;

    if (!fileBase64 || !title) {
      return res.status(400).json({ error: 'Missing fileBase64 or title.' });
    }

    // Extract content type and clean up base64 prefix
    const hasPrefix = fileBase64.includes(';base64,');
    let contentType = 'video/mp4'; // default fallback
    if (hasPrefix) {
      const match = fileBase64.match(/^data:(.*?);base64,/);
      if (match) contentType = match[1];
    }
    const base64Data = hasPrefix ? fileBase64.split(';base64,').pop() : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    // Enforce 50MB size limit for videos
    const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
    if (buffer.length > MAX_VIDEO_SIZE) {
      return res.status(400).json({ error: 'Video file size exceeds the 50MB limit.' });
    }

    // Clean safe filename from title
    const safeTitle = title.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const extension = contentType.split('/').pop() || 'mp4';
    const fileName = safeTitle.endsWith(`.${extension}`) ? safeTitle : `${safeTitle}.${extension}`;

    const bucketName = 'brightkey-assets';
    const filePath = `videos/${Date.now()}_${fileName}`;

    // Upload video file directly to Supabase storage bucket under 'videos/' folder
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: contentType,
        upsert: true
      });

    if (error) {
      throw error;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${filePath}`;

    return res.status(200).json({
      success: true,
      videoId: filePath,
      embedUrl: publicUrl,
      directPlayUrl: publicUrl
    });

  } catch (error) {
    console.error('Supabase Video Upload Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during video upload.' });
  }
}
