-- Performance guards (Phase 8): schema rules that keep queries fast as data grows.
begin;
\ir _helpers.psql
select plan(3);

-- Deleting a document, conversation or quiz cascades through its children: without an index
-- on the referencing column, each cascade scans the whole child table.
select is(
  array(
    select c.conrelid::regclass || '.' || c.conname
    from pg_constraint c
    where c.contype = 'f'
      and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)
      and not exists (
        select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
      )
    order by 1
  ),
  '{}'::text[],
  'every foreign key has an index starting with its first column'
);

-- auth.uid() called directly in a policy runs once per row; wrapped in a sub-select it runs
-- once per query (Supabase performance advisor: auth_rls_initplan).
select is(
  array(
    select tablename || '.' || policyname from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
      and (coalesce(qual, '') || coalesce(with_check, ''))
        !~ '\(\s*SELECT\s+auth\.uid\(\)'
    order by 1
  ),
  '{}'::text[],
  'row level security policies evaluate auth.uid() once per query'
);

-- The library (newest first) and chat history are the hottest reads.
select ok(
  exists (select 1 from pg_indexes where indexname = 'documents_user_recent_idx')
  and exists (select 1 from pg_indexes where indexname = 'messages_conversation_created_idx')
  and exists (select 1 from pg_indexes where indexname = 'conversations_user_recent_idx'),
  'library, conversation list and chat history have their ordering indexes'
);

select * from finish();
rollback;
