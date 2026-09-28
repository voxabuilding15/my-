import type { SupabaseClient } from '@supabase/supabase-js';

export const USER_BUCKETS = ['documents', 'avatars'] as const;

export async function listFilesRecursive(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  const folder = prefix.replace(/\/+$/, '');
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.storage.from(bucket).list(folder, { limit: 100, offset });
    if (error) throw error;
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      // Folders have no id in Storage listings.
      if (entry.id) files.push(path);
      else files.push(...(await listFilesRecursive(client, bucket, path)));
    }
    if (data.length < 100) return files;
  }
}

/** Removes every object under a prefix, in batches. Returns the number removed. */
export async function removePrefix(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  const files = await listFilesRecursive(client, bucket, prefix);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await client.storage.from(bucket).remove(files.slice(i, i + 100));
    if (error) throw error;
  }
  return files.length;
}
