import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useStyles, type Theme } from '@/core/theme';
import { AppText } from '@/shared/ui';

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/logo.png')}
        style={styles.logo}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {subtitle ? <AppText color="textSecondary">{subtitle}</AppText> : null}
    </View>
  );
}

const makeStyles = ({ spacing }: Theme) =>
  StyleSheet.create({
    container: { gap: spacing.sm, marginBottom: spacing.sm },
    logo: { width: 44, height: 44, marginBottom: spacing.sm },
  });
