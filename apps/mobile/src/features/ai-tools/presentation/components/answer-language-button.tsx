import type { AppLocale } from '@studexa/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAnswerLanguage } from '@/core/ai';
import { ActionSheet, IconButton } from '@/shared/ui';

/** Language names are shown in their own language, so they are recognisable in any UI language. */
const NATIVE_NAMES: Record<AppLocale, string> = { en: 'English', fr: 'Français', ar: 'العربية' };

/** Header button to switch the language AI answers are written in. */
export function AnswerLanguageButton() {
  const { t } = useTranslation();
  const [language, setLanguage] = useAnswerLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        testID="answer-language"
        icon="translate"
        accessibilityLabel={`${t('ai.answerIn')}: ${NATIVE_NAMES[language]}`}
        onPress={() => setOpen(true)}
      />
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('ai.answerIn')}
        actions={(Object.keys(NATIVE_NAMES) as AppLocale[]).map((code) => ({
          key: code,
          icon: code === language ? 'check' : 'translate',
          label: NATIVE_NAMES[code],
          onPress: () => setLanguage(code),
        }))}
      />
    </>
  );
}
