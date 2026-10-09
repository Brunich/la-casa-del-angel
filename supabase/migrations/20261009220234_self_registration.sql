begin;

-- Public registration may choose a site, but this never grants a profile/access.
create function public.get_registration_sites() returns table(id uuid,name text)
language sql stable security definer set search_path='' as $$
 select s.id,s.name from public.sites s order by s.name,s.id;
$$;
revoke execute on function public.get_registration_sites() from public,anon,authenticated;
grant execute on function public.get_registration_sites() to anon,authenticated;

-- Only the caller's own state: distinguish no profile from a suspended profile.
create function public.get_my_access_status() returns text
language plpgsql stable security definer set search_path='' as $$
declare v_active boolean;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='CARE_ACCESS_DENIED'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
  return 'unconfirmed';
 end if;
 select active into v_active from public.profiles where id=auth.uid();
 if not found then return 'pending'; end if;
 if not v_active then return 'inactive'; end if;
 return 'active';
end;
$$;
revoke execute on function public.get_my_access_status() from public,anon,authenticated;
grant execute on function public.get_my_access_status() to authenticated;

-- User-editable metadata is only a request to route for manual review.
-- A real site, confirmed email and current manager assignment are all required.
drop function public.get_admin_accounts();
create function public.get_admin_accounts() returns table(
 id uuid,full_name text,email text,role text,active boolean,confirmed boolean,requested_site_id uuid
)
language plpgsql security definer set search_path='' as $$
begin
 if care_private.actor_role() is null or care_private.actor_role() not in ('owner','manager') then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 return query
 select u.id,coalesce(p.full_name,nullif(left(btrim(u.raw_user_meta_data->>'full_name'),160),''),u.email)::text,
  u.email::text,p.role,coalesce(p.active,false),u.email_confirmed_at is not null,s.id
 from auth.users u
 left join public.profiles p on p.id=u.id
 left join public.sites s on s.id=case
  when u.raw_user_meta_data->>'requested_site_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then (u.raw_user_meta_data->>'requested_site_id')::uuid end
 where u.email is not null and (
  care_private.actor_role()='owner' or care_private.can_manage_profile(u.id) or
  (p.id is null and (
   exists(select 1 from care_private.account_invitations i where i.email=lower(u.email) and i.invited_by=auth.uid()) or
   (u.email_confirmed_at is not null and s.id is not null and care_private.manages_site(s.id))
  ))
 )
 order by lower(coalesce(p.full_name,u.raw_user_meta_data->>'full_name',u.email)),lower(u.email),u.id;
end;
$$;
revoke execute on function public.get_admin_accounts() from public,anon,authenticated;
grant execute on function public.get_admin_accounts() to authenticated;

create or replace function public.onboard_care_account(
 p_email text,p_full_name text,p_role text,p_resident_id uuid,p_site_id uuid,p_verified boolean
) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_existing text; v_site uuid; v_requested_site uuid;
begin
 if care_private.actor_role() is null or care_private.actor_role() not in ('owner','manager') or p_verified is distinct from true then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 if p_role is null or p_role not in ('nurse','family') or length(btrim(coalesce(p_full_name,''))) not between 1 and 160 then
  raise exception using errcode='22023',message='CARE_INVALID_PROFILE';
 end if;
 if p_resident_id is not null then
  select site_id into v_site from public.residents where id=p_resident_id and active for share;
  if v_site is null or care_private.manages_resident(p_resident_id) is not true then
   raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
 else v_site:=p_site_id;
 end if;
 if v_site is null or care_private.manages_site(v_site) is not true or
  (p_role='family' and p_resident_id is null) or (p_site_id is not null and p_site_id<>v_site) then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 perform 1 from public.sites where id=v_site for key share;
 if not found then raise exception using errcode='22023',message='CARE_INVALID_SCOPE'; end if;
 select u.id,case
  when u.raw_user_meta_data->>'requested_site_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then (u.raw_user_meta_data->>'requested_site_id')::uuid end
 into v_user,v_requested_site from auth.users u
 where lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null for update;
 if v_user is null then raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE'; end if;
 select role into v_existing from public.profiles where id=v_user for update;
 if v_existing is null and care_private.actor_role()='manager' and
  not exists(select 1 from care_private.account_invitations where email=lower(btrim(p_email)) and invited_by=auth.uid()) and
  (v_requested_site is distinct from v_site or not exists(select 1 from public.sites where id=v_requested_site)) then
  raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE';
 end if;
 if v_existing is not null and (v_existing<>p_role or care_private.can_manage_profile(v_user) is not true or
  not exists(select 1 from public.profiles where id=v_user and active)) then
  raise exception using errcode='42501',message='CARE_ACCOUNT_NOT_ELIGIBLE';
 end if;
 insert into public.profiles(id,full_name,role,active) values(v_user,btrim(p_full_name),p_role,true) on conflict(id) do nothing;
 if p_role='nurse' then insert into public.staff_sites values(v_user,v_site) on conflict do nothing; end if;
 if p_resident_id is not null then insert into public.resident_access values(p_resident_id,v_user) on conflict do nothing; end if;
 insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'account.onboard.'||p_role,v_user);
end;
$$;
revoke execute on function public.onboard_care_account(text,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.onboard_care_account(text,text,text,uuid,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
