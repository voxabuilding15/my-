# Supabase

| Path                 | Contents                                                        |
| -------------------- | --------------------------------------------------------------- |
| `config.toml`        | Supabase CLI project config (local stack, auth settings)        |
| `migrations/`        | Versioned schema migrations — the source of truth for the DB    |
| `tests/database/`    | pgTAP tests: RLS, privileges, quotas, grading, account deletion |
| `tests/run-local.sh` | Runs migrations + tests on plain PostgreSQL (no Docker needed)  |
| `tests/harness/`     | Minimal Supabase stand-in used only by `run-local.sh`           |

See [`docs/DATABASE.md`](../docs/DATABASE.md) for the schema, security model and workflows.
