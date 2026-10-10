begin;
-- Preserve existing authorization, photo ownership, inventory and retry logic.
create or replace function public.record_care_event(
 p_resident_id uuid,p_kind text,p_occurred_at timestamptz,p_notes text,p_details jsonb,p_photo_path text,
 p_medication_plan_id uuid default null,p_units_taken numeric default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_existing public.care_events;
  v_plan public.medication_plans;
  v_details jsonb := coalesce(p_details,'{}'::jsonb);
  v_status text;
  v_request text;
  v_consent boolean;
  v_correction uuid;
begin
  if v_actor is null or care_private.can_record(p_resident_id) is not true then
    raise exception using errcode='42501',message='CARE_ACCESS_DENIED';
  end if;
  if p_kind is null or p_kind not in ('bath','meal','activity','medication','incident','observation') or
     p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' or
     length(p_notes)>5000 or
     jsonb_typeof(v_details)<>'object' or octet_length(v_details::text)>12000 then
    raise exception using errcode='22023',message='CARE_INVALID_EVENT';
  end if;
  v_request := v_details->>'request_id';
  if v_request is null or v_request !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or
    v_details ?| array['medication_name','dose_amount','dose_unit','inventory_units','stock_unit','medication_plan_id','recorded_by'] then
    raise exception using errcode='22023',message='CARE_INVALID_DETAILS';
  end if;
  -- A request UUID belongs to one actor. Lock precedes checking to serialize retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text||':'||v_request,0));
  select * into v_existing from public.care_events where actor_id=v_actor and details->>'request_id'=v_request;
  if found then
    if v_existing.resident_id<>p_resident_id or v_existing.kind<>p_kind or
      v_existing.occurred_at<>p_occurred_at or v_existing.notes is distinct from p_notes or
      v_existing.photo_path is distinct from p_photo_path or
      (v_existing.details-array['medication_name','dose_amount','dose_unit','inventory_units','stock_unit','medication_plan_id','recorded_by'])<>v_details or
      (v_existing.details->>'medication_plan_id') is distinct from p_medication_plan_id::text or
      (v_existing.details->>'inventory_units')::numeric is distinct from p_units_taken then
      raise exception using errcode='22023',message='CARE_REQUEST_CONFLICT';
    end if;
    return v_existing.id;
  end if;
  select photo_consent into v_consent from public.residents where id=p_resident_id for share;
  if p_photo_path is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('photo:'||p_photo_path,0));
    if not v_consent or care_private.photo_resident(p_photo_path) is distinct from p_resident_id or
      not exists(select 1 from storage.objects where bucket_id='care-photos' and name=p_photo_path and owner_id=v_actor::text) then
      raise exception using errcode='22023',message='CARE_INVALID_PHOTO';
    end if;
  end if;
  if v_details ? 'corrects_event_id' then
    if p_kind<>'observation' or coalesce(v_details->>'corrects_event_id','') !~ '^[0-9a-f-]{36}$' then
      raise exception using errcode='22023',message='CARE_INVALID_CORRECTION';
    end if;
    begin v_correction := (v_details->>'corrects_event_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode='22023',message='CARE_INVALID_CORRECTION';
    end;
    if not exists(select 1 from public.care_events where id=v_correction and resident_id=p_resident_id) then
      raise exception using errcode='22023',message='CARE_INVALID_CORRECTION';
    end if;
  end if;
  if p_kind='incident' and (jsonb_typeof(v_details->'incident_type') is distinct from 'string' or
    coalesce(v_details->>'incident_type','') not in ('vomiting','fall','pain','fever','other') or
    jsonb_typeof(v_details->'handled_by') is distinct from 'string' or
    jsonb_typeof(v_details->'actions') is distinct from 'string' or
    length(btrim(coalesce(v_details->>'handled_by','')))=0 or length(btrim(coalesce(v_details->>'actions','')))=0) then
    raise exception using errcode='22023',message='CARE_INCIDENT_DETAILS_REQUIRED';
  end if;
  if p_kind='meal' and (jsonb_typeof(v_details->'meal') is distinct from 'string' or
    coalesce(v_details->>'meal','') not in ('Desayuno','Comida','Cena','Colación') or
    jsonb_typeof(v_details->'intake') is distinct from 'string' or
    coalesce(v_details->>'intake','') not in ('Todo','La mayor parte','La mitad','Poco','No comió')) then
    raise exception using errcode='22023',message='CARE_MEAL_DETAILS_REQUIRED';
  end if;
  if p_kind='activity' then
    if jsonb_typeof(v_details->'activity') is distinct from 'string' or
      length(btrim(coalesce(v_details->>'activity',''))) not between 1 and 200 or
      coalesce(v_details->>'minutes','') !~ '^[0-9]{1,3}$' then
      raise exception using errcode='22023',message='CARE_ACTIVITY_DETAILS_REQUIRED';
    end if;
    if (v_details->>'minutes')::integer not between 1 and 600 then
      raise exception using errcode='22023',message='CARE_ACTIVITY_DETAILS_REQUIRED';
    end if;
  end if;
  if p_kind='medication' then
    v_status := v_details->>'status';
    if v_status is null or v_status not in ('administered','refused','omitted') or p_medication_plan_id is null then
      raise exception using errcode='22023',message='CARE_INVALID_MEDICATION';
    end if;
    if v_status in ('refused','omitted') and length(btrim(coalesce(p_notes,'')))=0 then
      raise exception using errcode='22023',message='CARE_MEDICATION_REASON_REQUIRED';
    end if;
    select * into v_plan from public.medication_plans where id=p_medication_plan_id and resident_id=p_resident_id and active for update;
    if not found then raise exception using errcode='22023',message='CARE_INVALID_MEDICATION'; end if;
    if v_status='administered' then
      if p_units_taken is null or p_units_taken<=0 or p_units_taken<>v_plan.units_per_dose then
        raise exception using errcode='22023',message='CARE_INVALID_UNITS';
      end if;
      if v_plan.stock_remaining<p_units_taken then raise exception using errcode='22023',message='CARE_STOCK_INSUFFICIENT'; end if;
      if (v_consent and p_photo_path is null) or
        (not v_consent and (p_photo_path is not null or jsonb_typeof(v_details->'no_photo_reason') is distinct from 'string' or
          length(btrim(coalesce(v_details->>'no_photo_reason','')))=0)) then
        raise exception using errcode='22023',message='CARE_PHOTO_REQUIRED';
      end if;
    elsif p_units_taken is not null then
      raise exception using errcode='22023',message='CARE_INVALID_UNITS';
    end if;
    v_details := v_details || jsonb_build_object('medication_plan_id',v_plan.id,'medication_name',v_plan.name,
      'dose_amount',v_plan.dose_amount,'dose_unit',v_plan.dose_unit,'stock_unit',v_plan.stock_unit,
      'inventory_units',case when v_status='administered' then p_units_taken else null end);
  elsif p_medication_plan_id is not null or p_units_taken is not null then
    raise exception using errcode='22023',message='CARE_INVALID_MEDICATION';
  end if;
  v_details := v_details || jsonb_build_object('recorded_by',(select full_name from public.profiles where id=v_actor));
  insert into public.care_events(resident_id,actor_id,kind,occurred_at,notes,details,photo_path)
    values(p_resident_id,v_actor,p_kind,p_occurred_at,p_notes,v_details,p_photo_path) returning id into v_id;
  if p_kind='medication' and v_status='administered' then
    update public.medication_plans set stock_remaining=stock_remaining-p_units_taken where id=v_plan.id;
    insert into public.medication_movements(plan_id,event_id,units_delta,actor_id,reason,medication_name,stock_unit,actor_name)
      values(v_plan.id,v_id,-p_units_taken,v_actor,'administration',v_plan.name,v_plan.stock_unit,
        (select full_name from public.profiles where id=v_actor));
  end if;
  update public.reminders set completed_at=now()
    where resident_id=p_resident_id and user_id=v_actor and kind=p_kind and completed_at is null and cancelled_at is null
      and medication_plan_id is not distinct from p_medication_plan_id and due_at<=p_occurred_at
      and (due_at at time zone 'America/Mexico_City')::date=(p_occurred_at at time zone 'America/Mexico_City')::date;
  insert into public.audit_log(actor_id,action,target_id) values(v_actor,'care.record',v_id);
  return v_id;
end;
$$;
notify pgrst,'reload schema';
commit;
