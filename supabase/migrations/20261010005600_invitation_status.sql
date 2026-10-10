begin;
create function public.get_admin_invitation_status()
returns table(email text,full_name text,role text,status text,created_at timestamptz,expires_at timestamptz,review_reason text)
language plpgsql stable security definer set search_path='' as $$
declare v_actor text:=care_private.actor_role();
begin
 if v_actor is null or v_actor not in ('owner','manager') then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 return query select p.email,p.full_name,p.role,p.status,p.created_at,p.expires_at,p.review_reason
 from care_private.prepared_invitations p
 where v_actor='owner' or (p.invited_by=auth.uid() and not exists(
  select 1 from unnest(p.site_ids) s where care_private.manages_site(s) is not true))
 order by p.created_at desc,p.email limit 200;
end;
$$;
revoke execute on function public.get_admin_invitation_status() from public,anon,authenticated;
grant execute on function public.get_admin_invitation_status() to authenticated;
notify pgrst,'reload schema';
commit;
