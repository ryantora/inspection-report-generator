import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, Alert, ActionSheetIOS, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getInspection,
  getChecklistEntries,
  getValidationSummary,
  markItemNotApplicable,
  clearChecklistImage,
  saveChecklistImage,
} from '../database/db';
import { getItemById, CHECKLIST_ITEMS } from '../config/checklist';
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
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ completedCount: 0, totalItems: CHECKLIST_ITEMS.length });
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    const [insp, ent, sum] = await Promise.all([
      getInspection(inspectionId),
      getChecklistEntries(inspectionId),
      getValidationSummary(inspectionId),
    ]);
    setInspection(insp);
    setEntries(ent);
    setSummary(sum);
  }, [inspectionId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleCapture = (entry) => {
    navigation.navigate('Capture', {
      inspectionId,
      itemId: entry.item_id,
      itemTitle: entry.item_title,
      busStopCode: inspection?.bus_stop_code,
    });
  };

  const handleUpload = async (entry) => {
    const runPicker = async (fn) => {
      try {
        const uri = await fn(inspectionId);
        if (!uri) return; // user cancelled
        await saveChecklistImage({
          inspectionId,
          itemId: entry.item_id,
          itemTitle: entry.item_title,
          imageUri: uri,
          sourceType: 'upload',
        });
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

  const handleRetake = (entry) => {
    Alert.alert('Replace Image', `Clear the current image for "${entry.item_title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearChecklistImage({ inspectionId, itemId: entry.item_id });
          refresh();
        },
      },
    ]);
  };

  const handleMarkNA = async (entry) => {
    await markItemNotApplicable({ inspectionId, itemId: entry.item_id });
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
        keyExtractor={(e) => String(e.item_id)}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => {
          const config = getItemById(item.item_id);
          return (
            <ChecklistItemCard
              entry={item}
              optional={config?.optional}
              onCapture={() => handleCapture(item)}
              onUpload={() => handleUpload(item)}
              onRetake={() => handleRetake(item)}
              onMarkNA={() => handleMarkNA(item)}
            />
          );
        }}
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
