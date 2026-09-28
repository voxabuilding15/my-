import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useStaff } from '@/auth/auth-context';
import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
} from '@/components/ui';
import { invoke, rpc, useSupabase } from '@/lib/api';
import { formatBytes, formatDate, formatNumber } from '@/lib/format';
import { useRpc } from '@/lib/queries';

type UserDetail = {
  profile: {
    id: string;
    display_name: string | null;
    role: string;
    timezone: string;
    created_at: string;
  };
  auth: {
    email: string;
    email_verified: boolean;
    created_at: string;
    last_sign_in_at: string | null;
    providers: string[];
  };
  subscription: {
    tier: string;
    status: string;
    product_id: string | null;
    store: string | null;
    current_period_end: string | null;
    will_renew: boolean | null;
  } | null;
  usage: { metric: string; period_start: string; used: number }[];
  counts: {
    documents: number;
    storage_bytes: number;
    notes: number;
    quizzes: number;
    decks: number;
    conversations: number;
  };
  recent_errors: {
    id: number;
    severity: string;
    code: string | null;
    message: string;
    created_at: string;
  }[];
  billing_events: { id: string; type: string; received_at: string }[];
};

type DialogKind = 'role' | 'subscription' | 'signout' | 'delete' | null;

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { role: myRole, user: me } = useStaff();
  const client = useSupabase();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const detail = useRpc<UserDetail>('admin_get_user', { p_user_id: id });
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [role, setRole] = useState('user');
  const [tier, setTier] = useState('premium');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  const close = () => {
    setDialog(null);
    setReason('');
    setConfirmEmail('');
    action.reset();
  };
  const action = useMutation({
    mutationFn: async (kind: Exclude<DialogKind, null>) => {
      if (kind === 'role')
        await rpc(client, 'admin_set_user_role', { p_user_id: id, p_role: role });
      if (kind === 'subscription') {
        await rpc(client, 'admin_set_subscription', {
          p_user_id: id,
          p_tier: tier,
          p_period_end: tier === 'premium' && until ? new Date(until).toISOString() : null,
          p_reason: reason,
        });
      }
      if (kind === 'signout')
        await invoke(client, 'admin-users', { action: 'sign_out_user', userId: id });
      if (kind === 'delete')
        await invoke(client, 'admin-users', { action: 'delete_user', userId: id, reason });
      return kind;
    },
    onSuccess: async (kind) => {
      close();
      if (kind === 'delete') {
        await queryClient.invalidateQueries({ queryKey: ['admin_list_users'] });
        void navigate('/users');
      } else {
        await queryClient.invalidateQueries({ queryKey: ['admin_get_user'] });
      }
    },
  });

  if (detail.isPending) return <Spinner />;
  if (detail.isError)
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  if (!detail.data)
    return (
      <ErrorState error={new Error('User not found (they may have deleted their account).')} />
    );
  const u = detail.data;
  const isAdmin = myRole === 'admin';
  const self = me.id === id;

  return (
    <>
      <Link
        to="/users"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Users
      </Link>
      <PageHeader
        title={u.auth.email}
        description={`${u.profile.display_name ?? 'No name'} · joined ${formatDate(u.auth.created_at, false)} · ${u.auth.providers.join(', ') || 'email'}`}
        actions={
          isAdmin && !self ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setRole(u.profile.role);
                  setDialog('role');
                }}
              >
                Change role
              </Button>
              <Button variant="secondary" onClick={() => setDialog('subscription')}>
                Set plan
              </Button>
              <Button variant="secondary" onClick={() => setDialog('signout')}>
                Sign out everywhere
              </Button>
              <Button variant="danger" onClick={() => setDialog('delete')}>
                Delete account
              </Button>
            </>
          ) : null
        }
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Account">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">User id</dt>
            <dd className="font-mono text-xs break-all">{u.profile.id}</dd>
            <dt className="text-muted">Role</dt>
            <dd>
              <Badge tone={u.profile.role === 'user' ? 'neutral' : 'warn'}>{u.profile.role}</Badge>
            </dd>
            <dt className="text-muted">Email verified</dt>
            <dd>{u.auth.email_verified ? 'Yes' : 'No'}</dd>
            <dt className="text-muted">Last sign-in</dt>
            <dd>{formatDate(u.auth.last_sign_in_at)}</dd>
            <dt className="text-muted">Time zone</dt>
            <dd>{u.profile.timezone}</dd>
          </dl>
        </Card>
        <Card title="Subscription">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Plan</dt>
            <dd>
              <Badge tone={u.subscription?.tier === 'premium' ? 'brand' : 'neutral'}>
                {u.subscription?.tier ?? 'free'}
              </Badge>
            </dd>
            <dt className="text-muted">Status</dt>
            <dd>{u.subscription?.status ?? '—'}</dd>
            <dt className="text-muted">Product</dt>
            <dd>{u.subscription?.product_id ?? '—'}</dd>
            <dt className="text-muted">Store</dt>
            <dd>{u.subscription?.store ?? '—'}</dd>
            <dt className="text-muted">Period ends</dt>
            <dd>{formatDate(u.subscription?.current_period_end)}</dd>
            <dt className="text-muted">Renews</dt>
            <dd>
              {u.subscription?.will_renew == null ? '—' : u.subscription.will_renew ? 'Yes' : 'No'}
            </dd>
          </dl>
        </Card>
        <Card title="Content">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Documents</dt>
            <dd>
              {formatNumber(u.counts.documents)} ({formatBytes(u.counts.storage_bytes)})
            </dd>
            <dt className="text-muted">Notes</dt>
            <dd>{formatNumber(u.counts.notes)}</dd>
            <dt className="text-muted">Quizzes</dt>
            <dd>{formatNumber(u.counts.quizzes)}</dd>
            <dt className="text-muted">Decks</dt>
            <dd>{formatNumber(u.counts.decks)}</dd>
            <dt className="text-muted">Chats</dt>
            <dd>{formatNumber(u.counts.conversations)}</dd>
          </dl>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Usage (current periods)">
          <Table head={['Metric', 'Period', 'Used']}>
            {u.usage.map((row) => (
              <tr key={`${row.metric}:${row.period_start}`}>
                <Td>{row.metric}</Td>
                <Td>{row.period_start}</Td>
                <Td className="tabular-nums">{formatNumber(row.used)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Recent errors">
          <Table head={['Time', 'Code', 'Message']}>
            {u.recent_errors.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{formatDate(e.created_at)}</Td>
                <Td className="font-mono text-xs">{e.code ?? '—'}</Td>
                <Td className="break-words">{e.message}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      <Dialog
        open={dialog !== null}
        onClose={close}
        title={
          dialog === 'role'
            ? 'Change role'
            : dialog === 'subscription'
              ? 'Set plan'
              : dialog === 'signout'
                ? 'Sign out everywhere'
                : 'Delete account'
        }
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={dialog === 'delete' ? 'danger' : 'primary'}
              loading={action.isPending}
              disabled={
                (dialog === 'subscription' && reason.trim().length < 3) ||
                (dialog === 'delete' && (reason.trim().length < 3 || confirmEmail !== u.auth.email))
              }
              onClick={() => dialog && action.mutate(dialog)}
            >
              Confirm
            </Button>
          </>
        }
      >
        {dialog === 'role' ? (
          <Field
            label="Role"
            hint="Admins can do everything; support sees users and errors; analysts see aggregate analytics only. Staff need two-factor sign-in."
          >
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="support">Support</option>
              <option value="analyst">Analyst</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        ) : null}
        {dialog === 'subscription' ? (
          <>
            <p className="text-sm text-muted">
              For compensation, testers or press. Store purchases are managed by RevenueCat and
              override this on their next event.
            </p>
            <Field label="Plan">
              <Select value={tier} onChange={(e) => setTier(e.target.value)}>
                <option value="premium">Premium</option>
                <option value="free">Free</option>
              </Select>
            </Field>
            {tier === 'premium' ? (
              <Field label="Until" hint="Leave empty for no end date.">
                <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Reason (audited)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </>
        ) : null}
        {dialog === 'signout' ? (
          <p className="text-sm">
            Ends every session of this user on all devices. They can sign in again.
          </p>
        ) : null}
        {dialog === 'delete' ? (
          <>
            <p className="text-sm text-bad">
              Permanently deletes the account and all its data (documents, chats, notes, quizzes,
              flashcards, files). This cannot be undone.
            </p>
            <Field label="Reason (audited)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label={`Type ${u.auth.email} to confirm`}>
              <Input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} />
            </Field>
          </>
        ) : null}
        {action.isError ? (
          <p role="alert" className="text-sm text-bad">
            {(action.error as Error).message}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
