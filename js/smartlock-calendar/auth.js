'use strict';

// --- Authentication Logic ---
async function handleLogin(e) {
  e.preventDefault();
  const enteredPass = document.getElementById('login-pass').value;
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  errorEl.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.innerText = 'Verifying...';

  try {
    const { data: authenticatedInstaller, error } = await sb
      .rpc('create_installer_session', {
        p_password: enteredPass
      })
      .maybeSingle();

    if (error) throw error;

    if (authenticatedInstaller) {
      const { session_token: sessionToken, ...matchingInstaller } = authenticatedInstaller;
      sessionStorage.setItem('bk_installer_session', sessionToken);
      currentInstaller = {
        id: matchingInstaller.id,
        first_name: matchingInstaller.first_name,
        last_name: matchingInstaller.last_name,
        contact_number: matchingInstaller.contact_number,
        company_id: matchingInstaller.company_id,
        assignment: matchingInstaller.assignment,
        email: matchingInstaller.email,
        department: matchingInstaller.department,
        title: matchingInstaller.title,
        employment_status: matchingInstaller.employment_status
      };
      localStorage.setItem('bk_active_installer', JSON.stringify(currentInstaller));
      document.getElementById('display-installer-name').innerText = `${currentInstaller.first_name} ${currentInstaller.last_name}`;
      populateProfile();
      populateTrackerMonthSelect();
      
      // Slide screen transition
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-screen').style.display = 'flex';

      // Sync data
      loadCachedBookings();
      await syncData();
    } else {
      errorEl.style.display = 'block';
    }
  } catch (err) {
    console.error('Login error:', err);
    errorEl.innerText = 'Network error: Failed to reach database.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Login';
  }
}

