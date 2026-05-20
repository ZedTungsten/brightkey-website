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

  const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || 'brightkey-assets';
  const BUNNY_STORAGE_KEY = process.env.BUNNY_STORAGE_KEY || 'e0b6fd97-bf74-4ed4-9f815a6fcf6d-19ad-4eef';
  const BUNNY_PULL_ZONE = process.env.BUNNY_PULL_ZONE || 'brightkey-assets.b-cdn.net';

  try {
    const { fileBase64, fileName, category, refId, type } = req.body;

    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'Missing fileBase64 or fileName.' });
    }

    // Clean up base64 prefix
    const base64Data = fileBase64.includes(';base64,') ? fileBase64.split(';base64,').pop() : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    // Clean file name to prevent directory traversal
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const safeRefId = (refId || 'general').replace(/[^a-zA-Z0-9.\-_]/g, '_');

    // Organize folder layout dynamically based on categorizations
    let folderPath = '';
    if (category === 'products') {
      folderPath = `products/${safeRefId}`;
    } else if (category === 'installations') {
      if (type === 'site') {
        folderPath = `installations/${safeRefId}/site`;
      } else if (type === 'doors') {
        folderPath = `installations/${safeRefId}/doors`;
      } else if (type === 'proof') {
        folderPath = `installations/${safeRefId}/proof`;
      } else if (type === 'receipt') {
        folderPath = `installations/${safeRefId}/receipt`;
      } else {
        folderPath = `installations/${safeRefId}`;
      }
    } else if (category === 'employees') {
      folderPath = `employees/${safeRefId}`;
    } else {
      folderPath = `uploads/general`;
    }

    const bunnyUrl = `https://sg.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${folderPath}/${safeFileName}`;

    const response = await fetch(bunnyUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_STORAGE_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bunny.net returned status ${response.status}: ${errText}`);
    }

    // Return the clean cached Pull Zone CDN delivery URL
    const publicUrl = `https://${BUNNY_PULL_ZONE}/${folderPath}/${safeFileName}`;

    return res.status(200).json({
      success: true,
      url: publicUrl,
      path: `${folderPath}/${safeFileName}`
    });

  } catch (error) {
    console.error('Bunny Storage Upload Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during upload.' });
  }
}
