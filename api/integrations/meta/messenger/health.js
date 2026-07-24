import { getMessengerConfigStatus } from '../../../../lib/messenger/config.js';
import { checkMessengerDatabase, createMessengerDatabase } from '../../../../lib/messenger/database.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const environment = getMessengerConfigStatus();
  const database = await checkMessengerDatabase(createMessengerDatabase());
  const healthy = environment.configured && database.connected;

  return res.status(healthy ? 200 : 503).json({
    service: 'meta-messenger',
    status: healthy ? 'healthy' : 'degraded',
    environment: {
      configured: environment.configured,
      missing: environment.missing
    },
    database,
    graphApiVersion: environment.graphApiVersion
  });
}
