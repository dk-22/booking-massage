begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','manager@example.test',now());
insert into public.admin_emails(email,full_name,enabled) values('manager@example.test','Manager Admin',true);
do $$
declare version timestamptz;
begin
 perform public.save_administrator(' NEW@example.test ','New Admin');
 if (select full_name from public.admin_emails where email='new@example.test')<>'New Admin' then raise exception 'Creation failed'; end if;
 select updated_at into version from public.admin_emails where email='new@example.test';
 perform public.save_administrator('new@example.test','Edited Admin',version);
 begin
  perform public.save_administrator('new@example.test','Stale',version);
  raise exception 'Expected stale edit rejection';
 exception when raise_exception then if sqlerrm='Expected stale edit rejection' then raise; end if;
 end;
 select updated_at into version from public.admin_emails where email='new@example.test';
 perform public.set_administrator_status('new@example.test',false,version);
 if (select enabled from public.admin_emails where email='new@example.test') then raise exception 'Deactivation failed'; end if;
 select updated_at into version from public.admin_emails where email='new@example.test';
 perform public.set_administrator_status('new@example.test',true,version);
 begin
  perform public.set_administrator_status('manager@example.test',false,(select updated_at from public.admin_emails where email='manager@example.test'));
  raise exception 'Expected self deactivation rejection';
 exception when raise_exception then if sqlerrm='Expected self deactivation rejection' then raise; end if;
 end;
 if (public.admin_directory()->>'total')::int<>2 then raise exception 'Directory missing administrators'; end if;
 if (select count(*) from public.audit_logs where action like 'admin.%')<>4 then raise exception 'Admin audit events missing'; end if;
 update public.admin_emails set enabled=false where email='manager@example.test';
 begin
  perform public.admin_directory();raise exception 'Expected unauthorized rejection';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.save_administrator('blocked@example.test','Blocked');raise exception 'Expected unauthorized rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
