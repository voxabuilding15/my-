import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useErrorMessage } from '@/core/i18n/error-message';
import { useStyles, type Theme } from '@/core/theme';
import {
  AppText,
  BottomSheet,
  Button,
  Chip,
  FormMessage,
  TextField,
  useSnackbar,
} from '@/shared/ui';

import { REPORT_REASONS, type AnswerReport, type ReportReason } from '../../domain/ai-tools';
import { useReportAnswer } from '../hooks/use-ai-tool';

type Props = { target: Pick<AnswerReport, 'targetType' | 'targetId'> | null; onClose: () => void };

/** "Report this answer": reason + optional details. Staff review it without the reporter's name. */
export function ReportAnswerSheet({ target, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  const snackbar = useSnackbar();
  const toMessage = useErrorMessage();
  const report = useReportAnswer();
  const [reason, setReason] = useState<ReportReason>('incorrect');
  const [details, setDetails] = useState('');

  const close = () => {
    setDetails('');
    setReason('incorrect');
    report.reset();
    onClose();
  };

  return (
    <BottomSheet visible={target !== null} onClose={close} title={t('ai.report.title')}>
      <View style={styles.body}>
        <AppText color="textSecondary">{t('ai.report.subtitle')}</AppText>
        <View style={styles.reasons} accessibilityRole="radiogroup">
          {REPORT_REASONS.map((key) => (
            <Chip
              key={key}
              testID={`report-reason-${key}`}
              label={t(`ai.report.reasons.${key}`)}
              selected={reason === key}
              onPress={() => setReason(key)}
            />
          ))}
        </View>
        <TextField
          label={t('ai.report.details')}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={2000}
        />
        <FormMessage tone="error" message={toMessage(report.error)} />
        <Button
          testID="send-report"
          label={t('ai.report.submit')}
          loading={report.isPending}
          onPress={() =>
            target &&
            report.mutate(
              { ...target, reason, ...(details.trim() ? { details } : {}) },
              {
                onSuccess: () => {
                  close();
                  snackbar(t('ai.report.sent'));
                },
              },
            )
          }
        />
      </View>
    </BottomSheet>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    body: { gap: spacing.md },
    reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  });
