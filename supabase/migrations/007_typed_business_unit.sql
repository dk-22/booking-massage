-- Allows typed SBUs; configured units remain suggestions.
create or replace function public.create_booking(p_campaign_id uuid,p_slot_id uuid,p_employee_code text,p_employee_name text,p_sbu text,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.slots; b public.bookings; result uuid; code text:=upper(trim(p_employee_code));
begin
 if code is null or length(code) not between 1 and 120 or p_employee_name is null or length(trim(p_employee_name)) not between 1 and 120 or p_sbu is null then raise exception 'Please complete all fields.'; end if;
 -- Serialize identical requests, then employee eligibility, then slot capacity.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into b from public.bookings where request_id=p_request_id;
 if found then
  if b.campaign_id<>p_campaign_id or b.slot_id<>p_slot_id or b.employee_code<>code or b.employee_name<>trim(p_employee_name) or b.sbu<>p_sbu then raise exception 'Request reference already used.'; end if;
  return b.id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text||':'||code,1));
 perform 1 from public.campaigns where id=p_campaign_id and status='published' for share;
 if not found then raise exception 'This campaign is no longer accepting bookings.'; end if;
 if exists(select 1 from public.bookings where campaign_id=p_campaign_id and employee_code=code and status='confirmed') then raise exception 'You already have a booking for this campaign.'; end if;
 select * into s from public.slots where id=p_slot_id for update;
 if not found or s.campaign_id<>p_campaign_id or s.status<>'active' or s.start_time<=clock_timestamp() then raise exception 'This time slot is no longer available.'; end if;
 if not exists(select 1 from public.sessions where id=s.session_id and status='active') then raise exception 'Session unavailable.'; end if;
 if s.booked_count>=s.capacity then raise exception 'This time slot has just been fully booked.'; end if;
 if p_sbu is null or length(trim(p_sbu)) not between 1 and 120 then raise exception 'Enter a business unit (up to 120 characters).'; end if;
 insert into public.bookings(request_id,campaign_id,slot_id,employee_code,employee_name,sbu) values(p_request_id,p_campaign_id,p_slot_id,code,trim(p_employee_name),p_sbu) returning id into result;
 update public.slots set booked_count=booked_count+1,names=array_append(names,trim(p_employee_name)) where id=p_slot_id;
 return result;
end; $$;


revoke all on function public.create_booking(uuid,uuid,text,text,text,uuid) from public;
grant execute on function public.create_booking(uuid,uuid,text,text,text,uuid) to anon,authenticated;
