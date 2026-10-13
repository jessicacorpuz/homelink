-- =============================================================================
-- HomeLink notifications
-- Run once in Supabase -> SQL Editor. Safe to re-run.
--
-- Notifications are created by database triggers, so every code path (the
-- Python API, the dashboards, the SQL editor) produces them, and browsers can
-- never forge a notification for another user.
--
-- Who gets notified:
--   New request submitted ........ all managers
--   Contractor assigned .......... the contractor + the tenant
--   Contractor removed/replaced .. the previous contractor
--   Manager changes status ....... the tenant + the assigned contractor
--   Contractor posts an update ... the tenant + all managers
--   Contractor completes a job ... the tenant + all managers
--   Property assigned to tenant .. the tenant (and the previous tenant)
-- =============================================================================


-- 1. Table ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  request_id  bigint,
  type        text not null default 'info',
  title       text not null,
  message     text not null default '',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- If the table already existed from an earlier attempt, make sure every column
-- the app uses is there.
alter table public.notifications add column if not exists request_id bigint;
alter table public.notifications add column if not exists type       text not null default 'info';
alter table public.notifications add column if not exists title      text not null default '';
alter table public.notifications add column if not exists message    text not null default '';
alter table public.notifications add column if not exists is_read    boolean not null default false;
alter table public.notifications add column if not exists created_at timestamptz not null default now();

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);


-- 2. Row level security --------------------------------------------------------
-- Users can read their own notifications and flip is_read. Nothing else:
-- there is deliberately no INSERT policy; only the triggers below create rows.
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;


-- 3. Realtime (powers the live badge and the pop-up toast) ---------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;   -- already published
  when undefined_object then null;   -- no supabase_realtime publication here
end $$;


-- 4. Helper functions ----------------------------------------------------------
create or replace function public.profile_name(p_id uuid, p_fallback text)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''))
       from public.profiles where id = p_id),
    p_fallback
  );
$$;

create or replace function public.notify_user(
  p_user_id    uuid,
  p_request_id bigint,
  p_type       text,
  p_title      text,
  p_message    text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, request_id, type, title, message)
  values (p_user_id, p_request_id, p_type, p_title, coalesce(p_message, ''));
end;
$$;

create or replace function public.notify_managers(
  p_request_id bigint,
  p_type       text,
  p_title      text,
  p_message    text,
  p_exclude    uuid default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, request_id, type, title, message)
  select id, p_request_id, p_type, p_title, coalesce(p_message, '')
    from public.profiles
   where lower(role) = 'manager'
     and id is distinct from p_exclude;
end;
$$;


-- 5. Trigger functions ---------------------------------------------------------

-- New maintenance request -> every manager
create or replace function public.on_request_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_title text;
begin
  v_title := case lower(coalesce(new.priority, ''))
    when 'emergency' then 'Emergency maintenance request'
    when 'high'      then 'High priority request'
    else 'New maintenance request'
  end;

  perform public.notify_managers(
    new.id, 'request_created', v_title,
    format('%s reported "%s" at %s%s.',
      public.profile_name(new.tenant_id, 'A tenant'),
      new.title,
      new.property_name,
      case when coalesce(new.unit, '') <> '' then ' · ' || new.unit else '' end)
  );
  return null;
end;
$$;

-- Assignment / status changes
create or replace function public.on_request_updated()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_by_contractor boolean := auth.uid() is not null
                             and auth.uid() = new.assigned_contractor_id;
  v_where text := new.property_name
                  || case when coalesce(new.unit, '') <> '' then ' · ' || new.unit else '' end;
