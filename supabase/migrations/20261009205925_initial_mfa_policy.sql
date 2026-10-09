begin;
-- Requested policy: verified enrollment once, challenge again for password recovery.
-- Enrollment is trusted server state; never client storage or user_metadata.
create or replace function care_private.actor_role() returns text
language sql stable security definer set search_path='' as $$
 select p.role from public.profiles p where p.id=auth.uid() and p.active
 and (p.role in ('family','patient') or exists(
  select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified' and f.factor_type='totp'
 ));
$$;
commit;
