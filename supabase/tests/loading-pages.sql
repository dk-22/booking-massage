begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','paging@example.com',now());
insert into public.admin_emails(email,enabled) values('paging@example.com',true);
do $$
declare cid uuid; sid uuid; slot uuid; first_page jsonb; second_page jsonb;
begin
 insert into public.campaigns(name,status) values('Paging fixture','published') returning id into cid;
 insert into public.sessions(campaign_id) values(cid) returning id into sid;
 insert into public.slots(campaign_id,session_id,start_time,end_time,capacity) values(cid,sid,now()+interval '1 day',now()+interval '1 day 20 minutes',50) returning id into slot;
 insert into public.bookings(request_id,campaign_id,slot_id,employee_code,employee_name,sbu) select gen_random_uuid(),cid,slot,'CODE'||i,'Employee '||i,'Technology' from generate_series(1,31) i;
 first_page:=public.booking_page(cid,'',null,0);second_page:=public.booking_page(cid,'',null,1);
 if (first_page->>'total')::int<>31 or jsonb_array_length(first_page->'rows')<>25 or jsonb_array_length(second_page->'rows')<>6 then raise exception 'Pagination failed'; end if;
 if exists(select 1 from jsonb_array_elements(first_page->'rows') a join jsonb_array_elements(second_page->'rows') b on a->>'id'=b->>'id') then raise exception 'Pages overlap'; end if;
 if (public.booking_page(cid,'CODE31')->>'total')::int<>1 then raise exception 'Search failed'; end if;
 if (public.booking_page(cid,'',current_date-1)->>'total')::int<>0 then raise exception 'Date filter failed'; end if;
 update public.admin_emails set enabled=false where email='paging@example.com';
 begin
  perform public.booking_page(cid);
  raise exception 'Expected access rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
