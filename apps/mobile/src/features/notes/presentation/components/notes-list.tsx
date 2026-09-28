import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { formatRelative } from '@/core/i18n/format';
import { useStyles, type Theme } from '@/core/theme';
import { AppText, Appear, Button, Card, EmptyState, Icon, SearchBar, Skeleton } from '@/shared/ui';

import { sortAndFilterNotes, type Note } from '../../domain/note';
import { useNotes } from '../hooks/use-notes';

function NoteCard({ note, index }: { note: Note; index: number }) {
  const { t, i18n } = useTranslation();
  const styles = useStyles(makeStyles);
  const preview = note.content
    .replace(/[#*_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    <Appear index={index}>
      <Card
        testID={`note-${note.id}`}
        variant="outlined"
        onPress={() => router.push({ pathname: '/notes/[id]', params: { id: note.id } })}
        accessibilityLabel={note.title || t('notes.untitled')}
      >
        <View style={styles.row}>
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.fill}>
            {note.title || t('notes.untitled')}
          </AppText>
          {note.isPinned ? <Icon name="pin" size={16} color="notes" /> : null}
          {note.source === 'ai' ? (
            <View style={styles.aiBadge}>
              <AppText variant="label" color="primaryText">
                {t('notes.fromAi')}
              </AppText>
            </View>
          ) : null}
        </View>
        {preview ? (
          <AppText color="textSecondary" numberOfLines={2}>
            {preview}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textSecondary">
          {formatRelative(note.updatedAt, i18n.language)}
        </AppText>
      </Card>
    </Appear>
  );
}

export function NotesList() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const notes = useNotes();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => sortAndFilterNotes(notes.data ?? [], query), [notes.data, query]);
  const pinned = visible.filter((n) => n.isPinned);
  const others = visible.filter((n) => !n.isPinned);

  return (
    <View style={styles.list}>
      <Button
        testID="new-note"
        label={t('notes.new')}
        icon={<Icon name="plus" size={20} color="onPrimary" />}
        onPress={() => router.push({ pathname: '/notes/[id]', params: { id: 'new' } })}
      />
      <SearchBar
        testID="note-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('notes.searchPlaceholder')}
        clearLabel={t('common.clear')}
      />
      {notes.isPending ? <Skeleton height={96} radius={16} /> : null}
      {notes.data && visible.length === 0 ? (
        <EmptyState icon="note-text-outline" title={t('notes.empty')} />
      ) : null}
      {pinned.length > 0 ? (
        <AppText variant="label" color="textSecondary">
          {t('notes.pinned').toUpperCase()}
        </AppText>
      ) : null}
      {pinned.map((note, i) => (
        <NoteCard key={note.id} note={note} index={i} />
      ))}
      {pinned.length > 0 && others.length > 0 ? (
        <AppText variant="label" color="textSecondary">
          {t('notes.others').toUpperCase()}
        </AppText>
      ) : null}
      {others.map((note, i) => (
        <NoteCard key={note.id} note={note} index={pinned.length + i} />
      ))}
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    list: { gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fill: { flex: 1 },
    aiBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radii.sm,
      backgroundColor: colors.primarySubtle,
    },
  });
