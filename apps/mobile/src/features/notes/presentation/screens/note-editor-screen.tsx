import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { useStyles, useTheme, type Theme } from '@/core/theme';
import { AppText, IconButton, Screen, useSnackbar } from '@/shared/ui';

import { useNote, useNoteMutations } from '../hooks/use-notes';

const AUTOSAVE_MS = 800;

/** Autosaving editor. New notes get a client-generated id on first save (offline-friendly). */
export function NoteEditorScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const isNew = params.id === 'new';
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const snackbar = useSnackbar();
  const note = useNote(isNew ? null : params.id);
  const { save, remove } = useNoteMutations();

  const [id] = useState(() => (isNew ? Crypto.randomUUID() : params.id));
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [persisted, setPersisted] = useState(!isNew);
  const loaded = useRef(false);

  useEffect(() => {
    if (note.data && !loaded.current) {
      loaded.current = true;
      setTitle(note.data.title);
      setContent(note.data.content);
      setPinned(note.data.isPinned);
    }
  }, [note.data]);

  const persist = () => {
    if (!dirty || (!title.trim() && !content.trim())) return;
    save.mutate(
      { id, title: title.trim(), content, isPinned: pinned },
      { onSuccess: () => setPersisted(true) },
    );
    setDirty(false);
  };

  // Debounced autosave while typing; flushed when leaving the screen.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(persist, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  });
  const latest = useRef(persist);
  useEffect(() => {
    latest.current = persist;
  });
  useEffect(() => () => latest.current(), []);

  const edit =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setDirty(true);
    };

  const confirmDelete = () =>
    Alert.alert(t('notes.deleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          setDirty(false);
          if (persisted) remove.mutate(id, { onSuccess: () => snackbar(t('notes.deleted')) });
          router.back();
        },
      },
    ]);

  return (
    <Screen keyboard edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.actions}>
              {save.isPending || (persisted && !dirty && save.isSuccess) ? (
                <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
                  {t('notes.saved')}
                </AppText>
              ) : null}
              <IconButton
                testID="pin-note"
                icon={pinned ? 'pin' : 'pin-outline'}
                color={pinned ? 'notes' : 'text'}
                accessibilityLabel={pinned ? t('notes.unpin') : t('notes.pin')}
                onPress={() => edit(setPinned)(!pinned)}
              />
              <IconButton
                testID="delete-note"
                icon="delete-outline"
                accessibilityLabel={t('common.delete')}
                onPress={confirmDelete}
              />
            </View>
          ),
        }}
      />
      <TextInput
        testID="note-title"
        value={title}
        onChangeText={edit(setTitle)}
        placeholder={t('notes.titlePlaceholder')}
        placeholderTextColor={colors.textDisabled}
        accessibilityLabel={t('notes.titlePlaceholder')}
        style={styles.title}
        maxLength={200}
        autoFocus={isNew}
      />
      <TextInput
        testID="note-content"
        value={content}
        onChangeText={edit(setContent)}
        placeholder={t('notes.bodyPlaceholder')}
        placeholderTextColor={colors.textDisabled}
        accessibilityLabel={t('notes.bodyPlaceholder')}
        style={styles.body}
        multiline
        scrollEnabled={false}
      />
    </Screen>
  );
}

const makeStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    actions: { flexDirection: 'row', alignItems: 'center' },
    title: { ...typography.title, color: colors.text, textAlign: 'auto', padding: 0 },
    body: {
      ...typography.body,
      color: colors.text,
      minHeight: 300,
      textAlignVertical: 'top',
      textAlign: 'auto',
      padding: 0,
    },
  });
