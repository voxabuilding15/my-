import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState, ListRow, Screen, ScreenHeader, Section, Skeleton } from '@/shared/ui';

import { useBookmarks } from '../hooks/use-documents';

export function BookmarksScreen() {
  const { t } = useTranslation();
  const bookmarks = useBookmarks();
  const byDocument = new Map<string, NonNullable<typeof bookmarks.data>>();
  for (const bookmark of bookmarks.data ?? []) {
    byDocument.set(bookmark.documentTitle, [
      ...(byDocument.get(bookmark.documentTitle) ?? []),
      bookmark,
    ]);
  }
  return (
    <Screen scroll edges={['bottom']}>
      <ScreenHeader title={t('bookmarks.title')} />
      {bookmarks.isPending ? <Skeleton height={120} radius={16} /> : null}
      {bookmarks.data?.length === 0 ? (
        <EmptyState icon="bookmark-outline" title={t('bookmarks.empty')} />
      ) : null}
      {[...byDocument.entries()].map(([title, items]) => (
        <Section key={title} title={title}>
          {items
            .sort((a, b) => a.page - b.page)
            .map((bookmark) => (
              <ListRow
                key={bookmark.id}
                icon="bookmark"
                label={t('document.page', { page: bookmark.page })}
                {...(bookmark.label ? { value: bookmark.label } : {})}
                onPress={() =>
                  router.push({
                    pathname: '/documents/[id]/read',
                    params: { id: bookmark.documentId, page: String(bookmark.page) },
                  })
                }
              />
            ))}
        </Section>
      ))}
    </Screen>
  );
}