begin
  if new.assigned_contractor_id is distinct from old.assigned_contractor_id then

    if new.assigned_contractor_id is not null then
      perform public.notify_user(new.assigned_contractor_id, new.id, 'job_assigned',
        'New job assigned',
        format('"%s" at %s was assigned to you.', new.title, v_where));
      perform public.notify_user(new.tenant_id, new.id, 'contractor_assigned',
        'Contractor assigned',
        format('%s will handle "%s".',
          public.profile_name(new.assigned_contractor_id, 'A contractor'), new.title));
    end if;

    if old.assigned_contractor_id is not null then
      perform public.notify_user(old.assigned_contractor_id, new.id, 'job_unassigned',
        'Job unassigned',
        format('"%s" at %s is no longer assigned to you.', new.title, v_where));
    end if;

  -- A contractor's own status changes are announced by on_repair_update_created,
  -- so only manager-driven changes are handled here (avoids duplicate alerts).
  elsif new.status is distinct from old.status and not v_by_contractor then
    perform public.notify_user(new.tenant_id, new.id, 'status_changed',
      'Request status updated',
      format('"%s" is now %s.', new.title, new.status));
    perform public.notify_user(new.assigned_contractor_id, new.id, 'status_changed',
      'Job status updated',
      format('"%s" was marked %s.', new.title, new.status));
  end if;

  return null;
end;
$$;

-- Contractor posts an update or completes a job -> tenant + managers
create or replace function public.on_repair_update_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r        public.maintenance_requests%rowtype;
  v_done   boolean;
  v_type   text;
  v_title  text;
  v_msg    text;
begin
  select * into r from public.maintenance_requests where id = new.request_id;
  if not found then
    return null;
  end if;

  v_done  := lower(coalesce(new.status, '')) = 'completed';
  v_type  := case when v_done then 'job_completed' else 'repair_update' end;
  v_title := case when v_done then 'Repair completed' else 'New repair update' end;
  v_msg   := format('%s on "%s": %s',
               public.profile_name(new.contractor_id, 'The contractor'),
               r.title,
               left(coalesce(new.update_text, ''), 140));

  perform public.notify_user(r.tenant_id, r.id, v_type, v_title, v_msg);
  perform public.notify_managers(r.id, v_type, v_title, v_msg, new.contractor_id);
  return null;
end;
$$;

-- Tenant assigned to / removed from a property -> that tenant
create or replace function public.on_property_tenant_changed()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_label text := new.property_name
                  || case when coalesce(new.unit, '') <> '' then ' · ' || new.unit else '' end;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is not distinct from old.tenant_id then
      return null;
    end if;
    if old.tenant_id is not null then
      perform public.notify_user(old.tenant_id, null, 'property_unassigned',
        'Property removed',
        format('%s is no longer assigned to you.', v_label));
    end if;
  end if;

  if new.tenant_id is not null then
    perform public.notify_user(new.tenant_id, null, 'property_assigned',
      'Property assigned',
      format('%s was assigned to you. You can now report maintenance requests for it.', v_label));
  end if;

  return null;
end;
$$;


-- 6. Lock the functions down ---------------------------------------------------
-- Supabase exposes public functions as /rpc endpoints. These must only ever run
-- from the triggers, never be callable by a browser.
revoke execute on function public.profile_name(uuid, text)                          from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, bigint, text, text, text)       from public, anon, authenticated;
revoke execute on function public.notify_managers(bigint, text, text, text, uuid)   from public, anon, authenticated;
revoke execute on function public.on_request_created()                              from public, anon, authenticated;
revoke execute on function public.on_request_updated()                              from public, anon, authenticated;
revoke execute on function public.on_repair_update_created()                        from public, anon, authenticated;
revoke execute on function public.on_property_tenant_changed()                      from public, anon, authenticated;


-- 7. Triggers ------------------------------------------------------------------
drop trigger if exists trg_notify_request_created on public.maintenance_requests;
create trigger trg_notify_request_created
  after insert on public.maintenance_requests
  for each row execute function public.on_request_created();

drop trigger if exists trg_notify_request_updated on public.maintenance_requests;
create trigger trg_notify_request_updated
  after update of status, assigned_contractor_id on public.maintenance_requests
  for each row execute function public.on_request_updated();

drop trigger if exists trg_notify_repair_update on public.repair_updates;
create trigger trg_notify_repair_update
  after insert on public.repair_updates
  for each row execute function public.on_repair_update_created();

drop trigger if exists trg_notify_property_tenant on public.properties;
create trigger trg_notify_property_tenant
  after insert or update of tenant_id on public.properties
  for each row execute function public.on_property_tenant_changed();
