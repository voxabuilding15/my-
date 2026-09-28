import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
} from '@/components/ui';
import { rpc, useSupabase } from '@/lib/api';
import { formatAgo, formatDate } from '@/lib/format';

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  tier: string;
  email_verified: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

const PAGE = 50;

export function UsersPage() {
  const client = useSupabase();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('');
  const [role, setRole] = useState('');
  const filters = { p_query: query || null, p_tier: tier || null, p_role: role || null };

  const users = useInfiniteQuery({
    queryKey: ['admin_list_users', filters],
    queryFn: ({ pageParam }) =>
      rpc<UserRow[]>(client, 'admin_list_users', {
        ...filters,
        p_before_created_at: pageParam?.createdAt ?? null,
        p_before_id: pageParam?.id ?? null,
        p_limit: PAGE,
      }),
    initialPageParam: null as { createdAt: string; id: string } | null,
    // Keyset pagination: stable and fast at any depth, unlike OFFSET.
    getNextPageParam: (last) => {
      const tail = last.at(-1);
      return last.length === PAGE && tail ? { createdAt: tail.created_at, id: tail.id } : null;
    },
  });
  const rows = users.data?.pages.flat() ?? [];

  const search = (event: FormEvent) => {
    event.preventDefault();
    setQuery(draft.trim());
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Search by exact email, user id, or the start of a name."
      />
      <Card>
        <form onSubmit={search} className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_160px_auto]">
          <Input
            aria-label="Search users"
            placeholder="ada@example.com, user id, or name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Select aria-label="Plan" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
          </Select>
          <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            <option value="user">User</option>
            <option value="support">Support</option>
            <option value="analyst">Analyst</option>
            <option value="admin">Admin</option>
          </Select>
          <Button type="submit">Search</Button>
        </form>
        {users.isPending ? (
          <Spinner />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => void users.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState>No users found.</EmptyState>
        ) : (
          <>
            <Table head={['User', 'Plan', 'Role', 'Verified', 'Joined', 'Last sign-in']}>
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-canvas">
                  <Td>
                    <Link to={`/users/${u.id}`} className="font-medium text-brand hover:underline">
                      {u.email}
                    </Link>
                    <div className="text-xs text-muted">{u.display_name ?? '—'}</div>
                  </Td>
                  <Td>
                    <Badge tone={u.tier === 'premium' ? 'brand' : 'neutral'}>{u.tier}</Badge>
                  </Td>
                  <Td>{u.role === 'user' ? '—' : <Badge tone="warn">{u.role}</Badge>}</Td>
                  <Td>
                    {u.email_verified ? (
                      <Badge tone="ok">yes</Badge>
                    ) : (
                      <Badge tone="warn">no</Badge>
                    )}
                  </Td>
                  <Td>{formatDate(u.created_at, false)}</Td>
                  <Td>{formatAgo(u.last_sign_in_at)}</Td>
                </tr>
              ))}
            </Table>
            {users.hasNextPage ? (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="secondary"
                  loading={users.isFetchingNextPage}
                  onClick={() => void users.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
