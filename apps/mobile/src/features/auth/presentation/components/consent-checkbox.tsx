import { Trans, useTranslation } from 'react-i18next';

import { openLegalPage, useLegalLinks } from '@/core/legal/legal-links';
import { AppText, Checkbox } from '@/shared/ui';

/** Age (13+) confirmation and acceptance of the Terms and Privacy Policy, with tappable links. */
export function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const links = useLegalLinks();
  return (
    <Checkbox
      testID="consent"
      checked={checked}
      onChange={onChange}
      accessibilityLabel={t('auth.signUp.consent').replace(/<\/?\w+>/g, '')}
    >
      <AppText variant="caption" color="textSecondary">
        <Trans
          i18nKey="auth.signUp.consent"
          components={{
            terms: (
              <AppText
                variant="caption"
                color="primaryText"
                onPress={() => openLegalPage(links.termsUrl)}
              />
            ),
            privacy: (
              <AppText
                variant="caption"
                color="primaryText"
                onPress={() => openLegalPage(links.privacyUrl)}
              />
            ),
          }}
        />
      </AppText>
    </Checkbox>
  );
}
