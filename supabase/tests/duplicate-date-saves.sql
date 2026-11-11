-- Disposable test database only. Uses a transaction and a local auth.uid stub.
begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','editor@example.com',now());
insert into public.admin_emails(email,enabled) values('editor@example.com',true);
create function public.test_save(d jsonb) returns uuid language sql as $$ select public.save_campaign_v2(d||jsonb_build_object('requestId',gen_random_uuid())); $$;
do $$
declare cid uuid; payload jsonb; total int;
begin
 payload:=jsonb_build_object('name','Editor test','status','published','dates',jsonb_build_array(jsonb_build_object('date',(current_date+5)::text,'start','09:00','end','10:00','duration',20,'breakDuration',0,'capacity',3)));
 payload:=payload||jsonb_build_object('requestId',gen_random_uuid());
 cid:=public.save_campaign_v2(payload);
 if public.save_campaign_v2(payload)<>cid then raise exception 'Retry returned different campaign'; end if;
 if (select status from public.campaigns where id=cid)<>'published' then raise exception 'Not published'; end if;
 select count(*) into total from public.slots where campaign_id=cid;
 if total<>3 then raise exception 'Wrong slot count'; end if;
 perform public.test_save(jsonb_build_object('id',cid,'name','Edited name','description','Updated','status','published','dates','[]'::jsonb));
 if (select name from public.campaigns where id=cid)<>'Edited name' then raise exception 'Edit failed'; end if;
 if (select count(*) from public.slots where campaign_id=cid)<>total then raise exception 'Existing slots changed'; end if;
 -- Replace an existing schedule, then delete it while retaining the campaign as a draft.
 payload:=jsonb_build_object('id',cid,'name','Edited name','status','published','dates',jsonb_build_array(jsonb_build_object('sessionId',(select id from public.sessions where campaign_id=cid limit 1),'date',(current_date+6)::text,'start','10:00','end','11:00','duration',30,'breakDuration',0,'capacity',2)));
 perform public.test_save(payload);
 if (select count(*) from public.slots where campaign_id=cid)<>2 then raise exception 'Schedule replacement failed'; end if;
 perform public.test_save(jsonb_build_object('id',cid,'name','Edited name','status','draft','dates','[]'::jsonb,'removedSessions',jsonb_build_array((select id from public.sessions where campaign_id=cid limit 1))));
 if exists(select 1 from public.sessions where campaign_id=cid) then raise exception 'Schedule deletion failed'; end if;
 begin
  perform public.test_save(jsonb_build_object('name','Must roll back','status','published','dates','[]'::jsonb));
  raise exception 'Expected publishing validation to fail' using errcode='P0002';
 exception when raise_exception then null;
 end;
 if exists(select 1 from public.campaigns where name='Must roll back') then raise exception 'Partial campaign saved'; end if;
end $$;
rollback;
