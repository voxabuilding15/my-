import { useState } from 'react';

import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Spinner,
  Table,
  Td,
  Textarea,
} from '@/components/ui';
import { formatAgo } from '@/lib/format';
import { useTable, useTableMutation } from '@/lib/table-hooks';

type ConfigRow = {
  key: string;
  value: unknown;
  is_public: boolean;
  description: string | null;
  updated_at: string;
};
type PlanLimits = Record<string, number | null | string> & { tier: string };

const LIMITS: { column: string; label: string; unit?: string; required?: boolean }[] = [
  { column: 'ai_requests_per_day', label: 'AI requests / day' },
  { column: 'chat_messages_per_day', label: 'Chat messages / day' },
  { column: 'uploads_per_month', label: 'Uploads / month' },
  { column: 'max_file_size_mb', label: 'Max file size', unit: 'MB', required: true },
  { column: 'max_pages_per_document', label: 'Max pages / document' },
  { column: 'quizzes_per_day', label: 'Quizzes / day' },
  { column: 'flashcard_decks_per_day', label: 'Flashcard decks / day' },
  { column: 'ocr_scans_per_day', label: 'OCR scans / day' },
  { column: 'storage_mb', label: 'Storage', unit: 'MB' },
];

function PlanLimitsCard() {
  const limits = useTable<PlanLimits>('plan_limits', '*', { column: 'tier' });
  const mutation = useTableMutation('plan_limits');
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});

  if (limits.isPending) return <Spinner />;
  if (limits.isError) return <ErrorState error={limits.error} />;

  const value = (tier: string, column: string) =>
    draft[tier]?.[column] ?? String(limits.data.find((l) => l.tier === tier)?.[column] ?? '');
  const dirty = Object.keys(draft).length > 0;
  const save = async () => {
    for (const [tier, columns] of Object.entries(draft)) {
      const values = Object.fromEntries(
        Object.entries(columns).map(([c, v]) => [c, v.trim() === '' ? null : Number(v)]),
      );
      await mutation.mutateAsync({ kind: 'update', match: { tier }, values });
    }
    setDraft({});
  };

  return (
    <Card
      title="Plan limits"
      actions={
        dirty ? (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft({})}>
              Discard
            </Button>
            <Button loading={mutation.isPending} onClick={() => void save()}>
              Save limits
            </Button>
          </div>
        ) : null
      }
    >
      <p className="mb-3 text-sm text-muted">
        Applied immediately to every user. Empty = unlimited.
      </p>
      <Table head={['Limit', 'Free', 'Premium']}>
        {LIMITS.map(({ column, label, unit, required }) => (
          <tr key={column}>
            <Td>
              {label}
              {unit ? <span className="text-muted"> ({unit})</span> : null}
            </Td>
            {['free', 'premium'].map((tier) => (
              <Td key={tier}>
                <Input
                  aria-label={`${label} (${tier})`}
                  type="number"
                  min={0}
                  required={required}
                  placeholder="Unlimited"
                  value={value(tier, column)}
                  onChange={(e) =>
                    setDraft({ ...draft, [tier]: { ...draft[tier], [column]: e.target.value } })
                  }
                  className="w-32"
                />
              </Td>
            ))}
          </tr>
        ))}
      </Table>
      {mutation.isError ? (
        <p role="alert" className="mt-3 text-sm text-bad">
          {(mutation.error as Error).message}
        </p>
      ) : null}
    </Card>
  );
}

function ConfigEditor({ row }: { row: ConfigRow }) {
  const mutation = useTableMutation('app_config');
  const [text, setText] = useState(() => JSON.stringify(row.value, null, 2));
  let parsed: { ok: true; value: unknown } | { ok: false } = { ok: false };
  try {
    parsed = { ok: true, value: JSON.parse(text) };
  } catch {
    parsed = { ok: false };
  }
  const changed = parsed.ok && JSON.stringify(parsed.value) !== JSON.stringify(row.value);

  return (
    <div className="grid gap-2">
      <Textarea
        aria-label={`Value of ${row.key}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(12, text.split('\n').length + 1)}
        aria-invalid={!parsed.ok}
      />
      <div className="flex items-center gap-2">
        {!parsed.ok ? <span className="text-xs text-bad">Invalid JSON</span> : null}
        {mutation.isError ? (
          <span className="text-xs text-bad">{(mutation.error as Error).message}</span>
        ) : null}
        <Button
          className="ml-auto"
          disabled={!changed}
          loading={mutation.isPending}
          onClick={() =>
            parsed.ok &&
            mutation.mutate({
              kind: 'update',
              match: { key: row.key },
              values: { value: parsed.value },
            })
          }
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function ConfigPage() {
  const config = useTable<ConfigRow>('app_config', '*', { column: 'key' });
  const [filter, setFilter] = useState('');
  const rows = (config.data ?? []).filter(
    (r) => r.key.includes(filter.trim().toLowerCase()) && r.key !== 'system.last_maintenance',
  );

  return (
    <>
      <PageHeader
        title="Remote config"
        description="Server-side settings read by the app and backend. Changes apply without an app release and are recorded in the audit log."
      />
      <PlanLimitsCard />
      <Card
        title="Settings"
        className="mt-4"
        actions={
          <Input
            aria-label="Filter settings"
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 w-48"
          />
        }
      >
        {config.isPending ? (
          <Spinner />
        ) : config.isError ? (
          <ErrorState error={config.error} />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((row) => (
              <div key={row.key} className="grid gap-3 py-4 lg:grid-cols-[280px_1fr]">
                <div>
                  <div className="font-mono text-sm">{row.key}</div>
                  <div className="mt-1 text-xs text-muted">{row.description}</div>
                  <div className="mt-1 text-xs text-muted">
                    {row.is_public ? 'Public (sent to apps)' : 'Server only'} · updated{' '}
                    {formatAgo(row.updated_at)}
                  </div>
                </div>
                <ConfigEditor key={row.updated_at} row={row} />
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Tip" className="mt-4">
        <Field label="Emergency: disable all AI">
          <span className="text-sm text-muted">
            Set <code>ai.enabled</code> to <code>false</code>. Every AI request is refused within
            seconds; set it back to <code>true</code> to resume.
          </span>
        </Field>
      </Card>
    </>
  );
}
