import { Link } from 'react-router';

import { useStaff } from '@/auth/auth-context';
import { Card, ErrorState, PageHeader, Spinner, StatCard, Table, Td } from '@/components/ui';
import { formatBytes, formatNumber } from '@/lib/format';
import { useRpc } from '@/lib/queries';

type Storage = {
  total_bytes: number;
  documents: number;
  database_bytes: number;
  by_kind: Record<string, { bytes: number; count: number }>;
  top_users: { user_id: string; bytes: number; documents: number }[];
};

export function StoragePage() {
  const { role } = useStaff();
  const storage = useRpc<Storage>('admin_storage_usage');
  if (storage.isPending) return <Spinner />;
  if (storage.isError)
    return <ErrorState error={storage.error} onRetry={() => void storage.refetch()} />;
  const s = storage.data;
  return (
    <>
      <PageHeader title="Storage" description="Uploaded files and database size." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Files" value={formatBytes(s.total_bytes)} />
        <StatCard label="Documents" value={formatNumber(s.documents)} />
        <StatCard
          label="Average file"
          value={formatBytes(s.documents ? s.total_bytes / s.documents : 0)}
        />
        <StatCard label="Database" value={formatBytes(s.database_bytes)} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="By file type">
          <Table head={['Type', 'Files', 'Size']}>
            {Object.entries(s.by_kind).map(([kind, v]) => (
              <tr key={kind}>
                <Td>{kind}</Td>
                <Td className="tabular-nums">{formatNumber(v.count)}</Td>
                <Td>{formatBytes(v.bytes)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Largest accounts">
          <Table head={['User', 'Documents', 'Size']}>
            {s.top_users.map((u) => (
              <tr key={u.user_id}>
                <Td className="font-mono text-xs">
                  {role === 'analyst' ? (
                    u.user_id.slice(0, 8)
                  ) : (
                    <Link className="text-brand hover:underline" to={`/users/${u.user_id}`}>
                      {u.user_id.slice(0, 8)}
                    </Link>
                  )}
                </Td>
                <Td className="tabular-nums">{formatNumber(u.documents)}</Td>
                <Td>{formatBytes(u.bytes)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
