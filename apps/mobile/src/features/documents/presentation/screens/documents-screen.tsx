import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLayout } from '@/core/layout/use-layout';
import { useStyles, type Theme } from '@/core/theme';
import {
  ActionSheet,
  Chip,
  EmptyState,
  Fab,
  IconButton,
  ScreenHeader,
  SearchBar,
  Skeleton,
  useSnackbar,
} from '@/shared/ui';

import {
  filterDocuments,
  type DocumentFilter,
  type DocumentSort,
  type DocumentSummary,
} from '../../domain/document';
import { AddDocumentSheet } from '../components/add-document-sheet';
import { DocumentCard } from '../components/document-card';
import { RenameSheet } from '../components/rename-sheet';
import { useDocumentMutations, useDocuments } from '../hooks/use-documents';

const FILTERS: DocumentFilter[] = ['all', 'favorites', 'pdf', 'docx', 'txt', 'image'];
const SORTS: DocumentSort[] = ['recent', 'name', 'size'];

export function DocumentsScreen() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const snackbar = useSnackbar();
  const { contentMaxWidth, columns } = useLayout();
  const params = useLocalSearchParams<{ add?: string }>();
  const documents = useDocuments();
  const { setFavorite, rename, remove } = useDocumentMutations();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DocumentFilter>('all');
  const [sort, setSort] = useState<DocumentSort>('recent');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<DocumentSummary | null>(null);
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null);

  // Deep links from Home quick actions (?add=…) open the sheet; closing clears the parameter.
  const addSheetOpen = adding || Boolean(params.add);
  const closeAddSheet = () => {
    setAdding(false);
    if (params.add) router.setParams({ add: undefined });
  };

  const visible = useMemo(
    () => filterDocuments(documents.data ?? [], { query, filter, sort }),
    [documents.data, query, filter, sort],
  );

  const confirmDelete = (document: DocumentSummary) =>
    Alert.alert(t('documents.deleteTitle'), t('documents.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(document.id, { onSuccess: () => snackbar(t('documents.deleted')) }),
      },
    ]);

  const header = (
    <View style={styles.header}>
      <ScreenHeader
        title={t('documents.title')}
        actions={
          <IconButton
            testID="sort"
            icon="sort"
            accessibilityLabel={`${t('documents.sort.label')}: ${t(`documents.sort.${sort}`)}`}
            onPress={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length] ?? 'recent')}
          />
        }
      />
      <SearchBar
        testID="document-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('documents.searchPlaceholder')}
        clearLabel={t('common.clear')}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {FILTERS.map((value) => (
          <Chip
            key={value}
            testID={`filter-${value}`}
            label={t(`documents.filters.${value}`)}
            selected={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={[styles.body, { maxWidth: contentMaxWidth }]}>
        {documents.isPending ? (
          <View style={styles.padded}>
            {header}
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={76} radius={16} />
            ))}
          </View>
        ) : (
          <FlashList
            data={visible}
            key={columns}
            numColumns={columns > 1 ? 2 : 1}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={header}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <DocumentCard document={item} onMore={setSelected} />
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                {documents.data?.length ? (
                  <EmptyState icon="file-search-outline" title={t('documents.noResults')} />
                ) : (
                  <EmptyState
                    icon="bookshelf"
                    title={t('documents.emptyTitle')}
                    message={t('documents.empty')}
                  />
                )}
              </View>
            }
          />
        )}
      </View>

      <Fab
        testID="add-document"
        icon="plus"
        label={t('documents.add')}
        onPress={() => setAdding(true)}
      />
      <AddDocumentSheet visible={addSheetOpen} onClose={closeAddSheet} />
      <ActionSheet
        visible={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title}
        actions={
          selected
            ? [
                {
                  key: 'favorite',
                  icon: selected.isFavorite ? 'star-off-outline' : 'star-outline',
                  label: selected.isFavorite ? t('documents.unfavorite') : t('documents.favorite'),
                  onPress: () =>
                    setFavorite.mutate({ id: selected.id, favorite: !selected.isFavorite }),
                },
                {
                  key: 'rename',
                  icon: 'pencil-outline',
                  label: t('common.rename'),
                  onPress: () => setRenaming(selected),
                },
                {
                  key: 'delete',
                  icon: 'delete-outline',
                  label: t('common.delete'),
                  destructive: true,
                  onPress: () => confirmDelete(selected),
                },
              ]
            : []
        }
      />
      <RenameSheet
        visible={renaming !== null}
        title={t('documents.renameTitle')}
        initialTitle={renaming?.title ?? ''}
        onClose={() => setRenaming(null)}
        onSubmit={(title) => renaming && rename.mutate({ id: renaming.id, title })}
      />
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, spacing }: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    body: { flex: 1, width: '100%', alignSelf: 'center' },
    padded: { padding: spacing.lg, gap: spacing.md },
    header: { gap: spacing.md, paddingBottom: spacing.md },
    chips: { gap: spacing.sm },
    list: { padding: spacing.lg, paddingBottom: 120 },
    item: { paddingBottom: spacing.sm, paddingHorizontal: spacing.xs },
    empty: { paddingTop: spacing.xxxl },
  });
