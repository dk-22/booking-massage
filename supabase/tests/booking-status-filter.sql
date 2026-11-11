begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values(auth.uid(),'cancel-admin@example.test',now());
insert into public.admin_emails(email,enabled,full_name) values('cancel-admin@example.test',true,'Cancellation Admin');
insert into public.sbus(name) values('Technology') on conflict do nothing;
do $$
declare cid uuid;sid uuid;slot uuid;bid uuid;version timestamptz;changed timestamptz;
begin
 insert into public.campaigns(name,status) values('Cancel test','published') returning id into cid;
 insert into public.sessions(campaign_id) values(cid) returning id into sid;
 insert into public.slots(campaign_id,session_id,start_time,end_time,capacity) values(cid,sid,now()+interval '1 day',now()+interval '1 day 30 minutes',2) returning id into slot;
 bid:=public.create_booking(cid,slot,'EMP1','Same Name','Technology',gen_random_uuid());
 perform public.create_booking(cid,slot,'EMP2','Same Name','Technology',gen_random_uuid());
 select updated_at into version from public.bookings where id=bid;
 perform public.update_booking(bid,slot,'Same Name','EMP1','Technology',version);
 begin
  perform public.cancel_booking(bid,version);raise exception 'Stale cancellation accepted' using errcode='P0002';
 exception when raise_exception then null;
 end;
 select updated_at into version from public.bookings where id=bid;
 perform public.cancel_booking(bid,version);
 if (public.booking_page_filtered(cid,'',null,0,'cancelled')->>'total')::int<>1 or (public.booking_page_filtered(cid,'',null,0,'confirmed')->>'total')::int<>1 then raise exception 'Status filter counts incorrect'; end if;
 if (select status from public.bookings where id=bid)<>'cancelled' then raise exception 'Booking not cancelled'; end if;
 if (select cancelled_by_name from public.bookings where id=bid)<>'Cancellation Admin' or (select cancelled_by from public.bookings where id=bid)<>auth.uid() or (select cancelled_at from public.bookings where id=bid) is null then raise exception 'Cancellation attribution missing'; end if;
 if (select booked_count from public.slots where id=slot)<>1 or (select names from public.slots where id=slot)<>array['Same Name'] then raise exception 'Slot capacity or names not released correctly'; end if;
 select updated_at into changed from public.bookings where id=bid;
 update public.admin_emails set full_name='Renamed Admin' where email='cancel-admin@example.test';
 perform public.cancel_booking(bid,version);
 if (select updated_at from public.bookings where id=bid)<>changed or (select cancelled_by_name from public.bookings where id=bid)<>'Cancellation Admin' then raise exception 'Retry changed cancellation attribution'; end if;
 if (select count(*) from public.audit_logs where action='booking.cancel')<>1 then raise exception 'Cancellation logged more than once'; end if;
 if not exists(select 1 from jsonb_array_elements(public.booking_page(cid)->'rows') r where r->>'id'=bid::text and r->>'cancelled_by_name'='Cancellation Admin') then raise exception 'Cancellation not returned in booking page'; end if;
 perform public.create_booking(cid,slot,'EMP1','Rebooked Employee','Technology',gen_random_uuid());
 if (select booked_count from public.slots where id=slot)<>2 then raise exception 'Rebooking failed'; end if;
 update public.admin_emails set enabled=false where email='cancel-admin@example.test';
 begin
  perform public.cancel_booking(bid,version);raise exception 'Unauthorized cancellation accepted' using errcode='P0002';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
