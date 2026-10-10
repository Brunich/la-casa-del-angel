begin;
-- Only explicitly authorized family test identities are enrolled by the operator.
-- This private allowlist is never populated from a client-supplied email or ID.
create table care_private.demo_family_accounts (
 demo_role text primary key check(demo_role in ('family-one','family-two')),
 user_id uuid unique not null references auth.users(id),
 resident_id uuid unique not null references public.residents(id)
);
alter table care_private.demo_family_accounts enable row level security;
revoke all on care_private.demo_family_accounts from public,anon,authenticated;

create function care_private.demo_family_target_safe(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from care_private.demo_family_accounts d
  join public.profiles p on p.id=d.user_id join auth.users u on u.id=p.id
  join public.residents r on r.id=d.resident_id join public.sites s on s.id=r.site_id
  where d.user_id=p_user_id and p.active and p.role='family' and u.email_confirmed_at is not null
   and r.active and s.is_demo and s.id=(select site_id from care_private.demo_workspace where singleton)
   and exists(select 1 from public.resident_access a where a.user_id=p.id and a.resident_id=r.id)
   and not exists(select 1 from public.resident_access a where a.user_id=p.id and a.resident_id<>r.id)
   and not exists(select 1 from public.staff_sites a where a.user_id=p.id));
$$;
revoke execute on function care_private.demo_family_target_safe(uuid) from public,anon,authenticated;

create or replace function public.get_demo_workspace_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_demo care_private.demo_workspace%rowtype;
begin
 if care_private.demo_operator_allowed(auth.uid()) is not true then
  raise exception using errcode='42501',message='CARE_DEMO_FORBIDDEN';
 end if;
 select * into v_demo from care_private.demo_workspace where singleton;
 return jsonb_build_object('ready',coalesce(care_private.demo_target_safe(v_demo.manager_id,'manager') and
  care_private.demo_target_safe(v_demo.nurse_id,'nurse'),false),'site_id',v_demo.site_id,
  'families',coalesce((select jsonb_agg(d.demo_role order by d.demo_role)
   from care_private.demo_family_accounts d where care_private.demo_family_target_safe(d.user_id)),'[]'::jsonb));
end;
$$;

create or replace function public.resolve_demo_target(p_operator_id uuid,p_demo_role text,p_audit boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_target uuid; v_email text;
begin
 if care_private.demo_operator_allowed(p_operator_id) is not true then
  raise exception using errcode='42501',message='CARE_DEMO_FORBIDDEN';
 end if;
 if p_demo_role in ('manager','nurse') then
  select case when p_demo_role='manager' then manager_id else nurse_id end into v_target
   from care_private.demo_workspace where singleton for share;
  if care_private.demo_target_safe(v_target,p_demo_role) is not true then
   raise exception using errcode='42501',message='CARE_DEMO_CHANGED';
  end if;
 elsif p_demo_role in ('family-one','family-two') then
  select user_id into v_target from care_private.demo_family_accounts where demo_role=p_demo_role for share;
  if v_target is null or care_private.demo_family_target_safe(v_target) is not true then
   raise exception using errcode='42501',message='CARE_DEMO_CHANGED';
  end if;
 else
  raise exception using errcode='42501',message='CARE_DEMO_FORBIDDEN';
 end if;
 select email into v_email from auth.users where id=v_target;
 if p_audit then
  insert into public.audit_log(actor_id,action,target_id) values(p_operator_id,'demo.session.'||p_demo_role,v_target);
 end if;
 return jsonb_build_object('user_id',v_target,'email',v_email);
end;
$$;

create or replace function care_private.actor_role() returns text
language sql stable security definer set search_path='' as $$
 select p.role from public.profiles p where p.id=auth.uid() and p.active
 and (p.role in ('family','patient') or exists(
  select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified' and f.factor_type='totp'))
 and not exists(select 1 from care_private.demo_workspace d where
  (d.manager_id=p.id and care_private.demo_target_safe(p.id,'manager') is not true) or
  (d.nurse_id=p.id and care_private.demo_target_safe(p.id,'nurse') is not true))
 and not exists(select 1 from care_private.demo_family_accounts d where d.user_id=p.id
  and care_private.demo_family_target_safe(p.id) is not true);
$$;
notify pgrst,'reload schema';
commit;
