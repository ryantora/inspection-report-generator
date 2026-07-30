import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Alert, ActionSheetIOS, Platform } from 'react-native';
// The core RN SafeAreaView is effectively a no-op on Android (it only
// really applies insets on iOS) — this version computes real device
// insets cross-platform, including Android's navigation/gesture bar,
// which matters now that Expo SDK 54+ defaults to edge-to-edge rendering.
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  getInspection,
  getCombinedOrderedEntries,
  getValidationSummary,
  clearChecklistImage,
  saveChecklistImage,
  saveDomeCameraImage,
  clearDomeCameraImage,
  addDomeCamera,
} from '../database/db';
import { pickFromGallery, pickFromFiles } from '../services/uploadService';
import { generateReport, ValidationError } from '../services/reportService';
import { useTheme } from '../theme/ThemeContext';
import ProgressBar from '../components/ProgressBar';
import ChecklistItemCard from '../components/ChecklistItemCard';
import BigButton from '../components/BigButton';

export default function ChecklistScreen({ route, navigation }) {
  const { inspectionId } = route.params;
  const theme = useTheme();
  const [inspection, setInspection] = useState(null);
  // Combined, ordered, sequentially-numbered list: static checklist items
  // (ids <=16, then >=21) with the dynamic Dome Camera sections spliced in
  // between — see db.js:getCombinedOrderedEntries.
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ completedCount: 0, totalItems: 0 });
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    const [insp, combined, sum] = await Promise.all([
      getInspection(inspectionId),
      getCombinedOrderedEntries(inspectionId),
      getValidationSummary(inspectionId),
    ]);
    setInspection(insp);
    setEntries(combined);
    setSummary(sum);
  }, [inspectionId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleCapture = (item) => {
    navigation.navigate('Capture', {
      inspectionId,
      itemId: item.item_id,
      itemTitle: item.item_title,
      busStopCode: inspection?.bus_stop_code,
      // Tells CropScreen which table to save into once the photo is
      // finalized — a static checklist item, or a dynamically added
      // Dome Camera section.
      target: item.kind === 'camera' ? 'camera' : 'static',
      cameraNumber: item.kind === 'camera' ? item.camera_number : undefined,
    });
  };

  const handleUpload = async (item) => {
    const runPicker = async (fn) => {
      try {
        const uri = await fn(inspectionId);
        if (!uri) return; // user cancelled
        if (item.kind === 'camera') {
          await saveDomeCameraImage({
            inspectionId,
            cameraNumber: item.camera_number,
            imageUri: uri,
            sourceType: 'upload',
          });
        } else {
          await saveChecklistImage({
            inspectionId,
            itemId: item.item_id,
            itemTitle: item.item_title,
            imageUri: uri,
            sourceType: 'upload',
          });
        }
        refresh();
      } catch (err) {
        Alert.alert('Upload failed', err.message);
      }
    };

    if (Platform.OS === 'ios' && ActionSheetIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Choose from Gallery', 'Choose from Files'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) runPicker(pickFromGallery);
          if (index === 2) runPicker(pickFromFiles);
        }
      );
    } else {
      Alert.alert('Upload Screenshot', 'Choose a source', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Gallery', onPress: () => runPicker(pickFromGallery) },
        { text: 'Files', onPress: () => runPicker(pickFromFiles) },
      ]);
    }
  };

  const handleRetake = (item) => {
    Alert.alert('Replace Image', `Clear the current image for "${item.item_title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          if (item.kind === 'camera') {
            await clearDomeCameraImage({ inspectionId, cameraNumber: item.camera_number });
          } else {
            await clearChecklistImage({ inspectionId, itemId: item.item_id });
          }
          refresh();
        },
      },
    ]);
  };

  const handleAddCamera = async () => {
    await addDomeCamera(inspectionId);
    refresh();
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    try {
      const result = await generateReport(inspectionId);
      navigation.navigate('ReportPreview', { inspectionId, ...result });
    } catch (err) {
      if (err instanceof ValidationError) {
        Alert.alert(
          'Missing Required Items',
          `Please complete the following before generating the report:\n\n${err.missingTitles
            .map((t) => `• ${t}`)
            .join('\n')}`
        );
      } else {
        Alert.alert('Report generation failed', err.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: theme.text }]}>
          Bus Stop {inspection?.bus_stop_code}
        </Text>
        <Text style={[styles.subtitle, { color: theme.subtext }]}>
          {inspection?.inspector_name} · {inspection?.inspection_date}
        </Text>
        <ProgressBar completed={summary.completedCount} total={summary.totalItems} />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => `${e.kind}-${e.item_id}`}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <ChecklistItemCard
            entry={item}
            displayNumber={item.displayNumber}
            optional={false}
            onCapture={() => handleCapture(item)}
            onUpload={() => handleUpload(item)}
            onRetake={() => handleRetake(item)}
            onMarkNA={() => {}}
            onPressImage={() =>
              item.image_uri &&
              navigation.navigate('ImageViewer', {
                imageUri: item.image_uri,
                title: `${item.displayNumber}. ${item.item_title}`,
              })
            }
            showAddCamera={item.kind === 'camera' && item.isLastCamera}
            onAddCamera={handleAddCamera}
          />
        )}
      />

      <BigButton
        title="Generate Report"
        icon="📄"
        onPress={handleGenerateReport}
        loading={generating}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  headerBlock: { marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
});
