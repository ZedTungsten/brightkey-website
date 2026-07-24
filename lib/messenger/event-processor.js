import { createHash } from 'node:crypto';
import { createMessengerDatabase } from './database.js';
import { logMessengerError } from './logger.js';

function eventIdentity(pageId, event) {
  const source = event.message?.mid
    || event.postback?.mid
    || `${event.sender?.id || 'unknown'}:${event.timestamp || 'unknown'}:${JSON.stringify(event)}`;
  return createHash('sha256').update(`${pageId}:${source}`).digest('hex');
}

function eventType(event) {
  if (event.message) return event.message.is_echo ? 'message_echo' : 'message';
  if (event.postback) return 'postback';
  if (event.delivery) return 'delivery';
  if (event.read) return 'read';
  return 'unknown';
}

async function storeMessage(database, account, event, webhookEventId) {
  if (!event.message || event.message.is_echo || !event.sender?.id) return;

  const { data: contact, error: contactError } = await database
    .from('meta_messenger_contacts')
    .upsert({
      company_id: account.company_id,
      messenger_account_id: account.id,
      psid: event.sender.id,
      last_seen_at: new Date(event.timestamp || Date.now()).toISOString()
    }, { onConflict: 'messenger_account_id,psid' })
    .select('id')
    .single();
  if (contactError) throw contactError;

  const { data: conversation, error: conversationError } = await database
    .from('meta_messenger_conversations')
    .upsert({
      company_id: account.company_id,
      messenger_account_id: account.id,
      contact_id: contact.id,
      last_message_at: new Date(event.timestamp || Date.now()).toISOString()
    }, { onConflict: 'messenger_account_id,contact_id' })
    .select('id')
    .single();
  if (conversationError) throw conversationError;

  const { error: messageError } = await database
    .from('meta_messenger_messages')
    .upsert({
      company_id: account.company_id,
      conversation_id: conversation.id,
      webhook_event_id: webhookEventId,
      meta_message_id: event.message.mid,
      direction: 'inbound',
      message_type: event.message.attachments?.length ? 'attachment' : 'text',
      text: event.message.text || null,
      attachments: event.message.attachments || [],
      sent_at: new Date(event.timestamp || Date.now()).toISOString()
    }, { onConflict: 'meta_message_id' });
  if (messageError) throw messageError;
}

export async function processMessengerWebhook(payload, options = {}) {
  if (!Array.isArray(payload.entry) || payload.entry.length === 0) return;

  const database = options.database || createMessengerDatabase();
  if (!database) throw new Error('Messenger database is not configured');

  for (const entry of payload.entry || []) {
    const pageId = String(entry.id || '');
    if (!pageId) continue;

    const { data: account, error: accountError } = await database
      .from('meta_messenger_accounts')
      .select('id,company_id')
      .eq('page_id', pageId)
      .eq('status', 'active')
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) continue;

    for (const event of entry.messaging || []) {
      try {
        const { data: storedEvent, error: eventError } = await database
          .from('meta_messenger_webhook_events')
          .upsert({
            company_id: account.company_id,
            messenger_account_id: account.id,
            event_key: eventIdentity(pageId, event),
            event_type: eventType(event),
            payload: event,
            status: 'processing'
          }, { onConflict: 'event_key', ignoreDuplicates: true })
          .select('id,status')
          .maybeSingle();
        if (eventError) throw eventError;
        if (!storedEvent || storedEvent.status === 'processed') continue;

        await storeMessage(database, account, event, storedEvent.id);
        const { error: updateError } = await database
          .from('meta_messenger_webhook_events')
          .update({ status: 'processed', processed_at: new Date().toISOString(), error_message: null })
          .eq('id', storedEvent.id);
        if (updateError) throw updateError;
      } catch (error) {
        logMessengerError('event_processing_failed', error, {
          pageId,
          eventType: eventType(event),
          messageId: event.message?.mid
        });
      }
    }
  }
}
