begin;

alter table public.sites add column is_demo boolean not null default false;
create or replace function public.get_registration_sites() returns table(id uuid,name text)
language sql stable security definer set search_path='' as $$
 select s.id,s.name from public.sites s where not s.is_demo order by s.name,s.id;
$$;

create table care_private.demo_workspace (
 singleton boolean primary key default true check(singleton),
 site_id uuid not null unique references public.sites(id),
 manager_id uuid unique references auth.users(id),
 nurse_id uuid unique references auth.users(id),
 created_at timestamptz not null default now(),
 check(manager_id is null or nurse_id is null or manager_id<>nurse_id)
);
alter table care_private.demo_workspace enable row level security;
revoke all on care_private.demo_workspace from public,anon,authenticated;

-- Synthetic fixtures explicitly requested by the operator; never copied patients.
-- Applied once: subsequent setup calls do not reset care records or medication stock.
insert into public.sites(id,name,is_demo) values('d3e00000-0000-4000-8000-000000000001','SIMULACIÓN · Pruebas',true);
insert into care_private.demo_workspace(site_id) values('d3e00000-0000-4000-8000-000000000001');
insert into public.residents(id,site_id,full_name,room,photo_consent) values
 ('d3e00000-0000-4000-8000-000000000101','d3e00000-0000-4000-8000-000000000001','SIMULACIÓN · Residente Uno','Prueba 1',true),
 ('d3e00000-0000-4000-8000-000000000102','d3e00000-0000-4000-8000-000000000001','SIMULACIÓN · Residente Dos','Prueba 2',true),
 ('d3e00000-0000-4000-8000-000000000103','d3e00000-0000-4000-8000-000000000001','SIMULACIÓN · Residente Tres','Prueba 3',true);
insert into public.medication_plans(id,resident_id,name,dose_amount,dose_unit,stock_unit,units_per_dose,doses_per_day,stock_remaining)
select 'd3e00000-0000-4000-8000-000000000201'::uuid,
 'd3e00000-0000-4000-8000-000000000101'::uuid,'SIMULACIÓN · Medicamento ficticio',1,'unidad de prueba','unidad de prueba',1,1,9;

create function care_private.demo_operator_allowed(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_user_id='54e5f326-3d49-468a-b50f-2e70c68b5091'::uuid and exists(
  select 1 from public.profiles p where p.id=p_user_id and p.role='owner' and p.active
  and exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.factor_type='totp' and f.status='verified')),false);
$$;

