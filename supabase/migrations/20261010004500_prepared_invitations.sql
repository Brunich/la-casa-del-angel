begin;

-- This plan is deliberately separate from Auth metadata and public API tables.
-- Email confirmation alone can never choose or elevate a role.
create table care_private.prepared_invitations (
 email text primary key,
 attempt_id uuid not null unique default gen_random_uuid(),
 invited_by uuid not null references public.profiles(id),
 full_name text not null check(length(btrim(full_name)) between 1 and 160),
 role text not null check(role in ('owner','manager','nurse','family')),
 site_ids uuid[] not null,
 resident_ids uuid[] not null,
 status text not null default 'prepared' check(status in ('prepared','dispatched','failed','applied','review_needed')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 completed_at timestamptz,
 applied_user_id uuid references auth.users(id),
 review_reason text
);
alter table care_private.prepared_invitations enable row level security;
revoke all on care_private.prepared_invitations from public,anon,authenticated;

create function public.prepare_account_invitation(
 p_email text,p_full_name text,p_role text,p_site_ids uuid[],p_resident_ids uuid[],p_verified boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(btrim(p_email)); v_actor text:=care_private.actor_role();
 v_sites uuid[]:=coalesce(p_site_ids,'{}'); v_residents uuid[]:=coalesce(p_resident_ids,'{}');
 v_site uuid; v_resident uuid; v_resident_site uuid; v_attempt uuid;
begin
 if v_actor is null or v_actor not in ('owner','manager') or p_verified is distinct from true then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 if p_role is null or p_role not in ('owner','manager','nurse','family') or
  length(btrim(coalesce(p_full_name,''))) not between 1 and 160 or
  v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception using errcode='22023',message='CARE_INVALID_INVITATION';
 end if;
 if v_actor='manager' and p_role not in ('nurse','family') then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 if cardinality(v_sites)>30 or cardinality(v_residents)>200 or
  array_position(v_sites,null) is not null or array_position(v_residents,null) is not null then
  raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
 end if;
 select coalesce(array_agg(distinct x order by x),'{}') into v_sites from unnest(v_sites) x;
 select coalesce(array_agg(distinct x order by x),'{}') into v_residents from unnest(v_residents) x;
 if (p_role='owner' and (cardinality(v_sites)>0 or cardinality(v_residents)>0)) or
  (p_role<>'owner' and cardinality(v_sites)=0) or
  (p_role='manager' and cardinality(v_residents)>0) or
  (p_role='family' and cardinality(v_residents)=0) then
  raise exception using errcode='22023',message='CARE_INVALID_SCOPE';
 end if;
 -- Serialize preparations, including requests from different administrators.
 perform pg_advisory_xact_lock(hashtextextended('care.invitation:'||v_email,0));
 -- Never replace a plan while another HTTP request may still dispatch its email.
 if exists(select 1 from care_private.prepared_invitations where email=v_email
  and status in ('prepared','dispatched') and expires_at>now()) then
  raise exception using errcode='55000',message='CARE_INVITATION_IN_PROGRESS';
 end if;
 if exists(select 1 from auth.users where lower(email)=v_email) then
  raise exception using errcode='22023',message='ACCOUNT_EXISTS';
 end if;
 foreach v_site in array v_sites loop
  if care_private.manages_site(v_site) is not true then
   raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
  perform 1 from public.sites where id=v_site for share;
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
 -- Existing attribution and its 30/hour attempt audit are reused atomically.
 perform public.reserve_account_invitation(v_email);
 insert into care_private.prepared_invitations(email,invited_by,full_name,role,site_ids,resident_ids)
 values(v_email,auth.uid(),btrim(p_full_name),p_role,v_sites,v_residents)
 on conflict(email) do update set attempt_id=gen_random_uuid(),invited_by=excluded.invited_by,
  full_name=excluded.full_name,role=excluded.role,site_ids=excluded.site_ids,resident_ids=excluded.resident_ids,
  status='prepared',created_at=now(),expires_at=now()+interval '7 days',completed_at=null,
  applied_user_id=null,review_reason=null
 returning attempt_id into v_attempt;
 insert into public.audit_log(actor_id,action,target_id) values(auth.uid(),'account.invitation.prepared.'||p_role,v_attempt);
 return v_attempt;
end;
$$;

-- Invoked only by trusted Auth triggers / the service-only dispatch completion.
-- Its nested transaction catches an invalid/stale plan without breaking email confirmation.
create function care_private.apply_prepared_invitation(p_user_id uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare v_plan care_private.prepared_invitations%rowtype; v_actor text; v_site uuid;
 v_resident uuid; v_resident_site uuid; v_reason text;
begin
 select * into v_plan from care_private.prepared_invitations where email=lower(p_email) for update;
 if not found or v_plan.status<>'dispatched' then return; end if;
 begin
  if v_plan.expires_at<=now() then raise exception using message='expired'; end if;
  if not exists(select 1 from auth.users where id=p_user_id and lower(email)=v_plan.email and email_confirmed_at is not null) then
   return;
  end if;
  if exists(select 1 from public.profiles where id=p_user_id) then raise exception using message='profile_exists'; end if;
  select role into v_actor from public.profiles where id=v_plan.invited_by and active for share;
  if not found or v_actor not in ('owner','manager') then raise exception using message='inviter_inactive'; end if;
  perform 1 from auth.mfa_factors where user_id=v_plan.invited_by and status='verified' and factor_type='totp' for share;
  if not found then raise exception using message='inviter_verification_missing'; end if;
  if v_actor='manager' and v_plan.role not in ('nurse','family') then raise exception using message='inviter_role_changed'; end if;
  foreach v_site in array v_plan.site_ids loop
   perform 1 from public.sites where id=v_site for share;
   if not found then raise exception using message='site_missing'; end if;
   if v_actor='manager' then
    perform 1 from public.staff_sites where user_id=v_plan.invited_by and site_id=v_site for share;
    if not found then raise exception using message='inviter_scope_changed'; end if;
   end if;
  end loop;
  foreach v_resident in array v_plan.resident_ids loop
   select site_id into v_resident_site from public.residents where id=v_resident and active for share;
   if not found or not(v_resident_site=any(v_plan.site_ids)) then raise exception using message='resident_scope_changed'; end if;
  end loop;
  insert into public.profiles(id,full_name,role,active) values(p_user_id,v_plan.full_name,v_plan.role,true);
  if v_plan.role in ('manager','nurse') then
   insert into public.staff_sites(user_id,site_id) select p_user_id,unnest(v_plan.site_ids);
  end if;
  insert into public.resident_access(user_id,resident_id) select p_user_id,unnest(v_plan.resident_ids);
  update care_private.prepared_invitations set status='applied',applied_user_id=p_user_id,completed_at=now()
   where email=v_plan.email;
  insert into public.audit_log(actor_id,action,target_id)
   values(v_plan.invited_by,'account.invitation.applied.'||v_plan.role,p_user_id);
 exception when others then
  get stacked diagnostics v_reason=message_text;
  update care_private.prepared_invitations set status='review_needed',review_reason=case
   when v_reason in ('expired','profile_exists','inviter_inactive','inviter_verification_missing',
    'inviter_role_changed','site_missing','inviter_scope_changed','resident_scope_changed') then v_reason
   else 'activation_failed' end where email=v_plan.email;
  insert into public.audit_log(actor_id,action,target_id)
   values(v_plan.invited_by,'account.invitation.review_needed',p_user_id);
 end;
end;
$$;

create function care_private.on_invited_email_confirmed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and new.email is not null then
  perform care_private.apply_prepared_invitation(new.id,new.email);
 end if;
 return new;
end;
$$;
create trigger care_invitation_confirmed_insert after insert on auth.users
 for each row when(new.email_confirmed_at is not null) execute function care_private.on_invited_email_confirmed();
create trigger care_invitation_confirmed_update after update of email_confirmed_at on auth.users
 for each row when(new.email_confirmed_at is not null and old.email_confirmed_at is null)
 execute function care_private.on_invited_email_confirmed();

-- Only the Edge function can attest dispatch. UUID prevents a stale HTTP result
-- from committing a newer preparation for the same address.
create function public.complete_account_invitation(p_attempt_id uuid,p_inviter_id uuid,p_sent boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_email text; v_user uuid; v_status text;
begin
 if p_sent is null then raise exception using errcode='22023',message='CARE_INVALID_INVITATION'; end if;
 select email into v_email from care_private.prepared_invitations
 where attempt_id=p_attempt_id and invited_by=p_inviter_id;
 if not found then raise exception using errcode='42501',message='CARE_INVITATION_STALE'; end if;
 -- Same order as Auth triggers: Auth row, then invitation plan.
 select id into v_user from auth.users where lower(email)=v_email for update;
 select status into v_status from care_private.prepared_invitations
 where attempt_id=p_attempt_id and invited_by=p_inviter_id for update;
 if not found or v_status<>'prepared' then raise exception using errcode='42501',message='CARE_INVITATION_STALE'; end if;
 update care_private.prepared_invitations set status=case when p_sent then 'dispatched' else 'failed' end
 where attempt_id=p_attempt_id;
 insert into public.audit_log(actor_id,action,target_id)
 values(p_inviter_id,case when p_sent then 'account.invitation.dispatched' else 'account.invitation.failed' end,p_attempt_id);
 if p_sent and v_user is not null then perform care_private.apply_prepared_invitation(v_user,v_email); end if;
end;
$$;

revoke execute on function public.prepare_account_invitation(text,text,text,uuid[],uuid[],boolean)
 from public,anon,authenticated;
grant execute on function public.prepare_account_invitation(text,text,text,uuid[],uuid[],boolean) to authenticated;
revoke execute on function public.complete_account_invitation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.complete_account_invitation(uuid,uuid,boolean) to service_role;
revoke execute on function care_private.apply_prepared_invitation(uuid,text),care_private.on_invited_email_confirmed()
 from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
