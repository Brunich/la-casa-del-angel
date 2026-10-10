begin;
create or replace function public.get_daily_care_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare day_start timestamptz := date_trunc('day',now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
begin
 if care_private.actor_role() not in ('owner','manager','nurse') or care_private.actor_role() is null then
  raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
 end if;
 return jsonb_build_object('day',to_char(now() at time zone 'America/Mexico_City','YYYY-MM-DD'),
  'residents',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.full_name,'site_id',r.site_id,'photo_consent',r.photo_consent,
   'events',coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'meal',e.details->>'meal','plan_id',e.details->>'medication_plan_id',
    'status',e.details->>'status','has_photo',e.photo_path is not null,'no_photo_reason',
    coalesce(nullif(e.details->>'no_photo_reason',''),nullif(e.details->>'photo_omission_reason','')) is not null))
    from public.care_events e where e.resident_id=r.id and e.occurred_at>=day_start and e.occurred_at<day_start+interval '1 day' and e.occurred_at<=now()),'[]'::jsonb),
   'plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'doses_per_day',p.doses_per_day))
    from public.medication_plans p where p.resident_id=r.id and p.active),'[]'::jsonb)))
   from public.residents r where r.active and care_private.can_read(r.id)),'[]'::jsonb));
end;
$$;
revoke execute on function public.get_daily_care_status() from public,anon,authenticated;
grant execute on function public.get_daily_care_status() to authenticated;
notify pgrst,'reload schema';
commit;
