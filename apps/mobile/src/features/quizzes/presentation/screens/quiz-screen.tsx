import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useErrorMessage } from '@/core/i18n/error-message';
import { formatDuration } from '@/core/i18n/format';
import { duration, useStyles, type Theme } from '@/core/theme';
import { useLogStudyTime } from '@/features/home';
import {
  AppText,
  Button,
  Card,
  FormMessage,
  Icon,
  ProgressBar,
  ProgressRing,
  Screen,
  Skeleton,
  TextField,
} from '@/shared/ui';

import type { QuizResult } from '../../domain/quiz';
import { AnswerOption } from '../components/answer-option';
import { useQuiz, useSubmitQuiz } from '../hooks/use-quizzes';

type Phase = 'intro' | 'playing' | 'result';

export function QuizScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const toMessage = useErrorMessage();
  const quiz = useQuiz(id);
  const submit = useSubmitQuiz(id);
  const logStudyTime = useLogStudyTime();
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const data = quiz.data;
  const question = data?.questions[index];
  const limit = data?.timeLimitSeconds ?? null;
  const remaining = limit !== null ? Math.max(0, limit - elapsed) : null;

  const finish = () => {
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    submit.mutate(
      { answers, elapsedSeconds: seconds },
      {
        onSuccess: (graded) => {
          setResult(graded);
          setPhase('result');
          logStudyTime(seconds);
        },
      },
    );
  };

  // Countdown for timed quizzes; submits automatically at zero.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === 'playing' && remaining === 0 && !submit.isPending) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when time runs out
  }, [remaining, phase]);

  if (!data) {
    return (
      <Screen edges={['bottom']}>
        {quiz.isError ? (
          <FormMessage tone="error" message={toMessage(quiz.error)} />
        ) : (
          <Skeleton height={240} radius={16} />
        )}
      </Screen>
    );
  }

  if (phase === 'intro') {
    return (
      <Screen edges={['bottom']} contentStyle={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.introIcon}>
          <Icon name="head-question-outline" size={48} color="quizzes" />
        </View>
        <AppText variant="title" align="center" accessibilityRole="header">
          {data.title}
        </AppText>
        <AppText color="textSecondary" align="center">
          {[
            t('quiz.questionCount', { count: data.questions.length }),
            limit ? t('quiz.timeLimit', { minutes: Math.round(limit / 60) }) : t('quiz.untimed'),
          ].join(' · ')}
        </AppText>
        <Button
          testID="start-quiz"
          label={t('quiz.start')}
          onPress={() => {
            startedAt.current = Date.now();
            setElapsed(0);
            setPhase('playing');
          }}
        />
      </Screen>
    );
  }

  if (phase === 'result' && result) {
    const percent = Math.round((result.score / result.maxScore) * 100);
    return (
      <Screen scroll edges={['bottom']}>
        <Stack.Screen options={{ title: t('quiz.resultTitle') }} />
        <Animated.View entering={FadeIn.duration(duration.long)} style={styles.resultHeader}>
          {result.timedOut ? <FormMessage tone="info" message={t('quiz.timeUp')} /> : null}
          <ProgressRing
            progress={percent / 100}
            size={140}
            stroke={12}
            color={percent >= 70 ? 'success' : 'quizzes'}
            accessibilityLabel={`${percent}%`}
          >
            <AppText variant="display" testID="quiz-score">
              {percent}%
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {result.score} / {result.maxScore}
            </AppText>
          </ProgressRing>
          <AppText variant="heading" align="center">
            {percent === 100
              ? t('quiz.perfect')
              : percent >= 70
                ? t('quiz.goodJob')
                : t('quiz.keepGoing')}
          </AppText>
        </Animated.View>
        <AppText variant="heading" accessibilityRole="header">
          {t('quiz.review')}
        </AppText>
        {data.questions.map((q, i) => {
          const graded = result.answers.find((a) => a.questionId === q.id);
          const status =
            graded?.correct === true
              ? 'correct'
              : graded?.correct === null
                ? 'toCheck'
                : 'incorrect';
          return (
            <Card key={q.id} variant="outlined" testID={`review-${q.id}`}>
              <View style={styles.row}>
                <Icon
                  name={
                    status === 'correct'
                      ? 'check-circle'
                      : status === 'toCheck'
                        ? 'help-circle'
                        : 'close-circle'
                  }
                  color={
                    status === 'correct' ? 'success' : status === 'toCheck' ? 'warning' : 'danger'
                  }
                />
                <AppText
                  variant="label"
                  color={
                    status === 'correct' ? 'success' : status === 'toCheck' ? 'warning' : 'danger'
                  }
                >
                  {t(`quiz.${status}`)}
                </AppText>
              </View>
              <AppText variant="bodyStrong">
                {i + 1}. {q.prompt}
              </AppText>
              <AppText color="textSecondary">
                {t('quiz.yourAnswer', { answer: displayAnswer(graded?.answer, t) })}
              </AppText>
              {status !== 'correct' ? (
                <AppText>
                  {t('quiz.correctAnswer', { answer: displayAnswer(q.correctAnswer, t) })}
                </AppText>
              ) : null}
              {q.explanation ? (
                <AppText variant="caption" color="textSecondary">
                  {q.explanation}
                </AppText>
              ) : null}
              {q.sourcePage ? (
                <AppText variant="caption" color="primaryText">
                  {t('quiz.source', { page: q.sourcePage })}
                </AppText>
              ) : null}
            </Card>
          );
        })}
        <Button
          variant="secondary"
          label={t('quiz.retry')}
          onPress={() => {
            setAnswers({});
            setIndex(0);
            setResult(null);
            setPhase('intro');
          }}
        />
        <Button testID="quiz-done" label={t('common.done')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const total = data.questions.length;
  const answer = question ? (answers[question.id] ?? '') : '';
  const setAnswer = (value: string) =>
    question && setAnswers((current) => ({ ...current, [question.id]: value }));
  const last = index === total - 1;

  return (
    <Screen keyboard edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('quiz.questionOf', { current: index + 1, total }),
          headerRight: () =>
            remaining !== null ? (
              <View
                style={[styles.timer, remaining <= 30 && styles.timerLow]}
                accessibilityLabel={t('quiz.timeLeft', { time: formatDuration(remaining) })}
              >
                <Icon name="timer-outline" size={18} color={remaining <= 30 ? 'danger' : 'text'} />
                <AppText
                  variant="bodyStrong"
                  color={remaining <= 30 ? 'danger' : 'text'}
                  testID="quiz-timer"
                >
                  {formatDuration(remaining)}
                </AppText>
              </View>
            ) : null,
        }}
      />
      <ProgressBar progress={(index + 1) / total} color="quizzes" />
      {question ? (
        <Animated.View
          key={question.id}
          entering={FadeIn.duration(duration.medium)}
          style={styles.question}
        >
          <AppText variant="heading" accessibilityRole="header" testID="quiz-prompt">
            {question.prompt}
          </AppText>
          {question.type === 'multiple_choice'
            ? question.choices?.map((choice, i) => (
                <AnswerOption
                  key={choice}
                  testID={`choice-${i}`}
                  label={choice}
                  selected={answer === choice}
                  onPress={() => setAnswer(choice)}
                />
              ))
            : null}
          {question.type === 'true_false' ? (
            <View style={styles.trueFalse}>
              <View style={styles.fill}>
                <AnswerOption
                  testID="choice-true"
                  label={t('quiz.trueLabel')}
                  selected={answer === 'true'}
                  onPress={() => setAnswer('true')}
                />
              </View>
              <View style={styles.fill}>
                <AnswerOption
                  testID="choice-false"
                  label={t('quiz.falseLabel')}
                  selected={answer === 'false'}
                  onPress={() => setAnswer('false')}
                />
              </View>
            </View>
          ) : null}
          {question.type === 'short_answer' ? (
            <TextField
              testID="short-answer"
              label={t('quiz.answerPlaceholder')}
              value={answer}
              onChangeText={setAnswer}
              maxLength={2000}
            />
          ) : null}
        </Animated.View>
      ) : null}
      <FormMessage tone="error" message={toMessage(submit.error)} />
      <Button
        testID={last ? 'finish-quiz' : 'next-question'}
        label={last ? t('quiz.finish') : t('quiz.next')}
        disabled={!answer.trim()}
        loading={submit.isPending}
        onPress={() => (last ? finish() : setIndex(index + 1))}
      />
    </Screen>
  );
}

function displayAnswer(
  answer: string | undefined,
  t: (key: 'quiz.trueLabel' | 'quiz.falseLabel' | 'quiz.noAnswer') => string,
): string {
  if (!answer) return t('quiz.noAnswer');
  if (answer === 'true') return t('quiz.trueLabel');
  if (answer === 'false') return t('quiz.falseLabel');
  return answer;
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    center: { justifyContent: 'center', alignItems: 'stretch' },
    introIcon: {
      alignSelf: 'center',
      width: 96,
      height: 96,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.quizzesSubtle,
    },
    resultHeader: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.lg },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    question: { gap: spacing.md },
    trueFalse: { flexDirection: 'row', gap: spacing.sm },
    fill: { flex: 1 },
    timer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceContainer,
      marginEnd: spacing.sm,
    },
    timerLow: { backgroundColor: colors.dangerSubtle },
  });
