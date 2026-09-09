alter table public.delivery_bookings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_bookings'
      and policyname = 'Tenant members can read delivery bookings'
  ) then
    create policy "Tenant members can read delivery bookings"
      on public.delivery_bookings
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.companies as company
          join public.tenant_members as member
            on member.tenant_id = company.tenant_id
          where company.id = delivery_bookings.company_id
            and member.user_id = (select auth.uid())
        )
      );
  end if;
end
$$;
