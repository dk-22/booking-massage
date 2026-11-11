begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values(auth.uid(),'pagination-admin@example.test',now());
insert into public.admin_emails(email,enabled,full_name) values('pagination-admin@example.test',true,'Pagination Admin');
insert into public.sbus(name) values('Technology') on conflict do nothing;
do $$
declare cid uuid;sid uuid;slot uuid; first_page jsonb; second_page jsonb;
begin
 insert into public.campaigns(name,status) values('Pagination test','published') returning id into cid;
 insert into public.sessions(campaign_id) values(cid) returning id into sid;
 insert into public.slots(campaign_id,session_id,start_time,end_time,capacity) values(cid,sid,now()+interval '1 day',now()+interval '1 day 30 minutes',20) returning id into slot;
 for i in 1..11 loop
  perform public.create_booking(cid,slot,'EMP'||i,'Employee '||i,'Technology',gen_random_uuid());
  insert into public.admin_emails(email,enabled,full_name) values('page-'||i||'@example.test',true,'Pagination Person '||i);
 end loop;
 first_page:=public.booking_page(cid,'',null,0);second_page:=public.booking_page(cid,'',null,1);
 if jsonb_array_length(first_page->'rows')<>10 or jsonb_array_length(second_page->'rows')<>1 or (first_page->>'total')::int<>11 then raise exception 'Booking pagination incorrect';end if;
 if exists(select 1 from jsonb_array_elements(first_page->'rows') a join jsonb_array_elements(second_page->'rows') b on a->>'id'=b->>'id') then raise exception 'Duplicate page rows';end if;
 if jsonb_array_length(public.booking_page_filtered(cid,'',null,0,'confirmed')->'rows')<>10 or jsonb_array_length(public.booking_page_filtered(cid,'',null,1,'confirmed')->'rows')<>1 then raise exception 'Filtered pagination incorrect';end if;
 if jsonb_array_length(public.admin_directory('Pagination Person',0)->'rows')<>10 or jsonb_array_length(public.admin_directory('Pagination Person',1)->'rows')<>1 then raise exception 'Administrator pagination incorrect';end if;
end $$;
rollback;
