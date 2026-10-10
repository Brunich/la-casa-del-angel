begin;
-- A test session must fail closed if someone later promotes its profile or adds
-- real scopes. Checking only while minting a token cannot protect an issued JWT.
create or replace function care_private.actor_role() returns text
language sql stable security definer set search_path='' as $$
 select p.role from public.profiles p where p.id=auth.uid() and p.active
 and (p.role in ('family','patient') or exists(
  select 1 from auth.mfa_factors f where f.user_id=p.id and f.status='verified' and f.factor_type='totp'))
 and not exists(select 1 from care_private.demo_workspace d where
  (d.manager_id=p.id and care_private.demo_target_safe(p.id,'manager') is not true) or
  (d.nurse_id=p.id and care_private.demo_target_safe(p.id,'nurse') is not true));
$$;
notify pgrst,'reload schema';
commit;
