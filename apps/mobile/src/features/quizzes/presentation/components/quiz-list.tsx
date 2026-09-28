import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, Appear, Card, EmptyState, Icon, Skeleton } from '@/shared/ui';

import { useQuizzes } from '../hooks/use-quizzes';

export function QuizList() {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const quizzes = useQuizzes();
  if (quizzes.isPending) return <Skeleton height={120} radius={16} />;
  if (!quizzes.data?.length)
    return <EmptyState icon="head-question-outline" title={t('quiz.empty')} />;
  return (
    <View style={styles.list}>
      {quizzes.data.map((quiz, index) => (
        <Appear key={quiz.id} index={index}>
          <Card
            testID={`quiz-${quiz.id}`}
            variant="outlined"
            accessibilityLabel={quiz.title}
            onPress={() => router.push({ pathname: '/quizzes/[id]', params: { id: quiz.id } })}
          >
            <View style={styles.row}>
              <View style={styles.icon}>
                <Icon name="head-question-outline" color="quizzes" />
              </View>
              <View style={styles.fill}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {quiz.title}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {[
                    t('quiz.questionCount', { count: quiz.questionCount }),
                    quiz.timeLimitSeconds
                      ? t('quiz.timeLimit', { minutes: Math.round(quiz.timeLimitSeconds / 60) })
                      : t('quiz.untimed'),
                  ].join(' · ')}
                </AppText>
              </View>
              {quiz.bestScore !== null ? (
                <AppText variant="bodyStrong" color="quizzes">
                  {t('quiz.best', { score: quiz.bestScore })}
                </AppText>
              ) : null}
            </View>
          </Card>
        </Appear>
      ))}
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
      backgroundColor: colors.quizzesSubtle,
    },
  });
