begin;

-- Scope changes are full replacements. All validation precedes any write;
-- locking Auth then profile keeps the same order as existing onboarding RPCs.
create function public.manage_profile_scopes(
 p_user_id uuid,p_full_name text,p_role text,p_active boolean,
 p_site_ids uuid[],p_resident_ids uuid[],p_verified boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_sites uuid[]:=coalesce(p_site_ids,'{}'); v_residents uuid[]:=coalesce(p_resident_ids,'{}');
 v_confirmed boolean; v_site uuid; v_resident uuid; v_resident_site uuid;
begin
 if care_private.actor_role() is distinct from 'owner' or p_verified is distinct from true then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 if p_user_id=auth.uid() and (p_role is distinct from 'owner' or p_active is distinct from true) then
  raise exception using errcode='42501',message='CARE_SELF_CHANGE_DENIED';
 end if;
 if p_role is null or p_role not in ('owner','manager','nurse','family') or p_active is null or
  length(btrim(coalesce(p_full_name,''))) not between 1 and 160 then
  raise exception using errcode='22023',message='CARE_INVALID_PROFILE';
 end if;
 if cardinality(v_sites)>100 or cardinality(v_residents)>1000 or
  array_position(v_sites,null) is not null or array_position(v_residents,null) is not null then
  raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
 end if;
 select coalesce(array_agg(distinct x order by x),'{}') into v_sites from unnest(v_sites) x;
 select coalesce(array_agg(distinct x order by x),'{}') into v_residents from unnest(v_residents) x;
 select email_confirmed_at is not null into v_confirmed from auth.users where id=p_user_id for update;
 if not found or (p_active and not v_confirmed) then
  raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE';
 end if;
 perform 1 from public.profiles where id=p_user_id for update;
 if (p_role='owner' and (cardinality(v_sites)>0 or cardinality(v_residents)>0)) or
  (p_role<>'owner' and cardinality(v_sites)=0) or
  (p_role='manager' and cardinality(v_residents)>0) or
  (p_role='family' and cardinality(v_residents)=0) then
  raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
 end if;
 foreach v_site in array v_sites loop
  perform 1 from public.sites where id=v_site for key share;
  if not found then raise exception using errcode='22023',message='CARE_INVALID_SCOPE'; end if;
 end loop;
 foreach v_resident in array v_residents loop
  select site_id into v_resident_site from public.residents where id=v_resident and active for share;
  if not found or not (v_resident_site=any(v_sites)) then
   raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
  end if;
 end loop;
 if p_role='family' and exists(select 1 from unnest(v_sites) s where not exists(
  select 1 from public.residents r where r.id=any(v_residents) and r.site_id=s)) then
  raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
 end if;
 perform public.manage_profile(p_user_id,btrim(p_full_name),p_role,p_active);
 delete from public.resident_access where user_id=p_user_id;
 delete from public.staff_sites where user_id=p_user_id;
 if p_role in ('manager','nurse') then
  insert into public.staff_sites(user_id,site_id) select p_user_id,unnest(v_sites);
 end if;
 insert into public.resident_access(user_id,resident_id) select p_user_id,unnest(v_residents);
 insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'profile.scopes.replace',p_user_id);
end;
$$;

-- Managers may add only nurse/family grants for their current sites. Existing
-- access outside their jurisdiction is preserved; role replacement is owner-only.
create function public.onboard_care_scopes(
 p_email text,p_full_name text,p_role text,p_site_ids uuid[],p_resident_ids uuid[],p_verified boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_sites uuid[]:=coalesce(p_site_ids,'{}'); v_residents uuid[]:=coalesce(p_resident_ids,'{}');
 v_actor text:=care_private.actor_role(); v_user uuid; v_existing text; v_active boolean;
 v_requested uuid; v_site uuid; v_resident uuid; v_resident_site uuid;
begin
 if v_actor is null or v_actor not in ('owner','manager') or p_verified is distinct from true then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 if p_role is null or p_role not in ('nurse','family') or
  length(btrim(coalesce(p_full_name,''))) not between 1 and 160 then
  raise exception using errcode='22023',message='CARE_INVALID_PROFILE';
 end if;
 if cardinality(v_sites) not between 1 and 100 or cardinality(v_residents)>1000 or
  array_position(v_sites,null) is not null or array_position(v_residents,null) is not null or
  (p_role='family' and cardinality(v_residents)=0) then
  raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
 end if;
 select coalesce(array_agg(distinct x order by x),'{}') into v_sites from unnest(v_sites) x;
 select coalesce(array_agg(distinct x order by x),'{}') into v_residents from unnest(v_residents) x;
 select u.id,case when u.raw_user_meta_data->>'requested_site_id' ~*
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then (u.raw_user_meta_data->>'requested_site_id')::uuid end
 into v_user,v_requested from auth.users u
 where lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null for update;
 if not found then raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE'; end if;
 select role,active into v_existing,v_active from public.profiles where id=v_user for update;
 foreach v_site in array v_sites loop
  if care_private.manages_site(v_site) is not true then
   raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
  perform 1 from public.sites where id=v_site for key share;
  if not found then raise exception using errcode='22023',message='CARE_INVALID_SCOPE'; end if;
 end loop;
 foreach v_resident in array v_residents loop
  select site_id into v_resident_site from public.residents where id=v_resident and active for share;
  if not found or not(v_resident_site=any(v_sites)) then
   raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
  end if;
 end loop;
 if p_role='family' and exists(select 1 from unnest(v_sites) s where not exists(
  select 1 from public.residents r where r.id=any(v_residents) and r.site_id=s)) then
  raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
 end if;
 if v_existing is null and v_actor='manager' and not exists(
  select 1 from care_private.account_invitations where email=lower(btrim(p_email)) and invited_by=auth.uid()) and
  (v_requested is null or not(v_requested=any(v_sites))) then
  raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE';
 end if;
 if v_existing is not null and (v_existing<>p_role or not v_active or
  care_private.can_manage_profile(v_user) is not true) then
  raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE';
 end if;
 insert into public.profiles(id,full_name,role,active) values(v_user,btrim(p_full_name),p_role,true)
 on conflict(id) do nothing;
 if p_role='nurse' then
  insert into public.staff_sites(user_id,site_id) select v_user,unnest(v_sites) on conflict do nothing;
 end if;
 insert into public.resident_access(user_id,resident_id) select v_user,unnest(v_residents) on conflict do nothing;
 insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'account.onboard.scopes.'||p_role,v_user);
