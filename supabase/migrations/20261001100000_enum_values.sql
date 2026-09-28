-- New enum values must be committed before use, so they get their own migration.

-- Staff roles: support (users, errors, documents) and analyst (aggregate analytics only).
alter type public.user_role add value if not exists 'support';
alter type public.user_role add value if not exists 'analyst';

-- Errors reported by background workers (Cloud Run document processor).
alter type public.error_source add value if not exists 'worker';
