(function initBookingCompletion(global) {
  'use strict';

  function parseArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try { return JSON.parse(value); } catch (_) { return []; }
  }

  function getDoorInstallers(booking, door) {
    if (Array.isArray(door?.installers)) return door.installers;
    const bookingInstallers = parseArray(booking?.installers);
    if (bookingInstallers.length > 0) return bookingInstallers;
    return booking?.installer_id || booking?.installer_name ? [{ id: booking.installer_id, name: booking.installer_name }] : [];
  }

  function isProductOnlyDoor(booking, door, doorIndex, doors, products, isCancelled) {
    if (isCancelled(door, doorIndex, doors, products)) return false;
    const attachedSkus = Array.isArray(door?.products) ? door.products : [];
    const hasActiveProduct = attachedSkus.length > 0
      ? attachedSkus.some(sku => products.some(product => (
        String(product?.sku || '').trim().toUpperCase() === String(sku || '').trim().toUpperCase()
        && product?.cancelled !== true
      )))
      : products.some(product => product?.cancelled !== true && (
        doors.length === 1 || Number(product?.doorIndex) === doorIndex
      ));
    return hasActiveProduct && getDoorInstallers(booking, door).length === 0;
  }

  function isProductOnlyBooking(booking, doors, products, isCancelled) {
    const activeDoors = doors.filter((door, index) => !isCancelled(door, index, doors, products));
    return activeDoors.length > 0 && activeDoors.every(door => {
      const index = doors.indexOf(door);
      return isProductOnlyDoor(booking, door, index, doors, products, isCancelled);
    });
  }

  function getReceivedPhotoUrl(booking) {
    const url = String(booking?._received_photo_url || '').trim();
    return /^(?:https?:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i.test(url) ? url : '';
  }

  function hasDoorMedia(door) {
    const required = door?.required_media && typeof door.required_media === 'object' ? Object.values(door.required_media) : [];
    return [...(door?.media_urls || []), ...required, ...(door?.other_media || [])].some(url => typeof url === 'string' && url.trim());
  }

  function isDoorCompletedForDisplay(booking, door, doorIndex, doors, products, isCancelled) {
    return Boolean(door?.completed) || isCancelled(door, doorIndex, doors, products)
      || (Boolean(door?.signature) && hasDoorMedia(door))
      || (isProductOnlyDoor(booking, door, doorIndex, doors, products, isCancelled) && Boolean(getReceivedPhotoUrl(booking)));
  }

  async function loadData({ sb, companyId, bookings }) {
    const transactions = new Map();
    const references = [...new Set(bookings.map(booking => booking.order_no).filter(Boolean))];
    if (references.length === 0) return transactions;
    const photos = new Map();
    for (let offset = 0; offset < references.length; offset += 100) {
      const batch = references.slice(offset, offset + 100);
      const [txResult, deliveryResult] = await Promise.all([
        sb.from('inventory_transactions').select('reference_id, status').eq('company_id', companyId).in('reference_id', batch),
        sb.from('delivery_bookings').select('reference_id, status, received_photo_url, delivered_at').eq('company_id', companyId).in('reference_id', batch)
      ]);
      if (txResult.error) throw txResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      (txResult.data || []).forEach(transaction => {
        if (!transactions.has(transaction.reference_id)) transactions.set(transaction.reference_id, []);
        transactions.get(transaction.reference_id).push(transaction.status);
      });
      (deliveryResult.data || []).forEach(delivery => {
        const received = String(delivery?.status || '').toLowerCase() === 'delivered' || Boolean(delivery?.delivered_at);
        if (received && delivery?.received_photo_url) photos.set(delivery.reference_id, delivery.received_photo_url);
      });
    }
    bookings.forEach(booking => { booking._received_photo_url = photos.get(booking.order_no) || ''; });
    return transactions;
  }

  global.BKBookingCompletion = Object.freeze({ getReceivedPhotoUrl, hasDoorMedia, isDoorCompletedForDisplay, isProductOnlyBooking, isProductOnlyDoor, loadData });
})(window);
