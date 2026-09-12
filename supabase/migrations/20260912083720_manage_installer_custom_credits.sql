create policy "Operations can update installer custom credits"
  on public.installer_custom_credits for update to authenticated
  using (
    public.has_module_access((select auth.uid()), company_id, 'Operations')
  )
  with check (
    public.has_module_access((select auth.uid()), company_id, 'Operations')
    and exists (
      select 1
      from public.employees employee
      where employee.id = employee_id
        and employee.company_id = company_id
    )
  );

create policy "Operations can delete installer custom credits"
  on public.installer_custom_credits for delete to authenticated
  using (
    public.has_module_access((select auth.uid()), company_id, 'Operations')
  );

grant update, delete on public.installer_custom_credits to authenticated;
