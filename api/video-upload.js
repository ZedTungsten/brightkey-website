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

  const BUNNY_STREAM_LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || '665295';
  const BUNNY_STREAM_API_KEY = process.env.BUNNY_STREAM_API_KEY || '1856adaf-cb43-44fd-ae053c7cddb5-8bce-4abb';

  try {
    const { fileBase64, title } = req.body;

    if (!fileBase64 || !title) {
      return res.status(400).json({ error: 'Missing fileBase64 or title.' });
    }

    const base64Data = fileBase64.replace(/^data:video\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 1. Create the video entry in Bunny Stream Library
    const createUrl = `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json'
      },
      body: JSON.stringify({ title })
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      throw new Error(`Failed to create video placeholder: ${errText}`);
    }

    const createData = await createResponse.json();
    const videoId = createData.guid; // Guid matches video ID

    // 2. Upload the raw video stream content
    const uploadUrl = `https://video.bunnycdn.com/library/${BUNNY_STREAM_LIBRARY_ID}/videos/${videoId}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': BUNNY_STREAM_API_KEY,
        'Content-Type': 'application/octet-stream'
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`Failed to upload video data: ${errText}`);
    }

    // Return the secure embed details
    const embedUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_STREAM_LIBRARY_ID}/${videoId}`;

    return res.status(200).json({
      success: true,
      videoId,
      embedUrl,
      directPlayUrl: `https://iframe.mediadelivery.net/play/${BUNNY_STREAM_LIBRARY_ID}/${videoId}`
    });

  } catch (error) {
    console.error('Bunny Stream Upload Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during video upload.' });
  }
}
