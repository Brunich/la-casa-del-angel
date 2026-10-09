begin;
create function public.onboard_care_account(p_email text,p_full_name text,p_role text,p_resident_id uuid,p_site_id uuid,p_verified boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_existing text; v_site uuid;
begin
 if care_private.actor_role() not in ('owner','manager') or care_private.actor_role() is null or p_verified is distinct from true then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 if p_role is null or p_role not in ('nurse','family','patient') or length(btrim(coalesce(p_full_name,''))) not between 1 and 160 then
  raise exception using errcode='22023',message='CARE_INVALID_PROFILE';
 end if;
 if p_resident_id is not null then
  select site_id into v_site from public.residents where id=p_resident_id and active;
  if v_site is null or care_private.manages_resident(p_resident_id) is not true then
   raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
 else v_site:=p_site_id;
 end if;
 if v_site is null or care_private.manages_site(v_site) is not true or (p_role in ('family','patient') and p_resident_id is null) or (p_site_id is not null and p_site_id<>v_site) then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 select id into v_user from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null for update;
 if v_user is null then raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE'; end if;
 select role into v_existing from public.profiles where id=v_user for update;
 if v_existing is not null and (v_existing<>p_role or care_private.can_manage_profile(v_user) is not true or not exists(select 1 from public.profiles where id=v_user and active)) then
  raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE';
 end if;
 if p_role='patient' and exists(select 1 from public.resident_access where user_id=v_user and resident_id<>p_resident_id) then
  raise exception using errcode='42501',message='CARE_ASSIGNMENT_DENIED';
 end if;
 insert into public.profiles(id,full_name,role,active) values(v_user,btrim(p_full_name),p_role,true) on conflict(id) do nothing;
 if p_role='nurse' then insert into public.staff_sites values(v_user,v_site) on conflict do nothing; end if;
 if p_resident_id is not null then insert into public.resident_access values(p_resident_id,v_user) on conflict do nothing; end if;
 insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'account.onboard.'||p_role,v_user);
end;
$$;
revoke all on function public.onboard_care_account(text,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.onboard_care_account(text,text,text,uuid,uuid,boolean) to authenticated;
commit;
