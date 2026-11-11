begin;
create or replace function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
insert into auth.users(id,email,email_confirmed_at) values('11111111-1111-4111-8111-111111111111','sbu-admin@example.com',now());
insert into public.admin_emails(email,enabled) values('sbu-admin@example.com',true);
select public.save_sbus(' Technology, CXO, Other, Technology ');
do $$ begin
 if (select count(*) from public.sbus)<>3 then raise exception 'Normalization failed'; end if;
 perform public.save_sbus('Technology, Finance');
 if exists(select 1 from public.sbus where name in ('CXO','Other')) or not exists(select 1 from public.sbus where name='Finance') then raise exception 'Replacement failed'; end if;
 begin
  perform public.save_sbus(' , ');
  raise exception 'Expected empty-list rejection' using errcode='P0002';
 exception when raise_exception then null;
 end;
 if (select count(*) from public.sbus)<>2 then raise exception 'Invalid input changed list'; end if;
 update public.admin_emails set enabled=false where email='sbu-admin@example.com';
 begin
  perform public.save_sbus('Unauthorized');
  raise exception 'Expected admin rejection';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
