begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users values('11111111-1111-4111-8111-111111111111','delete@example.com',now());
insert into public.admin_emails(email,enabled) values('delete@example.com',true);
do $$
declare cid uuid; sid uuid; slot uuid;
begin
 insert into public.campaigns(name) values('Delete test') returning id into cid;
 insert into public.sessions(campaign_id) values(cid) returning id into sid;
 insert into public.slots(campaign_id,session_id,start_time,end_time,capacity) values(cid,sid,now()+interval '1 day',now()+interval '2 days',1) returning id into slot;
 insert into public.bookings(request_id,campaign_id,slot_id,employee_code,employee_name,sbu) values(gen_random_uuid(),cid,slot,'TEST','Test','Test');
 begin
  perform public.delete_campaign(cid);
  raise exception 'Expected history protection' using errcode='P0002';
 exception when raise_exception then null;
 end;
 if not exists(select 1 from public.campaigns where id=cid) then raise exception 'Campaign with history deleted'; end if;
 delete from public.bookings where campaign_id=cid;
 perform public.delete_campaign(cid);
 if exists(select 1 from public.campaigns where id=cid) or exists(select 1 from public.slots where campaign_id=cid) or exists(select 1 from public.sessions where campaign_id=cid) then raise exception 'Deletion incomplete'; end if;
 if not exists(select 1 from public.audit_logs where action='campaign.delete' and details->>'campaignId'=cid::text) then raise exception 'Audit missing'; end if;
 update public.admin_emails set enabled=false where email='delete@example.com';
 begin
  perform public.delete_campaign(gen_random_uuid());
  raise exception 'Expected admin rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
