/* ============================================================
   BrightKey — payment.js
   PayMongo integration for the Products page.
   Docs: https://developers.paymongo.com
   ============================================================ */

'use strict';

// ── Config ──────────────────────────────────────────────────
// IMPORTANT: Only use the PUBLIC key here (pk_live_… / pk_test_…).
// Never expose secret keys in frontend code.
const PAYMONGO_PUBLIC_KEY = 'pk_test_your_paymongo_public_key';
const PAYMONGO_API        = 'https://api.paymongo.com/v1';

// Base64 encode for Basic Auth header
const PM_AUTH = btoa(`${PAYMONGO_PUBLIC_KEY}:`);

// ── PayMongo API wrapper ─────────────────────────────────────
const PayMongo = (() => {
  async function request(method, endpoint, body) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${PM_AUTH}`,
      },
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${PAYMONGO_API}${endpoint}`, options);
    const data = await res.json();

    if (!res.ok) {
      const msg = data?.errors?.[0]?.detail || `PayMongo error: ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  /**
   * Create a PaymentIntent.
   * @param {number} amountCents  – amount in smallest currency unit (centavos for PHP)
   * @param {string} currency     – 'PHP'
   * @param {string[]} methods    – e.g. ['card', 'gcash', 'grab_pay', 'paymaya']
   * @returns {Promise<object>}   PaymentIntent resource
   */
  async function createPaymentIntent(amountCents, currency = 'PHP', methods = ['card']) {
    return request('POST', '/payment_intents', {
      data: {
        attributes: {
          amount: amountCents,
          payment_method_allowed: methods,
          payment_method_options: { card: { request_three_d_secure: 'any' } },
          currency,
          capture_type: 'automatic',
        },
      },
    });
  }

  /**
   * Create a PaymentMethod (card).
   * @param {object} card    – { number, exp_month, exp_year, cvc }
   * @param {object} billing – { name, email, phone }
   * @returns {Promise<object>} PaymentMethod resource
   */
  async function createPaymentMethod({ card, billing }) {
    return request('POST', '/payment_methods', {
      data: {
        attributes: {
          type: 'card',
          details: {
            card_number: card.number.replace(/\s/g, ''),
            exp_month:   parseInt(card.exp_month, 10),
            exp_year:    parseInt(card.exp_year, 10),
            cvc:         card.cvc,
          },
          billing: {
            name:  billing.name,
            email: billing.email,
            phone: billing.phone || undefined,
          },
        },
      },
    });
  }

  /**
   * Attach a PaymentMethod to a PaymentIntent.
   * @param {string} intentId       – PaymentIntent id
   * @param {string} intentClientKey – PaymentIntent client_key
   * @param {string} methodId       – PaymentMethod id
   * @param {string} returnUrl      – where to redirect after 3DS
   * @returns {Promise<object>} Updated PaymentIntent
   */
  async function attachPaymentMethod(intentId, intentClientKey, methodId, returnUrl) {
    return request('POST', `/payment_intents/${intentId}/attach`, {
      data: {
        attributes: {
          payment_method:     methodId,
          client_key:         intentClientKey,
          return_url:         returnUrl,
        },
      },
    });
  }

  /**
   * Retrieve a PaymentIntent (to check status after 3DS redirect).
   */
  async function getPaymentIntent(intentId, clientKey) {
    return request('GET', `/payment_intents/${intentId}?client_key=${clientKey}`);
  }

  /**
   * Create a Source for e-wallets (GCash, GrabPay, etc.).
   * @param {number} amountCents
   * @param {string} type          – 'gcash' | 'grab_pay' | 'paymaya'
   * @param {string} successUrl
   * @param {string} failedUrl
   * @param {string} currency
   */
  async function createSource(amountCents, type, successUrl, failedUrl, currency = 'PHP') {
    return request('POST', '/sources', {
      data: {
        attributes: {
          amount:   amountCents,
          type,
          currency,
          redirect: { success: successUrl, failed: failedUrl },
        },
      },
    });
  }

  return { createPaymentIntent, createPaymentMethod, attachPaymentMethod, getPaymentIntent, createSource };
})();

window.PayMongo = PayMongo;

// ── Checkout flow ────────────────────────────────────────────
/**
 * Handles the complete card checkout flow:
 *   1. Create PaymentIntent
 *   2. Create PaymentMethod from card form
 *   3. Attach → handle 3DS or success
 *
 * @param {object} options
 *   - amountCents {number}     – total in centavos (₱100 = 10000)
 *   - currency    {string}     – default 'PHP'
 *   - card        {object}     – { number, exp_month, exp_year, cvc }
 *   - billing     {object}     – { name, email, phone }
 *   - returnUrl   {string}     – URL after 3DS authentication
 *   - onSuccess   {Function}   – callback(paymentIntent)
 *   - onError     {Function}   – callback(error)
 */
async function startCardCheckout({
  amountCents,
  currency = 'PHP',
  card,
  billing,
  returnUrl = window.location.href,
  onSuccess,
  onError,
}) {
  try {
    // 1. PaymentIntent
    const intentRes = await PayMongo.createPaymentIntent(amountCents, currency, ['card']);
    const intent    = intentRes.data;

    // 2. PaymentMethod
    const methodRes = await PayMongo.createPaymentMethod({ card, billing });
    const method    = methodRes.data;

    // 3. Attach
    const attachRes = await PayMongo.attachPaymentMethod(
      intent.id,
      intent.attributes.client_key,
      method.id,
      returnUrl
    );
    const updated = attachRes.data;
    const status  = updated.attributes.status;

    if (status === 'succeeded') {
      onSuccess?.(updated);
    } else if (status === 'awaiting_next_action') {
      // 3DS required — redirect
      const redirectUrl = updated.attributes.next_action?.redirect?.url;
      if (redirectUrl) {
        // Store intent info to verify on return
        sessionStorage.setItem('pm_intent_id',   intent.id);
        sessionStorage.setItem('pm_client_key',  intent.attributes.client_key);
        window.location.href = redirectUrl;
      }
    } else {
      throw new Error(`Unexpected payment status: ${status}`);
    }
  } catch (err) {
    onError?.(err);
  }
}

window.startCardCheckout = startCardCheckout;

/**
 * E-wallet checkout (GCash / GrabPay / Maya).
 * Redirects user to wallet app; call verifySourcePayment on return.
 */
async function startWalletCheckout({
  amountCents,
  currency = 'PHP',
  type,            // 'gcash' | 'grab_pay' | 'paymaya'
  successUrl = window.location.href + '?payment=success',
  failedUrl  = window.location.href + '?payment=failed',
  onError,
}) {
  try {
    const sourceRes = await PayMongo.createSource(amountCents, type, successUrl, failedUrl, currency);
    const source    = sourceRes.data;
    const checkout  = source.attributes.redirect.checkout_url;
    sessionStorage.setItem('pm_source_id', source.id);
    window.location.href = checkout;
  } catch (err) {
    onError?.(err);
  }
}

window.startWalletCheckout = startWalletCheckout;

// ── Verify payment on return from 3DS / wallet ───────────────
(async function verifyOnReturn() {
  const params    = new URLSearchParams(window.location.search);
  const status    = params.get('payment');
  const intentId  = sessionStorage.getItem('pm_intent_id');
  const clientKey = sessionStorage.getItem('pm_client_key');

  // Card 3DS return
  if (intentId && clientKey) {
    try {
      const res    = await PayMongo.getPaymentIntent(intentId, clientKey);
      const intent = res.data;

      sessionStorage.removeItem('pm_intent_id');
      sessionStorage.removeItem('pm_client_key');

      if (intent.attributes.status === 'succeeded') {
        window.dispatchEvent(new CustomEvent('paymongo:success', { detail: intent }));
        Toast?.success('Payment successful! Thank you for your purchase.');
        cleanUrl();
      } else {
        window.dispatchEvent(new CustomEvent('paymongo:failed', { detail: intent }));
        Toast?.error('Payment was not completed. Please try again.');
      }
    } catch (_) { /* silent — may not be a payment page */ }
    return;
  }

  // Wallet return
  if (status) {
    sessionStorage.removeItem('pm_source_id');
    if (status === 'success') {
      window.dispatchEvent(new CustomEvent('paymongo:success', { detail: {} }));
      Toast?.success('Payment successful! Thank you for your purchase.');
    } else {
      window.dispatchEvent(new CustomEvent('paymongo:failed', { detail: {} }));
      Toast?.error('Payment failed or was cancelled.');
    }
    cleanUrl();
  }

  function cleanUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('payment');
    window.history.replaceState({}, '', url.toString());
  }
})();

// ── Card number formatter ────────────────────────────────────
document.querySelectorAll('[data-card-number]').forEach(input => {
  input.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
  });
});

// ── Expiry formatter ─────────────────────────────────────────
document.querySelectorAll('[data-card-expiry]').forEach(input => {
  input.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    e.target.value = v;
  });
});

// ── CVC limiter ──────────────────────────────────────────────
document.querySelectorAll('[data-card-cvc]').forEach(input => {
  input.addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
  });
});

// ── Amount formatter (display) ───────────────────────────────
/**
 * Format centavos to human-readable PHP string.
 * e.g. 99900 → "₱999.00"
 */
function formatPHP(centavos) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(centavos / 100);
}

window.formatPHP = formatPHP;