create function care_private.demo_target_safe(p_user_id uuid,p_role text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(p_role in ('manager','nurse') and exists(
  select 1 from care_private.demo_workspace d join public.sites s on s.id=d.site_id
   join public.profiles p on p.id=p_user_id join auth.users u on u.id=p.id
  where s.is_demo and p.active and p.role=p_role and u.email_confirmed_at is not null
   and p.id=case when p_role='manager' then d.manager_id else d.nurse_id end
   and lower(u.email)=case when p_role='manager' then 'demo-manager@casa-angel.example.invalid' else 'demo-nurse@casa-angel.example.invalid' end
   and u.raw_app_meta_data->>'care_demo_owner'='54e5f326-3d49-468a-b50f-2e70c68b5091'
   and u.raw_app_meta_data->>'care_demo_role'=p_role
   and exists(select 1 from auth.mfa_factors f where f.user_id=p.id and f.factor_type='totp' and f.status='verified')
   and exists(select 1 from public.staff_sites a where a.user_id=p.id and a.site_id=s.id)
   and not exists(select 1 from public.staff_sites a where a.user_id=p.id and a.site_id<>s.id)
   and not exists(select 1 from public.resident_access a join public.residents r on r.id=a.resident_id
    where a.user_id=p.id and (r.site_id<>s.id or p_role='manager'))
   and (p_role='manager' or exists(select 1 from public.resident_access a join public.residents r on r.id=a.resident_id
    where a.user_id=p.id and r.site_id=s.id))),false);
$$;

create function public.get_demo_workspace_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_demo care_private.demo_workspace%rowtype;
begin
 if care_private.demo_operator_allowed(auth.uid()) is not true then
  raise exception using errcode='42501',message='CARE_DEMO_FORBIDDEN';
 end if;
 select * into v_demo from care_private.demo_workspace where singleton;
 return jsonb_build_object('ready',coalesce(care_private.demo_target_safe(v_demo.manager_id,'manager') and
  care_private.demo_target_safe(v_demo.nurse_id,'nurse'),false),'site_id',v_demo.site_id);
end;
$$;

create function public.configure_demo_accounts(p_operator_id uuid,p_manager_id uuid,p_nurse_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_demo care_private.demo_workspace%rowtype; v_id uuid; v_role text; v_name text;
begin
 if care_private.demo_operator_allowed(p_operator_id) is not true then
  raise exception using errcode='42501',message='CARE_DEMO_FORBIDDEN';
 end if;
 if p_manager_id is null or p_nurse_id is null or p_manager_id=p_nurse_id then
  raise exception using errcode='22023',message='CARE_DEMO_INVALID_ACCOUNTS';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('care.demo.setup',0));
 select * into v_demo from care_private.demo_workspace where singleton for update;
 if not found or not exists(select 1 from public.sites where id=v_demo.site_id and is_demo) then
  raise exception using errcode='42501',message='CARE_DEMO_INVALID_SITE';
 end if;
 if v_demo.manager_id is not null or v_demo.nurse_id is not null then
  if v_demo.manager_id is distinct from p_manager_id or v_demo.nurse_id is distinct from p_nurse_id or
   care_private.demo_target_safe(p_manager_id,'manager') is not true or care_private.demo_target_safe(p_nurse_id,'nurse') is not true then
   raise exception using errcode='42501',message='CARE_DEMO_CHANGED';
  end if;
  return;
 end if;
 foreach v_id in array array[p_manager_id,p_nurse_id] loop
  v_role:=case when v_id=p_manager_id then 'manager' else 'nurse' end;
  v_name:=case when v_role='manager' then 'SIMULACIÓN · Manager' else 'SIMULACIÓN · Enfermería' end;
  perform 1 from auth.users u where u.id=v_id and u.email_confirmed_at is not null
   and lower(u.email)=case when v_role='manager' then 'demo-manager@casa-angel.example.invalid' else 'demo-nurse@casa-angel.example.invalid' end
   and u.raw_app_meta_data->>'care_demo_owner'=p_operator_id::text and u.raw_app_meta_data->>'care_demo_role'=v_role for update;
  if not found or exists(select 1 from public.profiles where id=v_id) or not exists(
   select 1 from auth.mfa_factors where user_id=v_id and factor_type='totp' and status='verified') then
   raise exception using errcode='42501',message='CARE_DEMO_INVALID_ACCOUNTS';
  end if;
  insert into public.profiles(id,full_name,role,active) values(v_id,v_name,v_role,true);
  insert into public.staff_sites(user_id,site_id) values(v_id,v_demo.site_id);
  if v_role='nurse' then
   insert into public.resident_access(user_id,resident_id)
   select v_id,id from public.residents where site_id=v_demo.site_id and active;
  end if;
 end loop;
 update care_private.demo_workspace set manager_id=p_manager_id,nurse_id=p_nurse_id where singleton;
 insert into public.audit_log(actor_id,action,target_id) values(p_operator_id,'demo.workspace.created',v_demo.site_id);
end;
$$;

create function public.resolve_demo_target(p_operator_id uuid,p_demo_role text,p_audit boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_target uuid; v_email text;
begin
 if care_private.demo_operator_allowed(p_operator_id) is not true or p_demo_role is null or p_demo_role not in ('manager','nurse') then
  raise exception using errcode='42501',message='CARE_DEMO_FORBIDDEN';
 end if;
 select case when p_demo_role='manager' then manager_id else nurse_id end into v_target
 from care_private.demo_workspace where singleton for share;
 if care_private.demo_target_safe(v_target,p_demo_role) is not true then
  raise exception using errcode='42501',message='CARE_DEMO_CHANGED';
 end if;
 select email into v_email from auth.users where id=v_target;
 if p_audit then
  insert into public.audit_log(actor_id,action,target_id) values(p_operator_id,'demo.session.'||p_demo_role,v_target);
 end if;
 return jsonb_build_object('user_id',v_target,'email',v_email);
end;
$$;

revoke execute on function care_private.demo_operator_allowed(uuid),care_private.demo_target_safe(uuid,text)
 from public,anon,authenticated;
revoke execute on function public.get_demo_workspace_status() from public,anon,authenticated;
grant execute on function public.get_demo_workspace_status() to authenticated;
revoke execute on function public.configure_demo_accounts(uuid,uuid,uuid),public.resolve_demo_target(uuid,text,boolean)
 from public,anon,authenticated;
grant execute on function public.configure_demo_accounts(uuid,uuid,uuid),public.resolve_demo_target(uuid,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
