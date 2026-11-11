-- Disposable test database only. Uses a transaction and a local auth.uid stub.
begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','editor@example.com',now());
insert into public.admin_emails(email,enabled) values('editor@example.com',true);
do $$
declare cid uuid; payload jsonb; total int;
begin
 payload:=jsonb_build_object('name','Editor test','status','published','dates',jsonb_build_array(jsonb_build_object('date',(current_date+5)::text,'start','09:00','end','10:00','duration',20,'breakDuration',0,'capacity',3)));
 cid:=public.save_campaign(payload);
 if (select status from public.campaigns where id=cid)<>'published' then raise exception 'Not published'; end if;
 select count(*) into total from public.slots where campaign_id=cid;
 if total<>3 then raise exception 'Wrong slot count'; end if;
 perform public.save_campaign(jsonb_build_object('id',cid,'name','Edited name','description','Updated','status','published','dates','[]'::jsonb));
 if (select name from public.campaigns where id=cid)<>'Edited name' then raise exception 'Edit failed'; end if;
 if (select count(*) from public.slots where campaign_id=cid)<>total then raise exception 'Existing slots changed'; end if;
 begin
  perform public.save_campaign(jsonb_build_object('name','Must roll back','status','published','dates','[]'::jsonb));
  raise exception 'Expected publishing validation to fail' using errcode='P0002';
 exception when raise_exception then null;
 end;
 if exists(select 1 from public.campaigns where name='Must roll back') then raise exception 'Partial campaign saved'; end if;
end $$;
rollback;
