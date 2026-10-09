-- New Supabase project only. Apply as postgres after Auth and Storage migrations.
begin;

create schema care_private;
revoke all on schema care_private from public, anon, authenticated;
grant usage on schema care_private to authenticated;
revoke create on schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema care_private revoke execute on functions from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  role text not null check (role in ('owner','manager','nurse','family','patient')),
  active boolean not null default true
);
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160)
);
create table public.staff_sites (
  user_id uuid not null references public.profiles(id) on delete restrict,
  site_id uuid not null references public.sites(id) on delete restrict,
  primary key (user_id,site_id)
);
create table public.residents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete restrict,
  full_name text not null check (length(btrim(full_name)) between 1 and 160),
  room text not null default '' check (length(room)<=80),
  active boolean not null default true,
  photo_consent boolean not null default false
);
create table public.resident_access (
  resident_id uuid not null references public.residents(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  primary key (resident_id,user_id)
);
create table public.care_events (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('bath','meal','activity','medication','incident','observation')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  notes text check (length(notes)<=5000),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  photo_path text,
  check (occurred_at<=recorded_at+interval '5 minutes')
);
create table public.medication_plans (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 160),
  dose_amount numeric(12,4) not null check (dose_amount>0 and dose_amount<>'NaN'::numeric),
  dose_unit text not null check (length(btrim(dose_unit)) between 1 and 40),
  stock_unit text not null check (length(btrim(stock_unit)) between 1 and 40),
  units_per_dose numeric(12,4) not null check (units_per_dose>0 and units_per_dose<>'NaN'::numeric),
  doses_per_day numeric(12,4) check (doses_per_day>0 and doses_per_day<>'NaN'::numeric),
  stock_remaining numeric(12,4) not null default 0 check (stock_remaining>=0 and stock_remaining<>'NaN'::numeric),
  low_stock_threshold numeric(12,4) not null default 7 check (low_stock_threshold>=0 and low_stock_threshold<>'NaN'::numeric),
  active boolean not null default true
);
create table public.medication_movements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.medication_plans(id) on delete restrict,
  event_id uuid unique references public.care_events(id) on delete restrict,
  request_id uuid,
  units_delta numeric(12,4) not null check (units_delta<>0),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  medication_name text not null,
  stock_unit text not null,
  actor_name text not null,
  check ((event_id is null and request_id is not null and units_delta>0) or
    (event_id is not null and request_id is null and units_delta<0))
);
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete restrict,
  kind text not null check (kind in ('bath','meal','activity','medication','incident','observation')),
  due_at timestamptz not null,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  cancelled_at timestamptz,
  medication_plan_id uuid references public.medication_plans(id) on delete restrict,
  check ((kind='medication' and medication_plan_id is not null) or (kind<>'medication' and medication_plan_id is null)),
  check (completed_at is null or cancelled_at is null)
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  target_id uuid,
  created_at timestamptz not null default now()
);

create index residents_site_idx on public.residents(site_id);
create index staff_sites_site_idx on public.staff_sites(site_id,user_id);
create index resident_access_user_idx on public.resident_access(user_id,resident_id);
create index care_events_timeline_idx on public.care_events(resident_id,occurred_at desc,recorded_at desc);
create unique index care_events_request_idx on public.care_events(actor_id,(details->>'request_id'));
create index medication_plans_resident_idx on public.medication_plans(resident_id);
create index medication_movements_plan_idx on public.medication_movements(plan_id,created_at);
create unique index medication_movements_request_idx on public.medication_movements(actor_id,request_id) where request_id is not null;
create index reminders_pending_idx on public.reminders(user_id,due_at) where completed_at is null and cancelled_at is null;
create index audit_log_actor_idx on public.audit_log(actor_id,created_at);

-- Authorization is always from current database relationships, never user_metadata.
create function care_private.actor_role() returns text
language sql stable security definer set search_path='' as $$
  select role from public.profiles where id=auth.uid() and active
    and (role in ('family','patient') or auth.jwt()->>'aal'='aal2');
