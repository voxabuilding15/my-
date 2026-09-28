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
  Select,
  Spinner,
  Table,
  Td,
  Textarea,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useTable, useTableMutation } from '@/lib/table-hooks';

const LOCALES = [
  { code: 'en', label: 'English (required)' },
  { code: 'fr', label: 'French' },
  { code: 'ar', label: 'Arabic' },
] as const;

type Localized = Record<string, string>;
type Announcement = {
  id?: string;
  title: Localized;
  body: Localized;
  cta_label: Localized | null;
  cta_url: string | null;
  audience: 'all' | 'free' | 'premium';
  platforms: string[];
  min_app_version: string | null;
  priority: number;
  dismissible: boolean;
  starts_at: string;
  ends_at: string | null;
};

const blank = (): Announcement => ({
  title: { en: '' },
  body: { en: '' },
  cta_label: null,
  cta_url: null,
  audience: 'all',
  platforms: ['android', 'ios'],
  min_app_version: null,
  priority: 0,
  dismissible: true,
  starts_at: new Date().toISOString(),
  ends_at: null,
});

const toLocalInput = (iso: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    : '';
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const clean = (text: Localized | null) => {
  const entries = Object.entries(text ?? {}).filter(([, v]) => v.trim());
  return entries.length ? Object.fromEntries(entries) : null;
};

function status(a: Announcement, now = Date.now()) {
  if (new Date(a.starts_at).getTime() > now) return <Badge tone="brand">scheduled</Badge>;
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return <Badge>ended</Badge>;
  return <Badge tone="ok">live</Badge>;
}

export function AnnouncementsPage() {
  const { role } = useStaff();
  const editable = role === 'admin';
  const list = useTable<Announcement>('announcements', '*', {
    column: 'starts_at',
    ascending: false,
  });
  const mutation = useTableMutation('announcements');
  const [draft, setDraft] = useState<Announcement | null>(null);

  const save = () => {
    if (!draft) return;
    const { id, ...rest } = draft;
    const values = {
      ...rest,
      title: clean(rest.title),
      body: clean(rest.body),
      cta_label: clean(rest.cta_label),
      cta_url: rest.cta_url?.trim() || null,
      min_app_version: rest.min_app_version?.trim() || null,
    };
    mutation.mutate(id ? { kind: 'update', match: { id }, values } : { kind: 'insert', values }, {
      onSuccess: () => setDraft(null),
    });
  };
  const set = (patch: Partial<Announcement>) => draft && setDraft({ ...draft, ...patch });
  const valid =
    Boolean(draft?.title.en?.trim() && draft.body.en?.trim()) &&
    (!draft?.cta_url || /^(https:\/\/|studexa:\/\/)/.test(draft.cta_url));

  return (
    <>
      <PageHeader
        title="Announcements"
        description="In-app banners on the Home screen, localised, targeted by plan, platform and version, and scheduled."
        actions={
          editable ? <Button onClick={() => setDraft(blank())}>New announcement</Button> : null
        }
      />
      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} />
        ) : list.data.length === 0 ? (
          <EmptyState>No announcements.</EmptyState>
        ) : (
          <Table head={['Title', 'Status', 'Audience', 'Priority', 'Starts', 'Ends', '']}>
            {list.data.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="font-medium">{a.title.en}</div>
                  <div className="text-xs text-muted">{Object.keys(a.title).join(' · ')}</div>
                </Td>
                <Td>{status(a)}</Td>
                <Td>{a.audience}</Td>
                <Td className="tabular-nums">{a.priority}</Td>
                <Td>{formatDate(a.starts_at)}</Td>
                <Td>{formatDate(a.ends_at)}</Td>
                <Td className="text-right">
                  {editable ? (
                    <Button variant="ghost" onClick={() => setDraft(a)}>
                      Edit
                    </Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Dialog
        open={draft !== null}
        title={draft?.id ? 'Edit announcement' : 'New announcement'}
        onClose={() => setDraft(null)}
        footer={
          <>
            {draft?.id ? (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() =>
                  mutation.mutate(
                    { kind: 'delete', match: { id: draft.id } },
                    { onSuccess: () => setDraft(null) },
                  )
                }
              >
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button loading={mutation.isPending} disabled={!valid} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
            {LOCALES.map(({ code, label }) => (
              <fieldset
                key={code}
                className="grid gap-2 rounded-lg border border-line p-3"
                dir={code === 'ar' ? 'rtl' : 'ltr'}
              >
                <legend className="px-1 text-sm font-medium">{label}</legend>
                <Input
                  aria-label={`Title (${code})`}
                  placeholder="Title"
                  value={draft.title[code] ?? ''}
                  onChange={(e) => set({ title: { ...draft.title, [code]: e.target.value } })}
                />
                <Textarea
                  aria-label={`Message (${code})`}
                  placeholder="Message"
                  className="font-sans"
                  value={draft.body[code] ?? ''}
                  onChange={(e) => set({ body: { ...draft.body, [code]: e.target.value } })}
                />
                <Input
                  aria-label={`Button label (${code})`}
                  placeholder="Button label (optional)"
                  value={draft.cta_label?.[code] ?? ''}
                  onChange={(e) =>
                    set({ cta_label: { ...(draft.cta_label ?? {}), [code]: e.target.value } })
                  }
                />
              </fieldset>
            ))}
            <Field label="Button link" hint="https://… or an app screen such as studexa://paywall">
              <Input
                value={draft.cta_url ?? ''}
                onChange={(e) => set({ cta_url: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Audience">
                <Select
                  value={draft.audience}
                  onChange={(e) => set({ audience: e.target.value as Announcement['audience'] })}
                >
                  <option value="all">Everyone</option>
                  <option value="free">Free users</option>
                  <option value="premium">Premium users</option>
                </Select>
              </Field>
              <Field label="Priority" hint="Highest is shown first">
                <Input
                  type="number"
                  value={draft.priority}
                  onChange={(e) => set({ priority: Number(e.target.value) })}
                />
              </Field>
              <Field label="Starts">
                <Input
                  type="datetime-local"
                  value={toLocalInput(draft.starts_at)}
                  onChange={(e) =>
                    set({ starts_at: fromLocalInput(e.target.value) ?? new Date().toISOString() })
                  }
                />
              </Field>
              <Field label="Ends (optional)">
                <Input
                  type="datetime-local"
                  value={toLocalInput(draft.ends_at)}
                  onChange={(e) => set({ ends_at: fromLocalInput(e.target.value) })}
                />
              </Field>
              <Field label="Minimum app version (optional)">
                <Input
                  value={draft.min_app_version ?? ''}
                  onChange={(e) => set({ min_app_version: e.target.value })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.dismissible}
                onChange={(e) => set({ dismissible: e.target.checked })}
              />{' '}
              Users can dismiss it
            </label>
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
