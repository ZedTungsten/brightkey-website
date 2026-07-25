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
  calendarTab.style.display = 'flex';
  trackerTab.style.display = 'none';
  profileTab.style.display = 'none';
  payoutsTab.style.display = 'none';
  
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
  const menuItems = document.querySelectorAll('.drawer-menu-list .drawer-menu-item');
  
  calendarTab.style.display = view === 'calendar' ? 'flex' : 'none';
  trackerTab.style.display = view === 'job-tracker' ? 'flex' : 'none';
  profileTab.style.display = view === 'profile' ? 'flex' : 'none';
  payoutsTab.style.display = view === 'payouts' ? 'flex' : 'none';

  if (view === 'job-tracker') {
    drawJobTracker();
  } else if (view === 'profile') {
    populateProfile();
  } else if (view === 'payouts') {
    drawPayouts();
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