$$;
create function care_private.manages_site(p_site_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(care_private.actor_role()='owner' or
    (care_private.actor_role()='manager' and exists(
      select 1 from public.staff_sites where user_id=auth.uid() and site_id=p_site_id)),false);
$$;
create function care_private.manages_resident(p_resident_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.residents where id=p_resident_id and care_private.manages_site(site_id));
$$;
create function care_private.can_record(p_resident_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.residents r where r.id=p_resident_id and r.active and
    (care_private.manages_site(r.site_id) or
      (care_private.actor_role()='nurse' and exists(select 1 from public.staff_sites s where s.user_id=auth.uid() and s.site_id=r.site_id)
       and exists(select 1 from public.resident_access a where a.resident_id=r.id and a.user_id=auth.uid()))));
$$;
create function care_private.can_read(p_resident_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(care_private.manages_resident(p_resident_id) or care_private.can_record(p_resident_id) or
    (care_private.actor_role() in ('family','patient') and exists(
      select 1 from public.resident_access a join public.residents r on r.id=a.resident_id
      where r.id=p_resident_id and r.active and a.user_id=auth.uid())),false);
$$;
create function care_private.can_manage_profile(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(care_private.actor_role()='owner' or
    (care_private.actor_role()='manager' and (
      exists(select 1 from public.staff_sites where user_id=p_user_id and care_private.manages_site(site_id)) or
      exists(select 1 from public.resident_access where user_id=p_user_id and care_private.manages_resident(resident_id)))),false);
$$;
create function care_private.valid_reminder(p_resident_id uuid,p_kind text,p_plan_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select care_private.can_record(p_resident_id) and
    ((p_kind<>'medication' and p_plan_id is null) or (p_kind='medication' and exists(
      select 1 from public.medication_plans where id=p_plan_id and resident_id=p_resident_id and active)));
$$;
create function care_private.photo_resident(p_name text) returns uuid
language sql immutable set search_path='' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    then split_part(p_name,'/',1)::uuid end;
$$;
create function care_private.photo_upload_allowed(p_name text,p_owner text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_owner=auth.uid()::text and care_private.can_record(care_private.photo_resident(p_name)) and exists(
    select 1 from public.residents where id=care_private.photo_resident(p_name) and photo_consent);
$$;
create function care_private.photo_read_allowed(p_name text,p_owner text) returns boolean
language sql stable security definer set search_path='' as $$
  select care_private.can_read(care_private.photo_resident(p_name)) and exists(
    select 1 from public.residents where id=care_private.photo_resident(p_name) and photo_consent) and
    (exists(select 1 from public.care_events where resident_id=care_private.photo_resident(p_name) and photo_path=p_name) or
      (p_owner=auth.uid()::text and care_private.can_record(care_private.photo_resident(p_name))));
$$;
create function care_private.photo_delete_allowed(p_name text,p_owner text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_owner=auth.uid()::text and care_private.can_record(care_private.photo_resident(p_name)) and
    not exists(select 1 from public.care_events where photo_path=p_name);
$$;
create function care_private.protect_photo_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.bucket_id='care-photos' then
    -- Same lock as clinical attachment: draft deletion cannot race registration.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photo:'||old.name,0));
    if exists(select 1 from public.care_events where photo_path=old.name) then
      raise exception using errcode='42501',message='CARE_PHOTO_IN_USE';
    end if;
  end if;
  return old;
end;
$$;
create trigger care_photos_protect_evidence before delete on storage.objects
for each row execute function care_private.protect_photo_evidence();

create function care_private.protect_owner() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Serializes all owner removals, including simultaneous changes and Auth deletion.
  if old.role='owner' and old.active and (tg_op='DELETE' or new.role<>'owner' or not new.active) then
    perform pg_catalog.pg_advisory_xact_lock(708124001);
    if not exists(select 1 from public.profiles where role='owner' and active and id<>old.id) then
      raise exception using errcode='42501',message='CARE_OWNER_REQUIRED';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger protect_last_owner before update or delete on public.profiles
for each row execute function care_private.protect_owner();

create function care_private.append_only() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception using errcode='42501',message='CARE_APPEND_ONLY';
end;
$$;
create trigger events_append_only before update or delete on public.care_events
for each row execute function care_private.append_only();
create trigger movements_append_only before update or delete on public.medication_movements
for each row execute function care_private.append_only();
create trigger audit_append_only before update or delete on public.audit_log
for each row execute function care_private.append_only();

-- Small policy helpers are executable but care_private is not an exposed API schema.
revoke execute on all functions in schema care_private from public,anon,authenticated;
grant execute on function care_private.actor_role(),care_private.manages_site(uuid),care_private.manages_resident(uuid),
  care_private.can_record(uuid),care_private.can_read(uuid),care_private.can_manage_profile(uuid),
  care_private.valid_reminder(uuid,text,uuid),care_private.photo_upload_allowed(text,text),
  care_private.photo_read_allowed(text,text),care_private.photo_delete_allowed(text,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.staff_sites enable row level security;
alter table public.residents enable row level security;
alter table public.resident_access enable row level security;
alter table public.care_events enable row level security;
alter table public.medication_plans enable row level security;
alter table public.medication_movements enable row level security;
alter table public.reminders enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles,public.sites,public.staff_sites,public.residents,public.resident_access,
 public.care_events,public.medication_plans,public.medication_movements,public.reminders,public.audit_log
 from public,anon,authenticated;
revoke all on sequence public.audit_log_id_seq from public,anon,authenticated;
grant select on public.profiles,public.sites,public.staff_sites,public.residents,public.resident_access,public.reminders,public.medication_plans to authenticated;
grant insert(id,name),update(name) on public.sites to authenticated;
grant insert(id,site_id,full_name,room,active,photo_consent) on public.residents to authenticated;
grant update(site_id,full_name,room,active,photo_consent) on public.residents to authenticated;
grant insert(id,resident_id,name,dose_amount,dose_unit,stock_unit,units_per_dose,doses_per_day,stock_remaining,low_stock_threshold,active) on public.medication_plans to authenticated;
grant update(name,dose_amount,dose_unit,stock_unit,units_per_dose,doses_per_day,low_stock_threshold,active) on public.medication_plans to authenticated;
grant insert(id,resident_id,kind,due_at,user_id,medication_plan_id) on public.reminders to authenticated;

create policy profiles_read on public.profiles for select to authenticated
using ((id=auth.uid() and active) or care_private.can_manage_profile(id));
create policy sites_read on public.sites for select to authenticated
using (care_private.manages_site(id) or (care_private.actor_role()='nurse' and exists(
  select 1 from public.staff_sites where user_id=auth.uid() and site_id=sites.id)));
create policy sites_insert on public.sites for insert to authenticated with check (care_private.actor_role()='owner');
create policy sites_update on public.sites for update to authenticated
using (care_private.actor_role()='owner') with check (care_private.actor_role()='owner');
create policy staff_sites_read on public.staff_sites for select to authenticated
using ((user_id=auth.uid() and care_private.actor_role() in ('owner','manager','nurse')) or care_private.manages_site(site_id));
create policy residents_read on public.residents for select to authenticated using (care_private.can_read(id));
create policy residents_insert on public.residents for insert to authenticated with check (care_private.manages_site(site_id));
create policy residents_update on public.residents for update to authenticated
using (care_private.manages_site(site_id)) with check (care_private.manages_site(site_id));
create policy resident_access_read on public.resident_access for select to authenticated
using ((user_id=auth.uid() and care_private.can_read(resident_id)) or care_private.manages_resident(resident_id));
create policy plans_read_admin on public.medication_plans for select to authenticated using (care_private.manages_resident(resident_id));
create policy plans_insert on public.medication_plans for insert to authenticated with check (care_private.manages_resident(resident_id) and stock_remaining=0);
create policy plans_update on public.medication_plans for update to authenticated
using (care_private.manages_resident(resident_id)) with check (care_private.manages_resident(resident_id));
create policy reminders_read on public.reminders for select to authenticated
using (user_id=auth.uid() and care_private.can_record(resident_id));
create policy reminders_insert on public.reminders for insert to authenticated
with check (user_id=auth.uid() and completed_at is null and cancelled_at is null and care_private.valid_reminder(resident_id,kind,medication_plan_id));

create function public.record_care_event(
 p_resident_id uuid,p_kind text,p_occurred_at timestamptz,p_notes text,p_details jsonb,p_photo_path text,
 p_medication_plan_id uuid default null,p_units_taken numeric default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_existing public.care_events;
  v_plan public.medication_plans;
  v_details jsonb := coalesce(p_details,'{}'::jsonb);
  v_status text;
  v_request text;
  v_consent boolean;
  v_correction uuid;
begin
  if v_actor is null or care_private.can_record(p_resident_id) is not true then
    raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
  if p_kind is null or p_kind not in ('bath','meal','activity','medication','incident','observation') or
     p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' or
     length(p_notes)>5000 or
     jsonb_typeof(v_details)<>'object' or octet_length(v_details::text)>12000 then
    raise exception using errcode='22023',message='CARE_INVALID_EVENT';
  end if;
  v_request := v_details->>'request_id';
  if v_request is null or v_request !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    v_details ?| array['medication_name','dose_amount','dose_unit','inventory_units','stock_unit','medication_plan_id','recorded_by'] then
    raise exception using errcode='22023',message='CARE_INVALID_DETAILS';
  end if;
  -- A request UUID belongs to one actor. Lock precedes checking to serialize retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||v_request,0));
  select * into v_existing from public.care_events where actor_id=v_actor and details->>'request_id'=v_request;
  if found then
    if v_existing.resident_id<>p_resident_id or v_existing.kind<>p_kind or
      v_existing.occurred_at<>p_occurred_at or v_existing.notes is distinct from p_notes or
      v_existing.photo_path is distinct from p_photo_path or
      (v_existing.details-array['medication_name','dose_amount','dose_unit','inventory_units','stock_unit','medication_plan_id','recorded_by'])<>v_details or
      (v_existing.details->>'medication_plan_id') is distinct from p_medication_plan_id::text or
      (v_existing.details->>'inventory_units')::numeric is distinct from p_units_taken then
      raise exception using errcode='22023',message='CARE_REQUEST_CONFLICT';
    end if;
    return v_existing.id;
  end if;
  select photo_consent into v_consent from public.residents where id=p_resident_id for share;
  if p_photo_path is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photo:'||p_photo_path,0));
    if not v_consent or care_private.photo_resident(p_photo_path) is distinct from p_resident_id or
      not exists(select 1 from storage.objects where bucket_id='care-photos' and name=p_photo_path and owner_id=v_actor::text) then
      raise exception using errcode='22023',message='CARE_INVALID_PHOTO';
    end if;
  end if;
  if v_details ? 'corrects_event_id' then
    if p_kind<>'observation' or coalesce(v_details->>'corrects_event_id','') !~ '^[0-9a-f-]{36}$' then
      raise exception using errcode='22023',message='CARE_INVALID_CORRECTION';
    end if;
    begin v_correction := (v_details->>'corrects_event_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode='22023',message='CARE_INVALID_CORRECTION';
    end;
    if not exists(select 1 from public.care_events where id=v_correction and resident_id=p_resident_id) then
      raise exception using errcode='22023',message='CARE_INVALID_CORRECTION';
    end if;
  end if;
  if p_kind='incident' and (jsonb_typeof(v_details->'incident_type') is distinct from 'string' or
    coalesce(v_details->>'incident_type','') not in ('vomiting','fall','pain','fever','other') or
    jsonb_typeof(v_details->'handled_by') is distinct from 'string' or
    jsonb_typeof(v_details->'actions') is distinct from 'string' or
    length(btrim(coalesce(v_details->>'handled_by','')))=0 or length(btrim(coalesce(v_details->>'actions','')))=0) then
    raise exception using errcode='22023',message='CARE_INCIDENT_DETAILS_REQUIRED';
  end if;
  if p_kind='medication' then
    v_status := v_details->>'status';
    if v_status is null or v_status not in ('administered','refused','omitted') or p_medication_plan_id is null then
      raise exception using errcode='22023',message='CARE_INVALID_MEDICATION';
    end if;
    if v_status in ('refused','omitted') and length(btrim(coalesce(p_notes,'')))=0 then
      raise exception using errcode='22023',message='CARE_MEDICATION_REASON_REQUIRED';
    end if;
    select * into v_plan from public.medication_plans where id=p_medication_plan_id and resident_id=p_resident_id and active for update;
    if not found then raise exception using errcode='22023',message='CARE_INVALID_MEDICATION'; end if;
    if v_status='administered' then
      if p_units_taken is null or p_units_taken<=0 or p_units_taken<>v_plan.units_per_dose then
        raise exception using errcode='22023',message='CARE_INVALID_UNITS';
      end if;
      if v_plan.stock_remaining<p_units_taken then raise exception using errcode='22023',message='CARE_STOCK_INSUFFICIENT'; end if;
      if (v_consent and p_photo_path is null) or
        (not v_consent and (p_photo_path is not null or jsonb_typeof(v_details->'no_photo_reason') is distinct from 'string' or
          length(btrim(coalesce(v_details->>'no_photo_reason','')))=0)) then
        raise exception using errcode='22023',message='CARE_PHOTO_REQUIRED';
      end if;
    elsif p_units_taken is not null then
      raise exception using errcode='22023',message='CARE_INVALID_UNITS';
    end if;
    v_details := v_details || jsonb_build_object('medication_plan_id',v_plan.id,'medication_name',v_plan.name,
      'dose_amount',v_plan.dose_amount,'dose_unit',v_plan.dose_unit,'stock_unit',v_plan.stock_unit,
      'inventory_units',case when v_status='administered' then p_units_taken else null end);
  elsif p_medication_plan_id is not null or p_units_taken is not null then
    raise exception using errcode='22023',message='CARE_INVALID_MEDICATION';
  end if;
  v_details := v_details || jsonb_build_object('recorded_by',(select full_name from public.profiles where id=v_actor));
  insert into public.care_events(resident_id,actor_id,kind,occurred_at,notes,details,photo_path)
    values(p_resident_id,v_actor,p_kind,p_occurred_at,p_notes,v_details,p_photo_path) returning id into v_id;
  if p_kind='medication' and v_status='administered' then
    update public.medication_plans set stock_remaining=stock_remaining-p_units_taken where id=v_plan.id;
    insert into public.medication_movements(plan_id,event_id,units_delta,actor_id,reason,medication_name,stock_unit,actor_name)
      values(v_plan.id,v_id,-p_units_taken,v_actor,'administration',v_plan.name,v_plan.stock_unit,
        (select full_name from public.profiles where id=v_actor));
  end if;
  update public.reminders set completed_at=now()
    where resident_id=p_resident_id and user_id=v_actor and kind=p_kind and completed_at is null and cancelled_at is null
      and medication_plan_id is not distinct from p_medication_plan_id and due_at<=p_occurred_at
      and (due_at at time zone 'America/Mexico_City')::date=(p_occurred_at at time zone 'America/Mexico_City')::date;
  insert into public.audit_log(actor_id,action,target_id) values(v_actor,'care.record',v_id);
  return v_id;
end;
$$;

create function public.register_stock(p_plan_id uuid,p_units numeric,p_reason text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_plan public.medication_plans; v_existing public.medication_movements; v_id uuid;
begin
  -- Current authorization is checked even for an already completed request.
  select * into v_plan from public.medication_plans where id=p_plan_id;
  if v_actor is null or not found or care_private.manages_resident(v_plan.resident_id) is not true then
    raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
  if p_request_id is null or p_units is null or p_units<=0 or p_units='NaN'::numeric or p_units>99999999 or
    p_units<>round(p_units,4) or length(btrim(coalesce(p_reason,''))) not between 1 and 500 then
    raise exception using errcode='22023',message='CARE_INVALID_STOCK';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('stock:'||v_actor::text||':'||p_request_id::text,0));
  select * into v_existing from public.medication_movements where actor_id=v_actor and request_id=p_request_id;
  if found then
    if v_existing.plan_id is distinct from p_plan_id or v_existing.units_delta is distinct from p_units or
      v_existing.reason is distinct from p_reason then
      raise exception using errcode='22023',message='CARE_REQUEST_CONFLICT';
    end if;
    return v_existing.id;
  end if;
  select * into v_plan from public.medication_plans where id=p_plan_id for update;
  if not found or care_private.manages_resident(v_plan.resident_id) is not true then
    raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
  if not v_plan.active then raise exception using errcode='22023',message='CARE_INVALID_STOCK'; end if;
  update public.medication_plans set stock_remaining=stock_remaining+p_units where id=p_plan_id;
  insert into public.medication_movements(plan_id,units_delta,actor_id,reason,request_id,medication_name,stock_unit,actor_name)
    values(p_plan_id,p_units,v_actor,p_reason,p_request_id,v_plan.name,v_plan.stock_unit,
      (select full_name from public.profiles where id=v_actor)) returning id into v_id;
  insert into public.audit_log(actor_id,action,target_id) values(v_actor,'stock.register',v_id);
  return v_id;
end;
$$;
create function public.get_resident_timeline(p_resident_id uuid) returns setof public.care_events
language plpgsql security definer set search_path='' as $$
begin
  if care_private.can_read(p_resident_id) is not true then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
  insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'timeline.read',p_resident_id);
  return query select * from public.care_events where resident_id=p_resident_id order by occurred_at desc,recorded_at desc,id;
end;
$$;
create function public.get_medication_plans(p_resident_id uuid) returns setof public.medication_plans
language plpgsql security definer set search_path='' as $$
begin
  if care_private.can_read(p_resident_id) is not true then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
  insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'medications.read',p_resident_id);
  return query select * from public.medication_plans where resident_id=p_resident_id order by name,id;
end;
$$;
create function public.get_accessible_medication_plans() returns setof public.medication_plans
language plpgsql security definer set search_path='' as $$
begin
  if care_private.actor_role() is null then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
  insert into public.audit_log(actor_id,action) values(auth.uid(),'medications.accessible.read');
  return query select p.* from public.medication_plans p where p.active and care_private.can_read(p.resident_id)
    order by p.resident_id,p.name,p.id;
end;
$$;
create function public.get_medication_movements(p_resident_id uuid)
returns table(id uuid,plan_id uuid,medication_name text,event_id uuid,units_delta numeric,stock_unit text,
  created_at timestamptz,reason text,actor_name text)
language plpgsql security definer set search_path='' as $$
begin
  if care_private.can_read(p_resident_id) is not true then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
  insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'movements.read',p_resident_id);
  return query select m.id,m.plan_id,m.medication_name,m.event_id,m.units_delta,m.stock_unit,m.created_at,m.reason,m.actor_name
    from public.medication_movements m join public.medication_plans p on p.id=m.plan_id
    where p.resident_id=p_resident_id order by m.created_at desc,m.id;
end;
$$;
create function public.cancel_reminder(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_reminder public.reminders;
begin
  select * into v_reminder from public.reminders where id=p_id and user_id=auth.uid() for update;
  if not found or care_private.can_record(v_reminder.resident_id) is not true then
    raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
  if v_reminder.completed_at is not null then raise exception using errcode='22023',message='CARE_REMINDER_COMPLETED'; end if;
  if v_reminder.cancelled_at is not null then return; end if;
  update public.reminders set cancelled_at=now() where reminders.id=p_id;
  insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'reminder.cancel',p_id);
end;
$$;

-- Provision Auth accounts with the trusted Admin API first; no user-creation trigger.
create function public.manage_profile(p_user_id uuid,p_full_name text,p_role text,p_active boolean default true) returns void
language plpgsql security definer set search_path='' as $$
begin
  if care_private.actor_role() is distinct from 'owner' then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
  if p_role is null or p_role not in ('owner','manager','nurse','family','patient') or p_active is null or
    length(btrim(coalesce(p_full_name,''))) not between 1 and 160 or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception using errcode='22023',message='CARE_INVALID_PROFILE';
  end if;
  -- Same profile lock as set_resident_access serializes conversion and assignment.
  perform 1 from public.profiles where id=p_user_id for update;
  if p_role='patient' and (select count(*) from public.resident_access where user_id=p_user_id)>1 then
    raise exception using errcode='42501',message='CARE_ASSIGNMENT_DENIED';
  end if;
  insert into public.profiles(id,full_name,role,active) values(p_user_id,p_full_name,p_role,p_active)
    on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,active=excluded.active;
  insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'profile.manage',p_user_id);
end;
$$;
create function public.set_staff_site(p_user_id uuid,p_site_id uuid,p_assigned boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
  if care_private.manages_site(p_site_id) is not true then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
  select role into v_role from public.profiles where id=p_user_id and active for share;
  if p_assigned is null or v_role is null or v_role not in ('owner','manager','nurse') or
    (care_private.actor_role()='manager' and v_role<>'nurse') then
    raise exception using errcode='42501',message='CARE_ASSIGNMENT_DENIED';
  end if;
  if p_assigned then insert into public.staff_sites values(p_user_id,p_site_id) on conflict do nothing;
  else delete from public.staff_sites where user_id=p_user_id and site_id=p_site_id; end if;
  insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'staff.assignment',p_user_id);
end;
$$;
create function public.set_resident_access(p_resident_id uuid,p_user_id uuid,p_assigned boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_role text; v_site uuid;
begin
  if care_private.manages_resident(p_resident_id) is not true then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
  select role into v_role from public.profiles where id=p_user_id and active for update;
  select site_id into v_site from public.residents where id=p_resident_id;
  if p_assigned is null or v_role is null or v_role not in ('nurse','family','patient') or
    (p_assigned and v_role='nurse' and not exists(select 1 from public.staff_sites where user_id=p_user_id and site_id=v_site)) or
    (p_assigned and v_role='patient' and exists(select 1 from public.resident_access where user_id=p_user_id and resident_id<>p_resident_id)) then
    raise exception using errcode='42501',message='CARE_ASSIGNMENT_DENIED';
  end if;
  if p_assigned then insert into public.resident_access values(p_resident_id,p_user_id) on conflict do nothing;
  else delete from public.resident_access where resident_id=p_resident_id and user_id=p_user_id; end if;
  insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'resident.assignment',p_resident_id);
end;
$$;
revoke execute on function public.record_care_event(uuid,text,timestamptz,text,jsonb,text,uuid,numeric),
 public.register_stock(uuid,numeric,text,uuid),public.get_resident_timeline(uuid),public.get_medication_plans(uuid),
 public.get_accessible_medication_plans(),public.get_medication_movements(uuid),public.cancel_reminder(uuid),
 public.manage_profile(uuid,text,text,boolean),public.set_staff_site(uuid,uuid,boolean),public.set_resident_access(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.record_care_event(uuid,text,timestamptz,text,jsonb,text,uuid,numeric),
 public.register_stock(uuid,numeric,text,uuid),public.get_resident_timeline(uuid),public.get_medication_plans(uuid),
 public.get_accessible_medication_plans(),public.get_medication_movements(uuid),public.cancel_reminder(uuid),
 public.manage_profile(uuid,text,text,boolean),public.set_staff_site(uuid,uuid,boolean),public.set_resident_access(uuid,uuid,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('care-photos','care-photos',false,614400,array['image/jpeg']);
-- The database must be a dedicated new project without other storage policies.
create policy care_photos_insert on storage.objects for insert to authenticated
with check (bucket_id='care-photos' and care_private.photo_upload_allowed(name,owner_id));
create policy care_photos_select on storage.objects for select to authenticated
using (bucket_id='care-photos' and care_private.photo_read_allowed(name,owner_id));
create policy care_photos_delete_draft on storage.objects for delete to authenticated
using (bucket_id='care-photos' and care_private.photo_delete_allowed(name,owner_id));
-- No UPDATE policy; DELETE permits only an uploader's unreferenced draft.

commit;
