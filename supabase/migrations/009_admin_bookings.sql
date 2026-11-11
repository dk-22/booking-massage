alter table public.bookings add column if not exists updated_at timestamptz not null default now();
create or replace function public.update_booking(p_id uuid,p_slot_id uuid,p_name text,p_code text,p_sbu text,p_expected timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare b public.bookings; target public.slots; cid uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required.' using errcode='42501'; end if;
 select campaign_id into cid from public.bookings where id=p_id;
 if not found then raise exception 'Booking not found.'; end if;
 perform 1 from public.campaigns where id=cid for update;
 select * into b from public.bookings where id=p_id for update;
 if b.status<>'confirmed' then raise exception 'Only confirmed bookings can be edited.'; end if;
 if p_expected is null or b.updated_at<>p_expected then raise exception 'This booking changed. Close the editor and reopen it to see the latest details.'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 or p_code is null or length(trim(p_code)) not between 1 and 120 then raise exception 'Enter a name and employee code (up to 120 characters).'; end if;
 if not exists(select 1 from public.sbus where name=p_sbu) then raise exception 'Select a valid business unit.'; end if;
 if exists(select 1 from public.bookings where campaign_id=cid and employee_code=upper(trim(p_code)) and status='confirmed' and id<>p_id) then raise exception 'This employee already has a booking in this campaign.'; end if;
 perform 1 from public.slots where id in(b.slot_id,p_slot_id) order by id for update;
 select * into target from public.slots where id=p_slot_id and campaign_id=cid;
 if not found then raise exception 'Choose a time in the same campaign.'; end if;
 if p_slot_id<>b.slot_id then
  if target.status<>'active' or target.start_time<=clock_timestamp() or not exists(select 1 from public.sessions where id=target.session_id and status='active') then raise exception 'This destination is no longer available.'; end if;
  if target.booked_count>=target.capacity then raise exception 'This time slot is fully booked. Choose another time.'; end if;
 end if;
 update public.bookings set slot_id=p_slot_id,employee_name=trim(p_name),employee_code=upper(trim(p_code)),sbu=p_sbu,updated_at=clock_timestamp() where id=p_id;
 update public.slots s set booked_count=(select count(*) from public.bookings where slot_id=s.id and status='confirmed'),names=coalesce((select array_agg(employee_name order by created_at,id) from public.bookings where slot_id=s.id and status='confirmed'),'{}') where s.id in(b.slot_id,p_slot_id);
 insert into public.audit_logs(admin_id,action,details) values(auth.uid(),'booking.update',jsonb_build_object('bookingId',p_id,'previous',to_jsonb(b),'newSlotId',p_slot_id,'name',trim(p_name),'employeeCode',upper(trim(p_code)),'sbu',p_sbu));
end; $$;
revoke all on function public.update_booking(uuid,uuid,text,text,text,timestamptz) from public;
grant execute on function public.update_booking(uuid,uuid,text,text,text,timestamptz) to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='bookings') then alter publication supabase_realtime add table public.bookings; end if;
end $$;
