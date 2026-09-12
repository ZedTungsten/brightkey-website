create table if not exists public.installer_custom_credits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  label text not null,
  credit_date date not null,
  credit_value numeric(8, 2) not null default 1,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint installer_custom_credits_label_check
    check (btrim(label) <> '' and char_length(btrim(label)) <= 120),
  constraint installer_custom_credits_value_check
    check (credit_value > 0)
);

create index if not exists installer_custom_credits_company_date_idx
  on public.installer_custom_credits (company_id, credit_date desc);

create index if not exists installer_custom_credits_employee_date_idx
  on public.installer_custom_credits (employee_id, credit_date desc);

alter table public.installer_custom_credits enable row level security;

create policy "Company teams can read installer custom credits"
  on public.installer_custom_credits for select to authenticated
  using (
    public.has_module_access((select auth.uid()), company_id, 'Operations')
    or public.has_module_access((select auth.uid()), company_id, 'HR')
    or public.has_module_access((select auth.uid()), company_id, 'Finance')
  );

create policy "Operations can create installer custom credits"
  on public.installer_custom_credits for insert to authenticated
  with check (
    public.has_module_access((select auth.uid()), company_id, 'Operations')
    and exists (
      select 1
      from public.employees employee
      where employee.id = employee_id
        and employee.company_id = company_id
    )
  );

grant select, insert on public.installer_custom_credits to authenticated;

create or replace function public.get_installer_custom_credits(p_token uuid)
returns table (
  id uuid,
  label text,
  credit_date date,
  credit_value numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select credit.id, credit.label, credit.credit_date, credit.credit_value
  from public.installer_custom_credits credit
  join public.installer_sessions session
    on session.company_id = credit.company_id
   and session.employee_id = credit.employee_id
  where session.token = p_token
    and session.expires_at > now()
  order by credit.credit_date, credit.created_at
  limit 500;
$$;

revoke all on function public.get_installer_custom_credits(uuid) from public, authenticated;
grant execute on function public.get_installer_custom_credits(uuid) to anon;
