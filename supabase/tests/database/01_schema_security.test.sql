begin;
\ir _helpers.psql
select plan(9);

select is(
  array(
    select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ),
  '{}'::text[],
  'every public table has row level security enabled'
);

select is(
  array(
    select distinct table_name::text from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
  ),
  '{}'::text[],
  'anon has no privileges on any public table'
);

select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  ),
  '{}'::text[],
  'anon cannot execute any public function'
);

select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
    order by 1
  ),
  array[
    'export_my_data', 'get_my_usage', 'get_study_stats', 'is_admin', 'log_study_time',
    'match_document_chunks', 'register_push_token', 'review_flashcard', 'start_quiz_attempt',
    'submit_quiz_attempt'
  ],
  'authenticated can execute exactly the client-facing functions'
);

select is(
  array(
    select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('consume_quota', 'release_quota', 'authorize_upload', 'check_rate_limit', 'current_tier', 'ai_spend_today_usd')
      and has_function_privilege('authenticated', p.oid, 'execute')
  ),
  '{}'::text[],
  'server-only functions are not callable by clients'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage')
    and not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'analytics', 'usage')
    and not has_schema_privilege('anon', 'analytics', 'usage'),
  'private and analytics schemas are not reachable by clients'
);

select is(
  array(
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ),
  '{}'::text[],
  'every SECURITY DEFINER function pins its search_path'
);

select is(
  array(
    select con.conrelid::regclass || '(' || a.attname || ')'
    from pg_constraint con
    join pg_namespace n on n.oid = con.connamespace
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i where i.indrelid = con.conrelid and i.indkey[0] = con.conkey[1]
      )
  ),
  '{}'::text[],
  'every foreign key is backed by an index on its leading column'
);

select is(
  array(
    select table_name || '.' || column_name from information_schema.columns
    where table_schema = 'analytics' and (data_type = 'uuid' or column_name like '%user%')
  ),
  '{}'::text[],
  'analytics tables contain no user identifiers'
);

select * from finish();
rollback;
