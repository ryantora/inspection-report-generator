import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import { listReports, deleteReport } from '../database/db';
import { useTheme } from '../theme/ThemeContext';

export default function ReportArchiveScreen() {
  const theme = useTheme();
  const [reports, setReports] = useState([]);

  const refresh = useCallback(() => {
    listReports().then(setReports).catch(console.error);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const openOrShare = async (uri) => {
    const available = await Sharing.isAvailableAsync();
    if (available) {
      await Sharing.shareAsync(uri);
    } else {
      Alert.alert('File location', uri);
    }
  };

  const remove = (report) => {
    Alert.alert('Delete Report', `Delete the report for Bus Stop ${report.bus_stop_code}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReport(report.id);
          refresh();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Report Archive</Text>
      <FlatList
        data={reports}
        keyExtractor={(r) => String(r.id)}
        ListEmptyComponent={
          <Text style={{ color: theme.subtext, textAlign: 'center', marginTop: 40 }}>
            No reports generated yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Bus Stop {item.bus_stop_code}</Text>
            <Text style={[styles.cardSub, { color: theme.subtext }]}>
              Generated {item.generated_at}
            </Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={() => openOrShare(item.pdf_uri)} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: theme.primary }]}>Open PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openOrShare(item.pdf_uri)} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: theme.primary }]}>Share PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openOrShare(item.docx_uri)} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: theme.primary }]}>Export DOCX</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(item)} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: theme.danger }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  actionBtn: { paddingVertical: 4 },
  actionText: { fontSize: 13, fontWeight: '700' },
});
