import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, Appear, Button, Card, EmptyState, Icon, Skeleton } from '@/shared/ui';

import { useDecks } from '../hooks/use-flashcards';

export function DeckList() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const decks = useDecks();
  const due = decks.data?.reduce((sum, deck) => sum + deck.dueCount + deck.newCount, 0) ?? 0;

  if (decks.isPending) return <Skeleton height={120} radius={16} />;
  if (!decks.data?.length) return <EmptyState icon="cards-outline" title={t('flashcards.empty')} />;

  return (
    <View style={styles.list}>
      {due > 0 ? (
        <Button
          testID="review-all"
          label={`${t('flashcards.reviewAll')} · ${due}`}
          icon={<Icon name="play" size={20} color="onPrimary" />}
          onPress={() => router.push('/flashcards/review')}
        />
      ) : null}
      {decks.data.map((deck, index) => {
        const pending = deck.dueCount + deck.newCount;
        return (
          <Appear key={deck.id} index={index}>
            <Card
              testID={`deck-${deck.id}`}
              variant="outlined"
              accessibilityLabel={deck.title}
              onPress={() =>
                router.push({ pathname: '/flashcards/review', params: { deckId: deck.id } })
              }
            >
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Icon name="cards-outline" color="flashcards" />
                </View>
                <View style={styles.fill}>
                  <AppText variant="bodyStrong" numberOfLines={2}>
                    {deck.title}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">
                    {t('flashcards.cardCount', { count: deck.cardCount })}
                  </AppText>
                </View>
                {pending > 0 ? (
                  <View style={styles.badges}>
                    {deck.dueCount > 0 ? (
                      <AppText variant="label" color="flashcards">
                        {t('flashcards.dueCount', { count: deck.dueCount })}
                      </AppText>
                    ) : null}
                    {deck.newCount > 0 ? (
                      <AppText variant="label" color="primaryText">
                        {t('flashcards.newCount', { count: deck.newCount })}
                      </AppText>
                    ) : null}
                  </View>
                ) : (
                  <Icon name="check-circle" color="success" />
                )}
              </View>
            </Card>
          </Appear>
        );
      })}
    </View>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    list: { gap: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    fill: { flex: 1, gap: 2 },
    icon: {
      width: 44,
      height: 44,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.flashcardsSubtle,
    },
    badges: { alignItems: 'flex-end', gap: 2 },
  });