end;
$$;

-- Bulk grant is a snapshot of today's active residents, never a permanent
-- unrestricted sector wildcard. Newly admitted residents require a new grant.
create function public.set_nurse_sector_access(p_user_id uuid,p_site_id uuid,p_grant boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
 if p_grant is null or care_private.manages_site(p_site_id) is not true then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 select role into v_role from public.profiles where id=p_user_id and active for update;
 if not found or v_role<>'nurse' or not exists(
  select 1 from public.staff_sites where user_id=p_user_id and site_id=p_site_id) then
  raise exception using errcode='42501',message='CARE_ASSIGNMENT_DENIED';
 end if;
 perform 1 from public.residents where site_id=p_site_id order by id for share;
 if p_grant then
  insert into public.resident_access(user_id,resident_id)
  select p_user_id,r.id from public.residents r where r.site_id=p_site_id and r.active on conflict do nothing;
 else
  delete from public.resident_access a using public.residents r
  where a.user_id=p_user_id and a.resident_id=r.id and r.site_id=p_site_id;
 end if;
 insert into public.audit_log(actor_id,action,target_id)
 values(auth.uid(),case when p_grant then 'nurse.sector.grant' else 'nurse.sector.revoke' end,p_user_id);
end;
$$;

-- Nursing team information exposes colleagues and supervision, never another
-- nurse's resident names/IDs. Family and pending users have no team directory.
create function public.get_my_team() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_role text:=care_private.actor_role(); v_sites uuid[]; v_residents uuid[];
begin
 if v_role is null or v_role not in ('owner','manager','nurse') then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 select coalesce(array_agg(s.id order by s.id),'{}') into v_sites from public.sites s
 where v_role='owner' or exists(select 1 from public.staff_sites a where a.user_id=auth.uid() and a.site_id=s.id);
 select coalesce(array_agg(r.id order by r.id),'{}') into v_residents from public.residents r
 where r.active and r.site_id=any(v_sites) and care_private.can_read(r.id);
 return jsonb_build_object(
  'sites',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name,s.id)
   from public.sites s where s.id=any(v_sites)),'[]'::jsonb),
  'residents',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'full_name',r.full_name,'site_id',r.site_id)
   order by r.full_name,r.id) from public.residents r where r.id=any(v_residents)),'[]'::jsonb),
  'staff',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'full_name',p.full_name,'role',p.role,
    'site_ids',coalesce((select jsonb_agg(a.site_id order by a.site_id) from public.staff_sites a
     where a.user_id=p.id and a.site_id=any(v_sites)),'[]'::jsonb),
    'resident_ids',coalesce((select jsonb_agg(a.resident_id order by a.resident_id) from public.resident_access a
     where a.user_id=p.id and a.resident_id=any(v_residents)),'[]'::jsonb),
    'assigned_count',(select count(*) from public.resident_access a join public.residents r on r.id=a.resident_id
     where a.user_id=p.id and r.active and r.site_id=any(v_sites))) order by p.role,p.full_name,p.id)
   from public.profiles p where p.active and p.role in ('owner','manager','nurse') and
    (p.role='owner' or exists(select 1 from public.staff_sites a where a.user_id=p.id and a.site_id=any(v_sites)))),'[]'::jsonb));
end;
$$;

revoke execute on function public.manage_profile_scopes(uuid,text,text,boolean,uuid[],uuid[],boolean),
 public.onboard_care_scopes(text,text,text,uuid[],uuid[],boolean),
 public.set_nurse_sector_access(uuid,uuid,boolean),public.get_my_team() from public,anon,authenticated;
grant execute on function public.manage_profile_scopes(uuid,text,text,boolean,uuid[],uuid[],boolean),
 public.onboard_care_scopes(text,text,text,uuid[],uuid[],boolean),
 public.set_nurse_sector_access(uuid,uuid,boolean),public.get_my_team() to authenticated;

notify pgrst,'reload schema';
commit;
