import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText, Icon, PressableScale } from '@/shared/ui';

type Props = { label: string; selected: boolean; onPress: () => void; testID?: string };

export function AnswerOption({ label, selected, onPress, testID }: Props) {
  const styles = useStyles(makeStyles);
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.option, selected && styles.selected]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Icon name="check" size={14} color="onPrimary" /> : null}
      </View>
      <AppText style={styles.label}>{label}</AppText>
    </PressableScale>
  );
}

const makeStyles = ({ colors, radii, spacing }: Theme) =>
  StyleSheet.create({
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      padding: spacing.lg,
      borderRadius: radii.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    selected: { borderColor: colors.quizzes, backgroundColor: colors.quizzesSubtle },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioSelected: { backgroundColor: colors.quizzes, borderColor: colors.quizzes },
    label: { flex: 1 },
  });
