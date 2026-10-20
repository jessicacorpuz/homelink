-- HomeLink deletion permissions
-- Run this in the Supabase SQL Editor after reviewing existing policies.
-- These policies let tenants delete their own requests, managers delete any
-- request, contractors delete requests assigned to them, and managers delete
-- properties. Existing permissive policies continue to apply as well.

alter table public.maintenance_requests enable row level security;
alter table public.properties enable row level security;

drop policy if exists "HomeLink request delete by role" on public.maintenance_requests;
create policy "HomeLink request delete by role"
on public.maintenance_requests
for delete
to authenticated
using (
  tenant_id = auth.uid()
  or assigned_contractor_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(p.role) = 'manager'
  )
);

drop policy if exists "HomeLink manager property delete" on public.properties;
create policy "HomeLink manager property delete"
on public.properties
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(p.role) = 'manager'
  )
);
