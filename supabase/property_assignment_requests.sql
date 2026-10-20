-- HomeLink tenant requests for an existing unassigned property.
-- Run this in Supabase SQL Editor after notifications.sql.

create table if not exists public.property_assignment_requests (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);

-- Let authenticated tenants discover unassigned properties without granting them edit access.
drop policy if exists properties_tenant_read_unassigned on public.properties;
create policy properties_tenant_read_unassigned on public.properties
  for select to authenticated using (
    tenant_id is null
    and exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'tenant')
  );

create unique index if not exists one_pending_assignment_per_tenant_property
  on public.property_assignment_requests(property_id, tenant_id) where status = 'pending';
create index if not exists assignment_requests_status_created_idx
  on public.property_assignment_requests(status, created_at desc);

alter table public.property_assignment_requests enable row level security;
drop policy if exists assignment_requests_tenant_read on public.property_assignment_requests;
create policy assignment_requests_tenant_read on public.property_assignment_requests
  for select to authenticated using (tenant_id = auth.uid());
drop policy if exists assignment_requests_tenant_insert on public.property_assignment_requests;
create policy assignment_requests_tenant_insert on public.property_assignment_requests
  for insert to authenticated with check (
    tenant_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'tenant')
    and exists (select 1 from public.properties pr where pr.id = property_id and pr.tenant_id is null)
  );
drop policy if exists assignment_requests_manager_read on public.property_assignment_requests;
create policy assignment_requests_manager_read on public.property_assignment_requests
  for select to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'manager'));
drop policy if exists assignment_requests_manager_update on public.property_assignment_requests;
create policy assignment_requests_manager_update on public.property_assignment_requests
  for update to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'manager'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'manager'));

grant select, insert, update on public.property_assignment_requests to authenticated;

create or replace function public.notify_managers_property_assignment_request()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_property_name text;
  v_unit text;
begin
  if new.status <> 'pending' then return new; end if;
  select property_name, unit into v_property_name, v_unit from public.properties where id = new.property_id;
  insert into public.notifications(user_id, request_id, type, title, message)
  select p.id, new.id, 'property_assignment_request', 'Tenant requests property assignment',
         format('%s requested %s%s. Review the request in Properties.',
           public.profile_name(new.tenant_id, 'A tenant'),
           coalesce(v_property_name, 'an unassigned property'),
           case when coalesce(v_unit, '') <> '' then ' · Unit ' || v_unit else '' end)
    from public.profiles p where lower(p.role) = 'manager';
  return new;
end;
$$;

drop trigger if exists property_assignment_request_notify_managers on public.property_assignment_requests;
create trigger property_assignment_request_notify_managers
after insert on public.property_assignment_requests
for each row execute function public.notify_managers_property_assignment_request();

-- Notify tenant when manager approves or declines their request.
create or replace function public.notify_tenant_assignment_request_review()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_property_name text; v_unit text;
begin
  if new.status is not distinct from old.status or new.status not in ('approved','declined') then return new; end if;
  select property_name, unit into v_property_name, v_unit from public.properties where id = new.property_id;
  perform public.notify_user(new.tenant_id, null,
    case when new.status = 'approved' then 'property_assignment_approved' else 'property_assignment_declined' end,
    case when new.status = 'approved' then 'Property assignment approved' else 'Property assignment declined' end,
    format('%s%s', coalesce(v_property_name, 'Your property request'), case when coalesce(v_unit,'') <> '' then ' · Unit ' || v_unit else '' end));
  return new;
end;
$$;
drop trigger if exists property_assignment_request_review_notify_tenant on public.property_assignment_requests;
create trigger property_assignment_request_review_notify_tenant
after update of status on public.property_assignment_requests
for each row execute function public.notify_tenant_assignment_request_review();
