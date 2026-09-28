import type { DocumentKind } from '@studexa/shared';
import { StyleSheet, View } from 'react-native';

import { useStyles, type ColorTokens, type Theme } from '@/core/theme';
import { Icon, type IconName } from '@/shared/ui';

const KIND: Record<
  DocumentKind,
  { icon: IconName; color: keyof ColorTokens; surface: keyof ColorTokens }
> = {
  pdf: { icon: 'file-pdf-box', color: 'danger', surface: 'dangerSubtle' },
  docx: { icon: 'file-word-box', color: 'chat', surface: 'chatSubtle' },
  txt: { icon: 'file-document-outline', color: 'textSecondary', surface: 'surfaceContainer' },
  image: { icon: 'image-text', color: 'quizzes', surface: 'quizzesSubtle' },
};

export function DocumentKindIcon({ kind, size = 48 }: { kind: DocumentKind; size?: number }) {
  const styles = useStyles(makeStyles);
  const spec = KIND[kind];
  return (
    <View
      style={[
        styles.box,
        styles[spec.surface as 'surfaceContainer'],
        { width: size, height: size },
      ]}
    >
      <Icon name={spec.icon} size={size * 0.55} color={spec.color} />
    </View>
  );
}

const makeStyles = ({ colors, radii }: Theme) =>
  StyleSheet.create({
    box: { borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    dangerSubtle: { backgroundColor: colors.dangerSubtle },
    chatSubtle: { backgroundColor: colors.chatSubtle },
    surfaceContainer: { backgroundColor: colors.surfaceContainer },
    quizzesSubtle: { backgroundColor: colors.quizzesSubtle },
  });
