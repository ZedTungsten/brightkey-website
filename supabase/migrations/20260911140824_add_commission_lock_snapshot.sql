alter table public.installation_bookings
  add column if not exists commission_lock_snapshot jsonb;

comment on column public.installation_bookings.commission_lock_snapshot is
  'Latest live commission calculation basis captured when Sales Commissions is locked; separate from the immutable AR receipt basis.';
