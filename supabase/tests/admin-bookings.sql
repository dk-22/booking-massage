begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users values('11111111-1111-4111-8111-111111111111','bookings-admin@example.com',now());
insert into public.admin_emails(email,enabled) values('bookings-admin@example.com',true);
do $$
declare cid uuid; sid uuid; original uuid; dest uuid; bid uuid; version timestamptz;
begin
 insert into public.campaigns(name,status) values('Booking edit test','published') returning id into cid;
 insert into public.sessions(campaign_id) values(cid) returning id into sid;
 insert into public.slots(campaign_id,session_id,start_time,end_time,capacity) values(cid,sid,now()+interval '1 day',now()+interval '1 day 20 minutes',1) returning id into original;
 insert into public.slots(campaign_id,session_id,start_time,end_time,capacity) values(cid,sid,now()+interval '2 days',now()+interval '2 days 20 minutes',1) returning id into dest;
 bid:=public.create_booking(cid,original,'EMP1','Original Name','Technology',gen_random_uuid());
 select updated_at into version from public.bookings where id=bid;
 perform public.update_booking(bid,dest,'New Name','EMP1','CXO',version);
 if (select booked_count from public.slots where id=original)<>0 or (select booked_count from public.slots where id=dest)<>1 then raise exception 'Capacity transfer failed'; end if;
 if (select names from public.slots where id=dest)<>array['New Name'] then raise exception 'Public names stale'; end if;
 begin
  perform public.update_booking(bid,dest,'Stale edit','EMP1','CXO',version);
  raise exception 'Expected stale rejection' using errcode='P0002';
 exception when raise_exception then null;
 end;
 perform public.create_booking(cid,original,'EMP2','Second Person','Technology',gen_random_uuid());
 select updated_at into version from public.bookings where id=bid;
 begin
  perform public.update_booking(bid,original,'New Name','EMP1','CXO',version);
  raise exception 'Expected full slot rejection' using errcode='P0002';
 exception when raise_exception then null;
 end;
 begin
  perform public.update_booking(bid,dest,'New Name','EMP2','CXO',version);
  raise exception 'Expected duplicate employee rejection' using errcode='P0002';
 exception when raise_exception then null;
 end;
 update public.admin_emails set enabled=false where email='bookings-admin@example.com';
 begin
  perform public.update_booking(bid,dest,'New Name','EMP1','CXO',version);
  raise exception 'Expected admin rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
