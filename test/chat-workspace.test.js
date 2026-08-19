import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

test('chat migration generalizes threads without destructive data operations', async () => {
  const sql = await read('database/migrations/07_optimizations.sql');
  assert.match(sql, /thread_type IN \('direct', 'group', 'company'\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_chat_workspace_inbox/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_group_chat/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.send_chat_thread_message/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_chat_thread_member/);
  assert.match(sql, /ALTER POLICY "Members can read generalized chat threads"/);
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(sql, /company\.tenant_id IN \(SELECT public\.get_user_tenants/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.send_chat_thread_message/);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
});

test('messages route uses bounded cursor loading and private scoped channels', async () => {
  const [html, js, css, sidebar] = await Promise.all([
    read('dashboard/messages.html'), read('dashboard/messages.js'),
    read('dashboard/messages.css'), read('js/sidebar.js')
  ]);
  assert.match(html, /href="\/dashboard\/messages\.css(?:\?[^" ]+)?"/);
  assert.match(html, /src="\/dashboard\/messages\.js(?:\?[^" ]+)?"/);
  assert.match(js, /p_limit: 30/);
  assert.match(js, /private: true/);
  assert.match(js, /removeChannel\(state\.activeChannel\)/);
  assert.match(js, /employment_status === 'Active'/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|innerHTML\s*=\s*`/);
  assert.match(css, /100dvh/);
  assert.match(sidebar, /href="\/dashboard\/messages"/);
});

test('chat images are private JPEG attachments with bounded client compression', async () => {
  const [sql, html, js] = await Promise.all([
    read('database/migrations/07_optimizations.sql'),
    read('dashboard/messages.html'), read('dashboard/messages.js')
  ]);
  assert.match(sql, /'chat-media', 'chat-media', false, 5242880/);
  assert.match(sql, /allowed_mime_types = ARRAY\['image\/jpeg'\]/);
  assert.match(sql, /public\.can_access_chat_media/);
  assert.match(sql, /CREATE POLICY "Chat members can read chat media"/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.send_chat_thread_message_v2/);
  assert.doesNotMatch(sql, /\b(?:DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
  assert.match(html, /id="image-input" type="file" accept="image\/\*"/);
  assert.match(js, /canvas\.toBlob\(resolve, 'image\/jpeg', 0\.8\)/);
  assert.match(js, /MAX_IMAGE_EDGE = 1920/);
  assert.match(js, /MAX_UPLOAD_BYTES = 5 \* 1024 \* 1024/);
  assert.match(js, /storage\.from\(CHAT_BUCKET\)\.createSignedUrls/);
  assert.doesNotMatch(js, /getPublicUrl/);
});
