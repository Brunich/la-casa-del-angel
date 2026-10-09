begin;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner','manager','nurse','family'));
create function public.get_admin_accounts() returns table(id uuid,full_name text,email text,role text,active boolean,confirmed boolean)
language plpgsql security definer set search_path='' as $$
begin
 if care_private.actor_role() is null or care_private.actor_role() not in ('owner','manager') then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 return query select u.id,coalesce(p.full_name,nullif(left(btrim(u.raw_user_meta_data->>'full_name'),160),''),u.email)::text,
 u.email::text,p.role,coalesce(p.active,false),u.email_confirmed_at is not null
 from auth.users u left join public.profiles p on p.id=u.id
 where u.email is not null and (care_private.actor_role()='owner' or p.id is null or care_private.can_manage_profile(u.id))
 order by lower(coalesce(p.full_name,u.raw_user_meta_data->>'full_name',u.email)),lower(u.email);
end;
$$;
create function public.reserve_account_invitation() returns void
language plpgsql security definer set search_path='' as $$
begin
 if care_private.actor_role() is null or care_private.actor_role() not in ('owner','manager') then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.audit_log where actor_id=auth.uid() and action='account.invite.attempt' and created_at>now()-interval '1 hour')>=30 then
  raise exception using errcode='42501',message='CARE_INVITATION_LIMIT';
 end if;
 insert into public.audit_log(actor_id,action) values(auth.uid(),'account.invite.attempt');
end;
$$;
revoke all on function public.get_admin_accounts(),public.reserve_account_invitation() from public,anon,authenticated;
grant execute on function public.get_admin_accounts(),public.reserve_account_invitation() to authenticated;
commit;
