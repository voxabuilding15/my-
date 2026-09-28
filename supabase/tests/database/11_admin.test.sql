begin;
\ir _helpers.psql
select plan(22);

select tests.create_user('admin@example.com') as admin \gset
select tests.create_user('support@example.com') as support \gset
select tests.create_user('analyst@example.com') as analyst \gset
select tests.create_user('ada@example.com', '{"full_name": "Ada Lovelace"}') as ada \gset
update public.profiles set role = 'admin' where id = :'admin';
update public.profiles set role = 'support' where id = :'support';
update public.profiles set role = 'analyst' where id = :'analyst';
select tests.create_document(:'ada') as doc \gset
update public.documents set status = 'failed', error_code = 'corrupt' where id = :'doc';
insert into public.error_logs (user_id, source, severity, code, message) values
  (:'ada', 'mobile', 'error', 'network', 'offline'), (:'ada', 'mobile', 'error', 'network', 'timeout');
select public.record_heartbeat('document-processor', 'rev-1', '1.0.0');

set local role authenticated;

-- Regular users and staff without a second factor are refused
select tests.as_user(:'ada', 'aal2');
select throws_ok('select public.admin_overview()', '42501', null, 'regular users cannot call admin functions');
select tests.as_user(:'admin');
select throws_ok('select public.admin_overview()', '42501', null, 'admins without MFA (aal1) are refused');
select is(public.staff_role(), null, 'staff_role is null without MFA');

-- Admin (aal2): every dashboard function works
select tests.as_user(:'admin', 'aal2');
select is(public.staff_role()::text, 'admin', 'an admin with MFA has the admin role');
select ok((public.admin_overview() ->> 'users_total')::int = 4, 'overview counts users');
select is((select count(*)::int from public.admin_timeseries('signups', 7)), 1, 'timeseries reads daily aggregates');
select is(
  (select array_agg(email order by email) from public.admin_list_users('ada@example.com')),
  array['ada@example.com'], 'users can be found by exact email'
);
select is((select count(*)::int from public.admin_list_users('Ada')), 1, 'users can be found by name prefix');
select is((select count(*)::int from public.admin_list_users(:'ada')), 1, 'users can be found by id');
select is(
  (select count(*)::int from public.admin_list_users(null, null, null, null, null, 2)),
  2, 'user lists are paginated'
);
select is(public.admin_get_user(:'ada') -> 'counts' ->> 'documents', '1', 'user detail includes counts');
select is((select occurrences::int from public.admin_error_groups(24) where code = 'network'), 2, 'errors are grouped by code');
select is((select count(*)::int from public.admin_list_errors(null, null, 'network')), 2, 'errors can be filtered');
select ok(public.admin_documents_status() -> 'by_status' ? 'failed', 'document status is summarised');
select is(public.admin_retry_document(:'doc'), 'queued', 'a failed document can be retried');
select ok((public.admin_storage_usage() ->> 'total_bytes')::bigint > 0, 'storage usage is reported');
select ok(
  (select bool_and((s ->> 'healthy')::boolean) from jsonb_array_elements(public.admin_system_health() -> 'services') s),
  'system health lists live services'
);
select ok(public.admin_subscriptions_summary() ? 'by_status', 'subscriptions are summarised');

-- Role management: audited, and the last admin cannot be demoted
select public.admin_set_user_role(:'ada', 'support');
select is(
  (select after ->> 'role' from public.admin_audit_log where action = 'set_role' and target = 'profiles:' || :'ada'),
  'support', 'role changes are audited'
);
select throws_ok(format('select public.admin_set_user_role(%L, %L)', :'admin', 'user'), '23514', null,
  'the last admin cannot be demoted');

-- Support and analyst permissions
select tests.as_user(:'support', 'aal2');
select throws_ok(format('select public.admin_set_subscription(%L, %L, now(), %L)', :'ada', 'premium', 'gift'),
  '42501', null, 'support cannot grant subscriptions');
select tests.as_user(:'analyst', 'aal2');
select throws_ok(format('select * from public.admin_list_users(%L)', 'ada'), '42501', null,
  'analysts cannot browse personal data');

select * from finish();
rollback;
