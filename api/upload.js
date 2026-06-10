import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Create admin client to bypass RLS policies during uploads
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // Allow requests from localhost and production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { fileBase64, fileName, category, refId, type, companyId } = req.body;

    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'Missing fileBase64 or fileName.' });
    }

    // Clean up base64 prefix and extract content type
    const hasPrefix = fileBase64.includes(';base64,');
    let contentType = 'application/octet-stream';
    if (hasPrefix) {
      const match = fileBase64.match(/^data:(.*?);base64,/);
      if (match) contentType = match[1];
    }
    const base64Data = hasPrefix ? fileBase64.split(';base64,').pop() : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    // Clean file name to prevent directory traversal
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const safeRefId = (refId || 'general').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const safeCompanyId = (companyId || 'general').replace(/[^a-zA-Z0-9.\-_]/g, '_');

    // Organize folder layout dynamically based on categorizations (scoped per company)
    let folderPath = '';
    const prefix = `companies/${safeCompanyId}`;
    if (category === 'products') {
      folderPath = `${prefix}/products/${safeRefId}`;
    } else if (category === 'installations') {
      if (type === 'site') {
        folderPath = `${prefix}/installations/${safeRefId}/site`;
      } else if (type === 'doors') {
        folderPath = `${prefix}/installations/${safeRefId}/doors`;
      } else if (type === 'proof') {
        folderPath = `${prefix}/installations/${safeRefId}/proof`;
      } else if (type === 'receipt') {
        folderPath = `${prefix}/installations/${safeRefId}/receipt`;
      } else {
        folderPath = `${prefix}/installations/${safeRefId}`;
      }
    } else if (category === 'employees') {
      if (type === 'photo') {
        folderPath = `${prefix}/employees/${safeRefId}/photo`;
      } else if (type === 'govid') {
        folderPath = `${prefix}/employees/${safeRefId}/govid`;
      } else if (type === 'cv') {
        folderPath = `${prefix}/employees/${safeRefId}/cv`;
      } else if (type === 'id') {
        folderPath = `${prefix}/employees/${safeRefId}/id`;
      } else {
        folderPath = `${prefix}/employees/${safeRefId}`;
      }
    } else if (category === 'logos') {
      folderPath = `${prefix}/logos`;
    } else {
      folderPath = `${prefix}/uploads/general`;
    }

    const bucketName = 'brightkey-assets';
    const filePath = `${folderPath}/${safeFileName}`;

    // Upload buffer directly to Supabase storage bucket
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: contentType,
        upsert: true
      });

    if (error) {
      throw error;
    }

    // Construct the public access URL
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${filePath}`;

    return res.status(200).json({
      success: true,
      url: publicUrl,
      path: filePath
    });

  } catch (error) {
    console.error('Supabase Storage Upload Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during upload.' });
  }
}
