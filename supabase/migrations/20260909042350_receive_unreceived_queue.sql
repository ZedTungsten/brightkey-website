alter table public.inventory_transactions
  add column if not exists unreceived_at timestamptz,
  add column if not exists unreceived_original_reference_id text,
  add column if not exists unreceived_original_supplier_name text,
  add column if not exists receive_readded boolean not null default false;

create index if not exists inventory_transactions_unreceived_queue_idx
  on public.inventory_transactions (company_id, warehouse_id, created_at)
  where status = 'unreceived';

comment on column public.inventory_transactions.unreceived_at is
  'When an unchecked inbound line was detached from its shipment and placed in the warehouse Unreceived queue.';
comment on column public.inventory_transactions.unreceived_original_reference_id is
  'Shipment reference from which this inbound line was first detached.';
comment on column public.inventory_transactions.unreceived_original_supplier_name is
  'Supplier recorded when this inbound line was first detached.';
comment on column public.inventory_transactions.receive_readded is
  'True when an Unreceived line has been attached to a later active inbound shipment.';
