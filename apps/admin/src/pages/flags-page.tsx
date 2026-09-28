import { useState } from 'react';

import { useStaff } from '@/auth/auth-context';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Spinner,
  Table,
  Td,
} from '@/components/ui';
import { formatAgo } from '@/lib/format';
import { useTable, useTableMutation } from '@/lib/table-hooks';

export type FeatureFlag = {
  key: string;
  description: string | null;
  enabled: boolean;
  rollout_percent: number;
  platforms: string[];
  min_app_version: string | null;
  tiers: string[] | null;
  updated_at: string;
};

const EMPTY: FeatureFlag = {
  key: '',
  description: '',
  enabled: false,
  rollout_percent: 100,
  platforms: ['android', 'ios'],
  min_app_version: null,
  tiers: null,
  updated_at: '',
};

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function FlagsPage() {
  const { role } = useStaff();
  const editable = role === 'admin';
  const flags = useTable<FeatureFlag>('feature_flags', '*', { column: 'key' });
  const mutation = useTableMutation('feature_flags');
  const [editing, setEditing] = useState<{ flag: FeatureFlag; isNew: boolean } | null>(null);

  const save = () => {
    if (!editing) return;
    const { updated_at: _u, key, ...values } = editing.flag;
    const payload = {
      ...values,
      min_app_version: values.min_app_version || null,
      tiers: values.tiers?.length ? values.tiers : null,
    };
    mutation.mutate(
      editing.isNew
        ? { kind: 'insert', values: { key, ...payload } }
        : { kind: 'update', match: { key }, values: payload },
      {
        onSuccess: () => setEditing(null),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Turn features on or off, roll out gradually, or target platforms, plans and app versions — no app release needed. Apps pick up changes within 15 minutes."
        actions={
          editable ? (
            <Button onClick={() => setEditing({ flag: EMPTY, isNew: true })}>New flag</Button>
          ) : null
        }
      />
      <Card>
        {flags.isPending ? (
          <Spinner />
        ) : flags.isError ? (
          <ErrorState error={flags.error} />
        ) : flags.data.length === 0 ? (
          <EmptyState>No flags yet.</EmptyState>
        ) : (
          <Table head={['Flag', 'State', 'Rollout', 'Targeting', 'Updated', '']}>
            {flags.data.map((flag) => (
              <tr key={flag.key}>
                <Td>
                  <div className="font-mono text-xs">{flag.key}</div>
                  <div className="text-xs text-muted">{flag.description}</div>
                </Td>
                <Td>
                  {editable ? (
                    <button
                      role="switch"
                      aria-checked={flag.enabled}
                      aria-label={`Toggle ${flag.key}`}
                      onClick={() =>
                        mutation.mutate({
                          kind: 'update',
                          match: { key: flag.key },
                          values: { enabled: !flag.enabled },
                        })
                      }
                      className={`relative h-6 w-11 rounded-full transition ${flag.enabled ? 'bg-brand' : 'bg-line'}`}
                    >
                      <span
                        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${flag.enabled ? 'left-5.5' : 'left-0.5'}`}
                      />
                    </button>
                  ) : (
                    <Badge tone={flag.enabled ? 'ok' : 'neutral'}>
                      {flag.enabled ? 'on' : 'off'}
                    </Badge>
                  )}
                </Td>
                <Td className="tabular-nums">{flag.rollout_percent}%</Td>
                <Td className="text-xs text-muted">
                  {flag.platforms.join(', ')}
                  {flag.min_app_version ? ` · ≥ ${flag.min_app_version}` : ''}
                  {flag.tiers ? ` · ${flag.tiers.join(', ')}` : ''}
                </Td>
                <Td>{formatAgo(flag.updated_at)}</Td>
                <Td className="text-right">
                  {editable ? (
                    <Button variant="ghost" onClick={() => setEditing({ flag, isNew: false })}>
                      Edit
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        {mutation.isError ? (
          <p role="alert" className="mt-3 text-sm text-bad">
            {(mutation.error as Error).message}
          </p>
        ) : null}
      </Card>

      <Dialog
        open={editing !== null}
        title={editing?.isNew ? 'New flag' : `Edit ${editing?.flag.key}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            {editing && !editing.isNew ? (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() =>
                  mutation.mutate(
                    { kind: 'delete', match: { key: editing.flag.key } },
                    { onSuccess: () => setEditing(null) },
                  )
                }
              >
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              disabled={!editing || !/^[a-z][a-z0-9_.]{1,63}$/.test(editing.flag.key)}
              onClick={save}
            >
              Save
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="grid gap-3">
            <Field label="Key" hint="Lowercase, e.g. ai.mind_map">
              <Input
                value={editing.flag.key}
                disabled={!editing.isNew}
                onChange={(e) =>
                  setEditing({ ...editing, flag: { ...editing.flag, key: e.target.value } })
                }
              />
            </Field>
            <Field label="Description">
              <Input
                value={editing.flag.description ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, flag: { ...editing.flag, description: e.target.value } })
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.flag.enabled}
                onChange={(e) =>
                  setEditing({ ...editing, flag: { ...editing.flag, enabled: e.target.checked } })
                }
              />{' '}
              Enabled
            </label>
            <Field
              label={`Rollout: ${editing.flag.rollout_percent}% of signed-in users`}
              hint="Each user stays in or out as you increase it."
            >
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={editing.flag.rollout_percent}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    flag: { ...editing.flag, rollout_percent: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-1 font-medium">Platforms</legend>
              {['android', 'ios', 'web'].map((p) => (
                <label key={p} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={editing.flag.platforms.includes(p)}
                    onChange={() =>
                      setEditing({
                        ...editing,
                        flag: { ...editing.flag, platforms: toggle(editing.flag.platforms, p) },
                      })
                    }
                  />{' '}
                  {p}
                </label>
              ))}
            </fieldset>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-1 font-medium">Plans (none = everyone)</legend>
              {['free', 'premium'].map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={editing.flag.tiers?.includes(t) ?? false}
                    onChange={() =>
                      setEditing({
                        ...editing,
                        flag: { ...editing.flag, tiers: toggle(editing.flag.tiers ?? [], t) },
                      })
                    }
                  />{' '}
                  {t}
                </label>
              ))}
            </fieldset>
            <Field label="Minimum app version" hint="Optional, e.g. 1.2.0">
              <Input
                value={editing.flag.min_app_version ?? ''}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    flag: { ...editing.flag, min_app_version: e.target.value },
                  })
                }
              />
            </Field>
            {mutation.isError ? (
              <p role="alert" className="text-sm text-bad">
                {(mutation.error as Error).message}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
