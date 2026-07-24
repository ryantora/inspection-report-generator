/**
 * uploadService.js
 * -------------------------------------------------------------------------
 * Handles "Upload Screenshot" — gallery picker + generic file picker.
 * Accepted formats: JPG, JPEG, PNG. Files are copied as-is into the app's
 * document storage under the inspection's folder; NO renaming, resizing,
 * or re-encoding is performed (per spec: "no renaming required").
 */
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
// SDK 54+: the default 'expo-file-system' export is the new File/Directory
// API and no longer has EncodingType/readAsStringAsync/etc. This file uses
// the classic functional API, which now lives at 'expo-file-system/legacy'.
import * as FileSystem from 'expo-file-system/legacy';

const ACCEPTED_EXT = ['jpg', 'jpeg', 'png'];

function extOf(uriOrName) {
  const clean = uriOrName.split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

async function copyIntoInspectionFolder(sourceUri, inspectionId, originalName) {
  const dir = `${FileSystem.documentDirectory}inspections/${inspectionId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${Date.now()}_${originalName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

/** Opens the device gallery and returns a local file:// URI, or null if cancelled. */
export async function pickFromGallery(inspectionId) {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Gallery permission was not granted.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    exif: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const ext = extOf(asset.fileName || asset.uri);
  if (ext && !ACCEPTED_EXT.includes(ext)) {
    throw new Error(`Unsupported file type ".${ext}". Please choose a JPG or PNG.`);
  }

  const originalName = asset.fileName || `screenshot.${ext || 'jpg'}`;
  return copyIntoInspectionFolder(asset.uri, inspectionId, originalName);
}

/** Opens the system file picker (restricted to image types) and returns a local file:// URI. */
export async function pickFromFiles(inspectionId) {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/jpeg', 'image/png'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const ext = extOf(asset.name);
  if (!ACCEPTED_EXT.includes(ext)) {
    throw new Error(`Unsupported file type ".${ext}". Please choose a JPG or PNG.`);
  }

  return copyIntoInspectionFolder(asset.uri, inspectionId, asset.name);
}
