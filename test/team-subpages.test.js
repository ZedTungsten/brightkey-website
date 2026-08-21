import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Team tabs have clean routes backed by the shared Team page', () => {
  const routes = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrites = new Map(routes.rewrites.map(route => [route.source, route.destination]));
  ['tasks', 'milestones', 'projects'].forEach(tab => {
    assert.equal(rewrites.get(`/dashboard/team/${tab}`), '/dashboard/team');
  });
});

test('Team route state maps each requested subpage to its tab', () => {
  const routes = fs.readFileSync(new URL('../dashboard/team-routes.js', import.meta.url), 'utf8');
  const team = fs.readFileSync(new URL('../dashboard/team.js', import.meta.url), 'utf8');
  const sidebar = fs.readFileSync(new URL('../js/sidebar.js', import.meta.url), 'utf8');

  assert.match(routes, /tasks: '\/dashboard\/team\/tasks'/);
  assert.match(routes, /milestones: '\/dashboard\/team\/milestones'/);
  assert.match(routes, /projects: '\/dashboard\/team\/projects'/);
  assert.match(team, /BKTeamRoutes\.current\(\)/);
  assert.match(team, /BKTeamRoutes\.navigate\(tab\)/);
  assert.match(sidebar, /href="\/dashboard\/team\/tasks"/);
});
