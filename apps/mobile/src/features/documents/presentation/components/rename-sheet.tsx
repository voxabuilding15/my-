import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BottomSheet, Button, TextField } from '@/shared/ui';

type Props = {
  visible: boolean;
  initialTitle: string;
  onClose: () => void;
  onSubmit: (title: string) => void;
  title: string;
};

function RenameForm({ initialTitle, onClose, onSubmit }: Omit<Props, 'visible' | 'title'>) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialTitle);
  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 200;
  return (
    <>
      <TextField
        testID="rename-input"
        label={t('common.rename')}
        value={value}
        onChangeText={setValue}
        maxLength={200}
        autoFocus
      />
      <Button
        testID="rename-save"
        label={t('common.save')}
        disabled={!valid}
        onPress={() => {
          onSubmit(trimmed);
          onClose();
        }}
      />
    </>
  );
}

export function RenameSheet({ visible, initialTitle, onClose, onSubmit, title }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {/* Remounted per document so the field starts from the current title. */}
      <RenameForm
        key={initialTitle}
        initialTitle={initialTitle}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </BottomSheet>
  );
}
