(function () {
  'use strict';

  const state = {
    user: null, companyId: null, employeeId: null, employees: [], inbox: [],
    activeThread: null, activeChannel: null, companyChannel: null,
    cursor: null, hasMore: true, loading: false, filter: 'all', search: '',
    pendingImage: null, attachmentUrls: new Map()
  };
  const CHAT_BUCKET = 'chat-media';
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 1920;
  const el = id => document.getElementById(id);
  const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const safeImage = value => {
    const source = String(value || '').trim();
    if (/^https:\/\/[^\s]+$/i.test(source)) return source;
    if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
    return '';
  };
  const safeAttachmentImage = value => {
    const source = safeImage(value); if (source) return source;
    const candidate = String(value || '');
    return candidate.startsWith('blob:') && [...state.attachmentUrls.values()].includes(candidate) ? candidate : '';
  };
  function setAvatar(node, name, picture) {
    node.textContent = initials(name);
    const source = safeImage(picture);
    node.style.backgroundImage = source ? `url("${source.replace(/"/g, '%22')}")` : 'none';
    if (source) node.textContent = '';
  }
  function friendlyError(error, fallback) {
    console.error(error);
    return fallback;
  }
  function showToast(message, danger = false) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = danger ? 'var(--danger, #ef4444)' : 'var(--success, #22c55e)';
    toast.textContent = message;
    el('toast-container').appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 180); }, 2600);
  }
  function openModal(id) {
    const modal = el(id); modal.style.display = 'flex'; modal.offsetHeight; modal.classList.add('open');
  }
  function closeModal(id) {
    const modal = el(id); modal.classList.remove('open'); setTimeout(() => { modal.style.display = 'none'; }, 150);
  }
  function formatRelative(value) {
    if (!value) return '';
    const date = new Date(value); const now = new Date(); const diff = now - date;
    if (diff < 86400000 && date.getDate() === now.getDate()) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function threadIcon(type) { return type === 'company' ? 'C' : type === 'group' ? 'G' : 'D'; }
  const canvasBlob = canvas => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  async function decodeImage(file) {
    if ('createImageBitmap' in window) return createImageBitmap(file, { imageOrientation: 'from-image' });
    const url = URL.createObjectURL(file); const image = new Image(); image.decoding = 'async'; image.src = url;
    try { await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
  }
  async function compressImage(file) {
    if (!file?.type.startsWith('image/')) throw new Error('Choose an image file.');
    if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose an image smaller than 20 MB.');
    let source;
    try { source = await decodeImage(file); } catch { throw new Error('This image format cannot be opened. Try JPEG, PNG, or WebP.'); }
    const sourceWidth = source.width || source.naturalWidth; const sourceHeight = source.height || source.naturalHeight;
    if (!sourceWidth || !sourceHeight || sourceWidth * sourceHeight > 40000000) { source.close?.(); throw new Error('This image is too large to process safely.'); }
    let scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight)); let result;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const width = Math.max(1, Math.round(sourceWidth * scale)); const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false }); context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); context.drawImage(source, 0, 0, width, height);
      const blob = await canvasBlob(canvas); if (!blob) { source.close?.(); throw new Error('The image could not be converted.'); }
      result = { blob, width, height }; if (blob.size <= MAX_UPLOAD_BYTES) break; scale *= 0.8;
    }
    source.close?.(); if (result.blob.size > MAX_UPLOAD_BYTES) throw new Error('The compressed image is still larger than 5 MB.');
    return result;
  }
  async function signImages(messages) {
    const paths = [...new Set(messages.map(message => message.attachment_path).filter(path => path && !state.attachmentUrls.has(path)))];
    if (paths.length) {
      const { data, error } = await window.BKAuth.sb.storage.from(CHAT_BUCKET).createSignedUrls(paths, 3600);
      if (error) console.error('Chat images could not be signed:', error);
      (data || []).forEach(item => { if (item.signedUrl) state.attachmentUrls.set(item.path, item.signedUrl); });
    }
    messages.forEach(message => { message.attachment_url = state.attachmentUrls.get(message.attachment_path) || ''; });
  }

  async function loadInbox(silent = false) {
    if (!silent) el('conversation-list').innerHTML = '<div class="conversation-skeleton"><i></i><i></i><i></i><i></i></div>';
    const { data, error } = await window.BKAuth.sb.rpc('get_chat_workspace_inbox');
    if (error) {
      el('conversation-list').textContent = friendlyError(error, 'Messages could not be loaded. Refresh and try again.');
      return;
    }
    state.inbox = data || [];
    renderInbox();
    if (state.activeThread) {
      const updated = state.inbox.find(thread => thread.thread_id === state.activeThread.thread_id);
      if (updated) state.activeThread = updated;
    }
  }
  function renderInbox() {
    const list = el('conversation-list'); list.replaceChildren();
    const query = state.search.toLowerCase();
    const threads = state.inbox.filter(thread =>
      (state.filter === 'all' || thread.thread_type === state.filter || (state.filter === 'group' && thread.thread_type === 'company')) &&
      (!query || String(thread.display_name || '').toLowerCase().includes(query))
    );
    if (!threads.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:2rem 1rem;text-align:center;color:var(--text-muted);font-size:.75rem;';
      empty.textContent = state.search ? 'No matching conversations.' : 'No conversations yet.';
      list.appendChild(empty); return;
    }
    threads.forEach(thread => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'conversation-item';
      if (thread.thread_id === state.activeThread?.thread_id) button.classList.add('active');
      const avatar = document.createElement('div'); avatar.className = 'conversation-avatar';
      setAvatar(avatar, thread.thread_type === 'direct' ? thread.display_name : threadIcon(thread.thread_type), thread.picture_link);
      const copy = document.createElement('div'); copy.className = 'conversation-copy';
      const line = document.createElement('div'); line.className = 'conversation-title-line';
      const title = document.createElement('span'); title.className = 'conversation-title'; title.textContent = thread.display_name;
      const type = document.createElement('span'); type.className = 'thread-type'; type.textContent = thread.thread_type;
      line.append(title, type);
      const preview = document.createElement('div'); preview.className = 'conversation-preview'; preview.textContent = thread.last_message_preview || 'No messages yet';
      copy.append(line, preview);
      const meta = document.createElement('div'); meta.className = 'conversation-meta';
      const time = document.createElement('span'); time.textContent = formatRelative(thread.last_message_at); meta.appendChild(time);
      if (thread.unread_count > 0) { const badge = document.createElement('span'); badge.className = 'unread-badge'; badge.textContent = thread.unread_count > 99 ? '99+' : thread.unread_count; meta.appendChild(badge); }
      button.append(avatar, copy, meta); button.onclick = () => selectThread(thread); list.appendChild(button);
    });
  }

  async function selectThread(thread) {
    clearPendingImage();
    state.activeThread = thread; state.cursor = null; state.hasMore = true;
    renderInbox(); el('message-empty').hidden = true; el('message-workspace').hidden = false;
    document.querySelector('.messages-shell').classList.add('thread-open');
    el('thread-name').textContent = thread.display_name;
    el('thread-members').textContent = thread.thread_type === 'direct' ? 'Direct message' : `${thread.member_count} members`;
    setAvatar(el('thread-avatar'), thread.thread_type === 'direct' ? thread.display_name : threadIcon(thread.thread_type), thread.picture_link);
    await subscribeThread(thread.thread_id);
    await loadMessages(false);
    await window.BKAuth.sb.rpc('mark_chat_thread_read', { p_thread_id: thread.thread_id });
    thread.unread_count = 0; renderInbox();
  }
  async function subscribeThread(threadId) {
    if (state.activeChannel) await window.BKAuth.sb.removeChannel(state.activeChannel);
    await window.BKAuth.sb.realtime.setAuth();
    state.activeChannel = window.BKAuth.sb.channel(`thread:${threadId}:chat`, { config: { private: true } })
      .on('broadcast', { event: 'chat_message' }, async event => {
        const message = event.payload;
        if (!message || message.thread_id !== state.activeThread?.thread_id) return;
        if (el('message-history').querySelector(`[data-message-id="${message.id}"]`)) return;
        const sender = state.employees.find(employee => employee.id === message.sender_id);
        await signImages([message]);
        appendMessage({ ...message, sender_name: sender ? `${sender.first_name} ${sender.last_name}` : 'Team member', sender_picture: sender?.picture_link }, true);
        window.BKAuth.sb.rpc('mark_chat_thread_read', { p_thread_id: message.thread_id });
      }).subscribe();
  }
  async function loadMessages(older) {
    if (state.loading || !state.activeThread || (older && !state.hasMore)) return;
    state.loading = true;
    const params = { p_thread_id: state.activeThread.thread_id, p_limit: 30,
      p_before_created_at: older ? state.cursor?.created_at || null : null,
      p_before_id: older ? state.cursor?.id || null : null };
    const { data, error } = await window.BKAuth.sb.rpc('get_chat_thread_messages_v2', params);
    state.loading = false;
    if (error) { showToast(friendlyError(error, 'Messages could not be loaded.'), true); return; }
    const rows = data || []; state.hasMore = rows.length === 30; await signImages(rows);
    if (rows.length) state.cursor = { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id };
    const history = el('message-history');
    if (!older) history.replaceChildren();
    const fragment = document.createDocumentFragment();
    rows.slice().reverse().forEach(message => fragment.appendChild(buildMessage(message)));
    if (older) history.insertBefore(fragment, history.firstChild); else history.appendChild(fragment);
    renderOlderButton(); if (!older) history.scrollTop = history.scrollHeight;
  }
  function renderOlderButton() {
    el('message-history').querySelector('.load-older')?.remove();
    if (!state.hasMore) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'load-older'; button.textContent = 'Load earlier messages'; button.onclick = () => loadMessages(true);
    el('message-history').prepend(button);
  }
  function buildMessage(message) {
    const row = document.createElement('article'); row.className = 'message-row'; row.dataset.messageId = message.id;
    const self = message.sender_id === state.employeeId; if (self) row.classList.add('self');
    if (!self) { const avatar = document.createElement('div'); avatar.className = 'message-sender-avatar'; setAvatar(avatar, message.sender_name, message.sender_picture); row.appendChild(avatar); }
    const bundle = document.createElement('div'); bundle.className = 'message-bundle';
    if (!self && state.activeThread?.thread_type !== 'direct') { const sender = document.createElement('div'); sender.className = 'message-sender'; sender.textContent = message.sender_name; bundle.appendChild(sender); }
    const attachmentSource = safeAttachmentImage(message.attachment_url);
    if (attachmentSource) { const image = document.createElement('img'); image.className = 'message-image'; image.src = attachmentSource; image.alt = 'Chat attachment'; image.loading = 'lazy'; image.width = message.attachment_width || 640; image.height = message.attachment_height || 480; bundle.appendChild(image); }
    if (message.message) { const bubble = document.createElement('div'); bubble.className = 'message-bubble'; bubble.textContent = message.message; bundle.appendChild(bubble); }
    const time = document.createElement('div'); time.className = 'message-time'; time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bundle.appendChild(time); row.appendChild(bundle); return row;
  }
  function appendMessage(message, scroll) {
    const history = el('message-history'); if (history.querySelector(`[data-message-id="${message.id}"]`)) return; history.appendChild(buildMessage(message));
    if (scroll) history.scrollTop = history.scrollHeight;
  }
  async function sendMessage(event) {
    event.preventDefault(); const input = el('message-input'); const message = input.value.trim();
    if ((!message && !state.pendingImage) || !state.activeThread) return; const threadId = state.activeThread.thread_id;
    const submit = el('message-composer').querySelector('button[type="submit"]'); input.disabled = true; submit.disabled = true; el('attach-image').disabled = true;
    let attachmentPath = null; const pending = state.pendingImage;
    if (pending) {
      attachmentPath = `companies/${state.companyId}/chat/${threadId}/${crypto.randomUUID()}.jpg`;
      const upload = await window.BKAuth.sb.storage.from(CHAT_BUCKET).upload(attachmentPath, pending.blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (upload.error) { input.disabled = false; submit.disabled = false; el('attach-image').disabled = false; showToast(friendlyError(upload.error, 'Image upload failed. Try again.'), true); return; }
    }
    const { data, error } = await window.BKAuth.sb.rpc('send_chat_thread_message_v2', {
      p_thread_id: threadId, p_message: message, p_attachment_path: attachmentPath,
      p_attachment_mime: pending ? 'image/jpeg' : null, p_attachment_bytes: pending?.blob.size || null,
      p_attachment_width: pending?.width || null, p_attachment_height: pending?.height || null
    });
    input.disabled = false; submit.disabled = false; el('attach-image').disabled = false;
    if (error) { if (attachmentPath) await window.BKAuth.sb.storage.from(CHAT_BUCKET).remove([attachmentPath]); showToast(friendlyError(error, 'Message could not be sent. Try again.'), true); return; }
    if (attachmentPath) { state.attachmentUrls.set(attachmentPath, pending.previewUrl); data.attachment_url = pending.previewUrl; }
    input.value = ''; input.style.height = ''; clearPendingImage(false);
    const sender = state.employees.find(employee => employee.id === state.employeeId);
    if (state.activeThread?.thread_id === threadId) appendMessage({ ...data, sender_name: sender ? `${sender.first_name} ${sender.last_name}` : 'You', sender_picture: sender?.picture_link }, true);
    loadInbox(true);
  }

  function clearPendingImage(revoke = true) {
    if (revoke && state.pendingImage?.previewUrl) URL.revokeObjectURL(state.pendingImage.previewUrl);
    state.pendingImage = null; el('image-input').value = ''; el('image-preview').hidden = true; el('image-preview-img').removeAttribute('src');
  }
  async function chooseImage(event) {
    const file = event.target.files?.[0]; if (!file) return;
    el('attach-image').disabled = true;
    try {
      const compressed = await compressImage(file); clearPendingImage(); const previewUrl = URL.createObjectURL(compressed.blob);
      state.pendingImage = { ...compressed, previewUrl }; el('image-preview-img').src = previewUrl;
      el('image-preview-meta').textContent = `JPEG · ${(compressed.blob.size / 1024).toFixed(0)} KB`; el('image-preview').hidden = false;
    } catch (error) { clearPendingImage(); showToast(error.message || 'The image could not be prepared.', true); }
    finally { el('attach-image').disabled = false; }
  }

  function renderMemberChoices() {
    const query = el('member-search').value.toLowerCase(); const list = el('group-member-list'); list.replaceChildren();
    state.employees.filter(employee => employee.id !== state.employeeId && employee.employment_status === 'Active' && `${employee.first_name} ${employee.last_name}`.toLowerCase().includes(query)).forEach(employee => {
      const label = document.createElement('label'); label.className = 'member-option';
      const check = document.createElement('input'); check.type = 'checkbox'; check.value = employee.id;
      const avatar = document.createElement('span'); avatar.className = 'member-avatar'; setAvatar(avatar, `${employee.first_name} ${employee.last_name}`, employee.picture_link);
      const name = document.createElement('span'); name.textContent = `${employee.first_name} ${employee.last_name}`;
      label.append(check, avatar, name); list.appendChild(label);
    });
  }
  function openGroupModal() { el('group-name').value = ''; el('member-search').value = ''; el('group-error').textContent = ''; renderMemberChoices(); openModal('group-modal'); }
  async function createGroup() {
    const name = el('group-name').value.trim(); const members = [...el('group-member-list').querySelectorAll('input:checked')].map(input => input.value);
    if (!name) { el('group-error').textContent = 'Enter a group name.'; el('group-name').focus(); return; }
    if (!members.length) { el('group-error').textContent = 'Select at least one team member.'; return; }
    const button = el('create-group'); button.disabled = true;
    const { data, error } = await window.BKAuth.sb.rpc('create_group_chat', { p_name: name, p_member_ids: members });
    button.disabled = false;
    if (error) { el('group-error').textContent = friendlyError(error, 'The group could not be created.'); return; }
    closeModal('group-modal'); await loadInbox(); const thread = state.inbox.find(item => item.thread_id === data); if (thread) selectThread(thread);
  }
  async function showMembers() {
    if (!state.activeThread) return;
    const list = el('members-list'); list.innerHTML = '<div class="message-loading"><span></span>Loading members</div>'; openModal('members-modal');
    const { data, error } = await window.BKAuth.sb.rpc('get_chat_thread_members', { p_thread_id: state.activeThread.thread_id });
    list.replaceChildren();
    if (error) { list.textContent = friendlyError(error, 'Members could not be loaded.'); return; }
    (data || []).forEach(member => { const row = document.createElement('div'); row.className = 'member-row'; const avatar = document.createElement('span'); avatar.className = 'member-avatar'; setAvatar(avatar, member.full_name, member.picture_link); const name = document.createElement('span'); name.textContent = member.full_name; const role = document.createElement('span'); role.className = 'member-role'; role.textContent = member.member_role; row.append(avatar, name, role); list.appendChild(row); });
  }
  async function setupCompanyRealtime() {
    await window.BKAuth.sb.realtime.setAuth();
    state.companyChannel = window.BKAuth.sb.channel(`company:${state.companyId}:chat`, { config: { private: true } })
      .on('broadcast', { event: 'chat_inbox_changed' }, () => loadInbox(true)).subscribe();
  }
  function bindEvents() {
    el('conversation-search').oninput = event => { state.search = event.target.value.trim(); renderInbox(); };
    document.querySelectorAll('.conversation-tabs button').forEach(button => button.onclick = () => { document.querySelectorAll('.conversation-tabs button').forEach(item => item.classList.remove('active')); button.classList.add('active'); state.filter = button.dataset.filter; renderInbox(); });
    el('message-composer').onsubmit = sendMessage;
    el('message-input').oninput = event => { event.target.style.height = '42px'; event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`; };
    el('message-input').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); el('message-composer').requestSubmit(); } };
    el('attach-image').onclick = () => el('image-input').click(); el('image-input').onchange = chooseImage; el('remove-image').onclick = () => clearPendingImage();
    el('new-group-button').onclick = openGroupModal; el('close-group-modal').onclick = () => closeModal('group-modal'); el('cancel-group').onclick = () => closeModal('group-modal'); el('create-group').onclick = createGroup; el('member-search').oninput = renderMemberChoices;
    el('thread-members').onclick = showMembers; el('close-members-modal').onclick = () => closeModal('members-modal');
    el('back-conversations').onclick = () => document.querySelector('.messages-shell').classList.remove('thread-open');
    window.addEventListener('pagehide', () => { clearPendingImage(); state.attachmentUrls.forEach(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }); return Promise.all([state.activeChannel, state.companyChannel].filter(Boolean).map(channel => window.BKAuth.sb.removeChannel(channel))); }, { once: true });
  }
  async function init() {
    bindEvents();
    try {
      state.user = await window.BKAuth.getUser(); if (!state.user) throw new Error('Sign in required');
      const role = await window.BKAuth.getUserRole(); const company = await window.BKAuth.getCompany(role?.tenantId); const employee = await window.BKAuth.getEmployee(state.user.email);
      state.companyId = company?.id; state.employeeId = employee?.id;
      if (!state.companyId || !state.employeeId) throw new Error('Employee profile unavailable');
      const employeesRes = await window.BKAuth.sb.from('employees').select('id,first_name,last_name,picture_link,employment_status').eq('company_id', state.companyId).order('first_name');
      if (employeesRes.error) throw employeesRes.error;
      state.employees = employeesRes.data || [];
      await Promise.all([loadInbox(), setupCompanyRealtime()]);
    } catch (error) {
      el('conversation-list').textContent = friendlyError(error, 'Messages are unavailable. Sign in again or refresh the page.');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
