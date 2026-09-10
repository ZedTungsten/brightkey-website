'use strict';

window.ShipTabCounts = (() => {
  let request = null;
  let requestKey = '';

  function render(id, count) {
    const badge = document.getElementById(id);
    if (!badge) return;
    const total = Math.max(0, Number(count) || 0);
    badge.textContent = String(total);
    badge.style.display = total > 0 ? 'inline-block' : 'none';
  }

  async function update({ sb, companyId }) {
    if (!sb || !companyId) return;
    const nextKey = String(companyId);
    if (!request || requestKey !== nextKey) {
      requestKey = nextKey;
      request = Promise.resolve(sb.rpc('get_ship_tab_counts', {
        p_company_id: companyId
      })).finally(() => {
        if (requestKey === nextKey) request = null;
      });
    }
    const { data, error } = await request;
    if (requestKey !== nextKey) return;
    if (error) throw error;
    const row = data?.[0];
    if (!row) throw new Error('Ship tab counts returned no result.');
    render('badge-count-send', row.send_count);
    render('badge-count-receive', row.receive_count);
  }

  return Object.freeze({ update });
})();
