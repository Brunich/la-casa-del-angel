begin;

-- One administrative action updates role and access scope in one transaction.
-- Auth/profile locks also serialize onboarding and resident assignments.
create function public.manage_profile_and_scope(
 p_user_id uuid,p_full_name text,p_role text,p_active boolean,
 p_site_id uuid,p_resident_id uuid,p_verified boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_previous_role text; v_resident_site uuid; v_confirmed boolean;
begin
 if care_private.actor_role() is distinct from 'owner' or p_verified is distinct from true then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 if p_user_id=auth.uid() and (p_role is distinct from 'owner' or p_active is distinct from true) then
  raise exception using errcode='42501',message='CARE_SELF_CHANGE_DENIED';
 end if;
 if p_role is null or p_role not in ('owner','manager','nurse','family') or p_active is null then
  raise exception using errcode='22023',message='CARE_INVALID_PROFILE';
 end if;
 select email_confirmed_at is not null into v_confirmed from auth.users where id=p_user_id for update;
 if not found or (p_active and not v_confirmed) then
  raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE';
 end if;
 select role into v_previous_role from public.profiles where id=p_user_id for update;
 if p_role='owner' then
  if p_site_id is not null or p_resident_id is not null then
   raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
  end if;
 else
  perform 1 from public.sites where id=p_site_id for key share;
  if not found then raise exception using errcode='22023',message='CARE_INVALID_SCOPE'; end if;
  if p_resident_id is not null then
   select site_id into v_resident_site from public.residents where id=p_resident_id and active for share;
   if not found or v_resident_site is distinct from p_site_id then
    raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
   end if;
  end if;
  if (p_role='manager' and p_resident_id is not null) or
    (p_role='family' and p_resident_id is null) then
   raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
  end if;
 end if;

 -- A failed profile update rolls back all scope changes, including a
 -- last-owner trigger rejection.
 if v_previous_role is distinct from p_role or p_role<>'nurse' then
  delete from public.resident_access where user_id=p_user_id;
 else
  delete from public.resident_access a where a.user_id=p_user_id and not exists(
   select 1 from public.residents r where r.id=a.resident_id and r.site_id=p_site_id);
 end if;
 delete from public.staff_sites where user_id=p_user_id;
 perform public.manage_profile(p_user_id,p_full_name,p_role,p_active);
 if p_role in ('manager','nurse') then
  insert into public.staff_sites(user_id,site_id) values(p_user_id,p_site_id);
 end if;
 if p_resident_id is not null then
  insert into public.resident_access(resident_id,user_id) values(p_resident_id,p_user_id) on conflict do nothing;
 end if;
 insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'profile.scope',p_user_id);
end;
$$;

-- The legacy helper remains available only inside trusted server operations.
revoke execute on function public.manage_profile(uuid,text,text,boolean) from public,anon,authenticated;
revoke execute on function public.manage_profile_and_scope(uuid,text,text,boolean,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.manage_profile_and_scope(uuid,text,text,boolean,uuid,uuid,boolean) to authenticated;

commit;