function handleLogout() {
  resetInstallerNotes();
  sessionStorage.removeItem('bk_installer_session');
  localStorage.removeItem('bk_active_installer');
  localStorage.removeItem(`bk_cache_${currentInstaller?.id}`);
  currentInstaller = null;
  dbBookings = [];
  document.getElementById('login-pass').value = '';
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  
  // Reset view to Calendar
  const calendarTab = document.getElementById('calendar-view');
  const trackerTab = document.getElementById('job-tracker-view');
  const profileTab = document.getElementById('profile-view');
  const payoutsTab = document.getElementById('payouts-view');
  const notesTab = document.getElementById('notes-view');
  calendarTab.style.display = 'flex';
  trackerTab.style.display = 'none';
  profileTab.style.display = 'none';
  payoutsTab.style.display = 'none';
  notesTab.style.display = 'none';
  
  const menuItems = document.querySelectorAll('.drawer-menu-list .drawer-menu-item');
  menuItems.forEach(item => {
    if (item.getAttribute('onclick').includes('calendar')) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function toggleSidebar(show) {
  const overlay = document.getElementById('sidebar-drawer-overlay');
  if (show) {
    overlay.style.display = 'block';
    overlay.offsetHeight; // force reflow
    overlay.classList.add('open');
  } else {
    overlay.classList.remove('open');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 200);
  }
}

function switchView(view) {
  const calendarTab = document.getElementById('calendar-view');
  const trackerTab = document.getElementById('job-tracker-view');
  const profileTab = document.getElementById('profile-view');
  const payoutsTab = document.getElementById('payouts-view');
  const notesTab = document.getElementById('notes-view');
  const menuItems = document.querySelectorAll('.drawer-menu-list .drawer-menu-item');
  
  calendarTab.style.display = view === 'calendar' ? 'flex' : 'none';
  trackerTab.style.display = view === 'job-tracker' ? 'flex' : 'none';
  profileTab.style.display = view === 'profile' ? 'flex' : 'none';
  payoutsTab.style.display = view === 'payouts' ? 'flex' : 'none';
  notesTab.style.display = view === 'notes' ? 'flex' : 'none';

  if (view === 'job-tracker') {
    drawJobTracker();
  } else if (view === 'profile') {
    populateProfile();
  } else if (view === 'payouts') {
    drawPayouts();
  } else if (view === 'notes') {
    loadInstallerNotes();
  }
  
  // Close sidebar drawer after switching view
  toggleSidebar(false);

  menuItems.forEach(item => {
    if (item.getAttribute('onclick').includes(view)) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  toggleSidebar(false);
}

function populateProfile() {
  if (!currentInstaller) return;
  document.getElementById('profile-full-name').textContent = `${currentInstaller.first_name || ''} ${currentInstaller.last_name || ''}`;
  document.getElementById('profile-title').textContent = currentInstaller.title || currentInstaller.assignment || 'Installer';
  document.getElementById('profile-dept').textContent = currentInstaller.department || 'Operations';
  document.getElementById('profile-status').textContent = currentInstaller.employment_status || 'Active';
  document.getElementById('profile-email').textContent = currentInstaller.email || '—';
  document.getElementById('profile-phone').textContent = currentInstaller.contact_number || '—';
}

let installerNotes = [];
let installerNotesLoaded = false;
let installerNotesLoading = null;
const INSTALLER_NOTE_TAGS = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'HR']);

function sanitizeInstallerNoteHtml(html) {
  const template = document.createElement('template');
  const clean = document.createElement('div');
  template.innerHTML = String(html || '');

  function appendSafe(source, target) {
    Array.from(source.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        target.appendChild(document.createTextNode(node.textContent || ''));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (!INSTALLER_NOTE_TAGS.has(node.tagName)) {
        appendSafe(node, target);
        return;
      }
      const element = document.createElement(node.tagName.toLowerCase());
      appendSafe(node, element);
      target.appendChild(element);
    });
  }

  appendSafe(template.content, clean);
  return clean.innerHTML;
}

function renderInstallerNotes() {
  const list = document.getElementById('installer-notes-list');
  if (!list) return;
  if (!installerNotes.length) {
    list.innerHTML = '<div class="installer-notes-empty">No notes are available yet.</div>';
    return;
  }

  const query = String(document.getElementById('installer-notes-search-input')?.value || '').trim().toLowerCase();
  const filteredNotes = query
    ? installerNotes.filter(note => note.search_text.includes(query))
    : installerNotes;
  if (!filteredNotes.length) {
    list.innerHTML = '<div class="installer-notes-empty">No notes match your search.</div>';
    return;
  }

  list.replaceChildren(...filteredNotes.map(note => {
    const card = document.createElement('button');
    const title = document.createElement('span');
    card.type = 'button';
    card.className = 'installer-note-card';
    card.dataset.noteId = note.id;
    title.textContent = note.title;
    card.appendChild(title);
    card.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>');
    card.addEventListener('click', () => openInstallerNote(note.id));
    return card;
  }));
}

async function loadInstallerNotes() {
  if (installerNotesLoaded) {
    renderInstallerNotes();
    return;
  }
  if (installerNotesLoading) return installerNotesLoading;

  const list = document.getElementById('installer-notes-list');
  if (list) list.innerHTML = '<div class="installer-notes-loading"><span class="installer-notes-spinner"></span><span>Loading notes...</span></div>';
  installerNotesLoading = (async () => {
    try {
      const { data, error } = await sb.rpc('get_installer_notes', { p_token: getInstallerSessionToken() });
      if (error) throw error;
      installerNotes = (data || []).map(note => {
        const contentHtml = sanitizeInstallerNoteHtml(note.content_html);
        const content = document.createElement('div');
        content.innerHTML = contentHtml;
        return {
          ...note,
          content_html: contentHtml,
          search_text: `${note.title} ${content.textContent || ''}`.toLowerCase()
        };
      });
      installerNotesLoaded = true;
      renderInstallerNotes();
    } catch (error) {
      console.error('Installer notes could not be loaded:', error);
      if (list) list.innerHTML = '<div class="installer-notes-empty">Notes could not be loaded. Check your connection and try again.</div>';
    } finally {
      installerNotesLoading = null;
    }
  })();
  return installerNotesLoading;
}

function openInstallerNote(noteId) {
  const note = installerNotes.find(item => item.id === noteId);
  if (!note) return;
  document.getElementById('installer-note-detail-title').textContent = note.title;
  document.getElementById('installer-note-detail-content').innerHTML = note.content_html;
  const modal = document.getElementById('installer-note-detail-modal');
  modal.style.display = 'flex';
  modal.offsetHeight;
  modal.classList.add('open');
}

function closeInstallerNote() {
  const modal = document.getElementById('installer-note-detail-modal');
  modal.classList.remove('open');
  setTimeout(() => { modal.style.display = 'none'; }, 150);
}

function resetInstallerNotes() {
  installerNotes = [];
  installerNotesLoaded = false;
  installerNotesLoading = null;
  const search = document.getElementById('installer-notes-search-input');
  if (search) search.value = '';
  const list = document.getElementById('installer-notes-list');
  if (list) list.innerHTML = '<div class="installer-notes-loading"><span class="installer-notes-spinner"></span><span>Loading notes...</span></div>';
  const modal = document.getElementById('installer-note-detail-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
}
