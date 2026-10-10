begin;

-- A profile whose last assignment was revoked can still be suspended. Empty
-- scope is accepted for inactive profiles; activating one still requires scope.
create or replace function public.manage_profile_scopes(
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
  (p_role<>'owner' and cardinality(v_sites)=0 and (p_active or cardinality(v_residents)>0)) or
  (p_role='manager' and cardinality(v_residents)>0) or
  (p_role='family' and cardinality(v_residents)=0 and (p_active or cardinality(v_sites)>0)) then
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

revoke execute on function public.manage_profile_scopes(uuid,text,text,boolean,uuid[],uuid[],boolean)
 from public,anon,authenticated;
grant execute on function public.manage_profile_scopes(uuid,text,text,boolean,uuid[],uuid[],boolean) to authenticated;
notify pgrst,'reload schema';
commit;
