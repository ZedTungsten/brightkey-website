import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { event_id, attendee_id } = req.query;

  if (event_id && attendee_id) {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Record open event
      await supabase
        .from('company_event_attendees')
        .update({ opened: true })
        .eq('event_id', event_id)
        .eq('employee_id', attendee_id);
    } catch (e) {
      console.error('Error tracking open pixel:', e);
    }
  }

  // Respond with a 1x1 transparent GIF
  const pixelBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const pixelBuffer = Buffer.from(pixelBase64, 'base64');

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', pixelBuffer.length);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.status(200).send(pixelBuffer);
}
