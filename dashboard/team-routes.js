(function () {
  'use strict';

  const routeByTab = {
    tasks: '/dashboard/team/tasks',
    milestones: '/dashboard/team/milestones',
    projects: '/dashboard/team/projects'
  };

  function current() {
    const segment = window.location.pathname.replace(/\/+$/, '').split('/').pop();
    return Object.hasOwn(routeByTab, segment) ? segment : 'tasks';
  }

  function navigate(tab) {
    const route = routeByTab[tab];
    if (route && window.location.pathname !== route) history.pushState({ teamTab: tab }, '', route + window.location.hash);
  }

  function bind(app) {
    app.switchMainTab(app.activeMainTab, false);
    window.addEventListener('popstate', () => app.switchMainTab(current(), false));
  }

  window.BKTeamRoutes = { bind, current, navigate };
})();
