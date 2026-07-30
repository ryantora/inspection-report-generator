import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
// The core RN SafeAreaView is effectively a no-op on Android (it only
// really applies insets on iOS) — this version computes real device
// insets cross-platform, including Android's navigation/gesture bar,
// which matters now that Expo SDK 54+ defaults to edge-to-edge rendering.
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../theme/ThemeContext';
import BigButton from '../components/BigButton';

export default function ReportPreviewScreen({ route, navigation }) {
  const { docxUri, pdfUri } = route.params;
  const theme = useTheme();

  const share = async (uri, label) => {
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Sharing unavailable', `${label} saved at:\n${uri}`);
      return;
    }
    await Sharing.shareAsync(uri);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={styles.emoji}>✅</Text>
      <Text style={[styles.title, { color: theme.text }]}>Report Generated</Text>
      <Text style={[styles.subtitle, { color: theme.subtext }]}>
        Both the DOCX and PDF versions have been saved to the report archive.
      </Text>

      <View style={{ height: 24 }} />

      <BigButton title="Open / Share PDF" icon="📕" onPress={() => share(pdfUri, 'PDF')} />
      <BigButton title="Export DOCX" icon="📝" variant="secondary" onPress={() => share(docxUri, 'DOCX')} />
      <BigButton
        title="Back to Home"
        variant="secondary"
        onPress={() => navigation.popToTop()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'stretch' },
  emoji: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, textAlign: 'center', marginTop: 8 },
});
