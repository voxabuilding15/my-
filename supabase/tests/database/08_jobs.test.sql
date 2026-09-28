begin;
\ir _helpers.psql
select plan(16);

-- Enqueue and dedupe
select public.enqueue_job('document_extract', '{"document_id": "d1"}', 'd1') as j1 \gset
select is(public.enqueue_job('document_extract', '{"document_id": "d1"}', 'd1'), :'j1'::bigint,
  'an active job with the same dedupe key is reused, not duplicated');
select public.enqueue_job('document_extract', '{"document_id": "d2"}', 'd2', 5::smallint) as j2 \gset
select public.enqueue_job('document_extract', '{}', 'later', 0::smallint, 5, 600) as j3 \gset

-- Claiming: priority first, delayed jobs wait, SKIP LOCKED leases
select is(
  array(select id from public.claim_jobs('document_extract', 'worker-a', 10) order by priority desc),
  array[:'j2'::bigint, :'j1'::bigint],
  'ready jobs are claimed by priority; delayed jobs are not claimed yet'
);
select is((select count(*)::int from public.claim_jobs('document_extract', 'worker-b', 10)), 0,
  'leased jobs are not handed to a second worker');
select is((select attempts from private.jobs where id = :'j1'), 1, 'claiming counts an attempt');

-- Completion only by the lease holder
select is(public.complete_job(:'j2', 'worker-b'), null, 'another worker cannot complete a job it does not hold');
select ok(public.complete_job(:'j2', 'worker-a'), 'the lease holder completes the job');
select is((select status::text from private.jobs where id = :'j2'), 'succeeded', 'completed jobs are marked succeeded');
select isnt(public.enqueue_job('document_extract', '{}', 'd2'), :'j2'::bigint,
  'a finished job no longer blocks a new job with the same key');

-- Retry with exponential backoff
select is(public.fail_job(:'j1', 'worker-a', 'timeout')::text, 'queued', 'a retryable failure requeues the job');
select ok(
  (select run_after between now() + interval '23 seconds' and now() + interval '37 seconds' from private.jobs where id = :'j1'),
  'the first retry waits about 30 seconds (with jitter)'
);
update private.jobs set attempts = 4, run_after = now() - interval '1 minute' where id = :'j1';
select public.claim_jobs('document_extract', 'worker-a', 1);
select is(public.fail_job(:'j1', 'worker-a', 'timeout')::text, 'dead', 'the last allowed attempt moves the job to dead letter');
select ok(
  (select sum(value) from analytics.daily_metrics where metric = 'jobs_dead' and dimension = 'document_extract') = 1,
  'dead jobs are counted for monitoring'
);

-- Permanent failure skips retries
select public.enqueue_job('document_extract', '{}', 'bad') as j4 \gset
update private.jobs set run_after = now() - interval '1 second' where id = :'j3';
select public.claim_jobs('document_extract', 'worker-a', 10);
select is(public.fail_job(:'j4', 'worker-a', 'unsupported file', false)::text, 'dead',
  'a permanent failure goes straight to dead letter');

-- Expired leases (crashed worker) are reclaimed
update private.jobs set locked_until = now() - interval '1 second' where id = :'j3';
select is(
  array(select id from public.claim_jobs('document_extract', 'worker-c', 10)),
  array[:'j3'::bigint],
  'a job whose lease expired is reclaimed by another worker'
);
select is((select locked_by from private.jobs where id = :'j3'), 'worker-c', 'the new worker holds the lease');

-- Maintenance purges old finished jobs
update private.jobs set finished_at = now() - interval '8 days' where id = :'j2';
select private.run_maintenance();
select ok(not exists (select 1 from private.jobs where id = :'j2'), 'maintenance purges old succeeded jobs');

select * from finish();
rollback;
