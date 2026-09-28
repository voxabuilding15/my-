import { SUPPORTED_MIME_TYPES } from '@studexa/shared';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';

import { useErrorMessage } from '@/core/i18n/error-message';
import { ActionSheet, useSnackbar } from '@/shared/ui';

import type { UploadInput } from '../../domain/document';
import { useDocumentMutations } from '../hooks/use-documents';

const FILE_TYPES = SUPPORTED_MIME_TYPES.filter((type) => !type.startsWith('image/'));

type Props = { visible: boolean; onClose: () => void };

/** Upload from files, camera or gallery. The pickers return local files; upload goes through the repository. */
export function AddDocumentSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const toMessage = useErrorMessage();
  const { upload } = useDocumentMutations();

  const submit = (input: UploadInput) => {
    snackbar(t('documents.uploading'));
    upload.mutate(input, {
      onSuccess: () => snackbar(t('documents.uploaded')),
      onError: (error) => snackbar(toMessage(error) ?? ''),
    });
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: FILE_TYPES,
      copyToCacheDirectory: true,
    });
    const file = result.assets?.[0];
    if (result.canceled || !file) return;
    submit({
      name: file.name,
      mimeType: file.mimeType ?? 'application/octet-stream',
      sizeBytes: file.size ?? 0,
      uri: file.uri,
      source: 'file',
    });
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        snackbar(t('documents.cameraDenied'));
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.85 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const image = result.assets?.[0];
    if (result.canceled || !image) return;
    submit({
      name: image.fileName ?? `scan-${new Date().toISOString().slice(0, 10)}.jpg`,
      mimeType: image.mimeType ?? 'image/jpeg',
      sizeBytes: image.fileSize ?? 0,
      uri: image.uri,
      source,
    });
  };

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={t('documents.addTitle')}
      actions={[
        {
          key: 'file',
          icon: 'file-upload-outline',
          label: t('documents.uploadFile'),
          onPress: pickFile,
        },
        {
          key: 'camera',
          icon: 'camera-outline',
          label: t('documents.takePhoto'),
          onPress: () => pickImage('camera'),
        },
        {
          key: 'gallery',
          icon: 'image-multiple-outline',
          label: t('documents.fromGallery'),
          onPress: () => pickImage('gallery'),
        },
      ]}
    />
  );
}
