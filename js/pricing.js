(function initPricingPage() {
  'use strict';

  const grid = document.getElementById('pricing-grid');
  const alertBox = document.getElementById('pricing-alert');
  const modal = document.getElementById('subscribe-modal');
  const form = document.getElementById('subscribe-form');
  const planSummary = document.getElementById('subscribe-plan-summary');
  const submitButton = document.getElementById('subscribe-submit');
  const subscribeAlert = document.getElementById('subscribe-alert');
  const successPanel = document.getElementById('subscribe-success');
  let lastTrigger = null;

  const countryCodes = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(' ');

  function formatMoney(value) {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function populateCountries() {
    const select = document.getElementById('subscriber-country');
    const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
    const countries = countryCodes.map(code => ({ code, name: names ? names.of(code) : code })).sort((a, b) => a.name.localeCompare(b.name));
    countries.forEach(country => {
      const option = document.createElement('option');
      option.value = country.name;
      option.textContent = country.name;
      option.selected = country.code === 'PH';
      select.appendChild(option);
    });
  }

  function makeFeatureItem(feature) {
    const item = document.createElement('li');
    item.className = 'pricing-card__feature';
    item.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>';
    const label = document.createElement('span');
    label.textContent = String(feature || '');
    item.appendChild(label);
    return item;
  }

  function makePlanCard(plan) {
    const card = document.createElement('article');
    card.className = 'pricing-card';

    const top = document.createElement('div');
    top.className = 'pricing-card__top';
    const title = document.createElement('h2');
    title.className = 'pricing-card__name';
    title.textContent = plan.name;
    top.appendChild(title);
    if (Number(plan.price_php) === 0) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-cyan';
      badge.textContent = 'Start here';
      top.appendChild(badge);
    }

    const price = document.createElement('div');
    price.className = 'pricing-card__price';
    const amount = document.createElement('span');
    amount.className = 'pricing-card__amount';
    amount.textContent = Number(plan.price_php) === 0 ? 'Free' : formatMoney(plan.price_php);
    price.appendChild(amount);
    if (Number(plan.price_php) > 0) {
      const cycle = document.createElement('span');
      cycle.className = 'pricing-card__cycle';
      cycle.textContent = '/ cycle';
      price.appendChild(cycle);
    }

    const validity = document.createElement('p');
    validity.className = 'pricing-card__validity';
    validity.textContent = plan.cycle_days ? `${plan.cycle_days}-day billing cycle` : '';

    const divider = document.createElement('div');
    divider.className = 'pricing-card__divider';
    const features = document.createElement('ul');
    features.className = 'pricing-card__features';
    (Array.isArray(plan.features) ? plan.features : []).forEach(feature => features.appendChild(makeFeatureItem(feature)));

    const button = document.createElement('button');
    button.className = 'btn btn-cyan btn-lg';
    button.type = 'button';
    button.textContent = 'Subscribe';
    button.addEventListener('click', () => openModal(plan, button));

    card.append(top, price, validity, divider, features, button);
    return card;
  }

  async function loadPlans() {
    try {
      const db = window.createSupabaseClient();
      const params = 'select=id,name,price_php,cycle_days,features&is_visible=eq.true&order=price_php.asc&limit=20';
      const plans = await db.select('pricing_tiers', params);
      grid.replaceChildren();
      plans.forEach(plan => grid.appendChild(makePlanCard(plan)));
      if (!plans.length) {
        alertBox.textContent = 'No subscription plans are available right now. Please check again soon.';
        alertBox.hidden = false;
      }
    } catch (error) {
      console.error('Pricing plans could not be loaded:', error);
      grid.replaceChildren();
      alertBox.textContent = 'Pricing plans could not be loaded. Please refresh and try again.';
      alertBox.hidden = false;
    } finally {
      grid.setAttribute('aria-busy', 'false');
    }
  }

  function openModal(plan, trigger) {
    lastTrigger = trigger;
    form.reset();
    form.hidden = false;
    successPanel.hidden = true;
    subscribeAlert.hidden = true;
    document.getElementById('subscribe-plan-id').value = plan.id;
    document.getElementById('subscribe-plan-name').value = plan.name;
    document.getElementById('subscriber-country').value = 'Philippines';
    planSummary.textContent = `${plan.name} · ${Number(plan.price_php) === 0 ? 'Free' : formatMoney(plan.price_php)}`;
    submitButton.textContent = `Subscribe (${plan.name})`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => document.getElementById('subscriber-first-name').focus());
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lastTrigger?.focus();
  }

  function markValidity(input) {
    const error = input.closest('.form-group')?.querySelector('.form-error');
    if (!error) return input.checkValidity();
    const valid = input.checkValidity();
    error.textContent = valid ? '' : 'This field is required.';
    input.classList.toggle('error', !valid);
    return valid;
  }

  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeModal));
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
  form.querySelectorAll('[required]').forEach(input => input.addEventListener('input', () => markValidity(input)));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const fields = [...form.querySelectorAll('[required]')];
    const validities = fields.map(markValidity);
    if (!validities.every(Boolean)) {
      fields.find(input => !input.checkValidity())?.focus();
      return;
    }

    const data = new FormData(form);
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    subscribeAlert.hidden = true;

    try {
      const response = await fetch('/api/subscription-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: data.get('plan_id'),
          first_name: data.get('first_name'),
          last_name: data.get('last_name'),
          business_email: data.get('business_email'),
          mobile_number: data.get('mobile_number'),
          company: data.get('company'),
          street_address: data.get('street_address'),
          city: data.get('city'),
          province: data.get('province'),
          country: data.get('country'),
          consent: data.get('consent') === 'on',
          website: data.get('website')
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your subscription request could not be submitted.');
      const successTitle = successPanel.querySelector('h2');
      const successCopy = successPanel.querySelector('p');
      if (result.signup_mode === 'free' && result.tenant_registered) {
        successTitle.textContent = 'Business registered';
        successCopy.textContent = 'Your business has been registered. Brightkey will contact you using the information provided to complete account access.';
      } else {
        successTitle.textContent = 'Subscription request received';
        successCopy.textContent = 'Our team will review your selected plan and contact you with the available payment options.';
      }
      form.hidden = true;
      successPanel.hidden = false;
      successPanel.querySelector('button').focus();
    } catch (error) {
      subscribeAlert.textContent = error.message;
      subscribeAlert.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = `Subscribe (${document.getElementById('subscribe-plan-name').value})`;
    }
  });

  populateCountries();
  loadPlans();
})();
