alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_status_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_status_check
  check (status in (
    'ordered',
    'received',
    'inspect',
    'reserved',
    'packed',
    'dispatched',
    'returned',
    'cancelled',
    'unreceived',
    'discarded'
  )) not valid;

alter table public.inventory_transactions
  validate constraint inventory_transactions_status_check;
