import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { listInspections } from '../database/db';
import { useTheme } from '../theme/ThemeContext';
import BigButton from '../components/BigButton';

export default function HomeScreen({ navigation }) {
  const theme = useTheme();
  const [inspections, setInspections] = useState([]);

  useFocusEffect(
    useCallback(() => {
      listInspections().then(setInspections).catch(console.error);
    }, [])
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Inspections</Text>
        <Text style={[styles.subtitle, { color: theme.subtext }]}>
          CCTV & Networking Infrastructure
        </Text>
      </View>

      <BigButton
        title="New Inspection"
        icon="➕"
        onPress={() => navigation.navigate('CreateInspection')}
      />
      <TouchableOpacity onPress={() => navigation.navigate('ReportArchive')} style={styles.archiveLink}>
        <Text style={[styles.archiveLinkText, { color: theme.primary }]}>📁 View Report Archive</Text>
      </TouchableOpacity>

      <FlatList
        style={{ marginTop: 12 }}
        data={inspections}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.subtext }]}>
            No inspections yet. Tap "New Inspection" to begin.
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => navigation.navigate('Checklist', { inspectionId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Bus Stop {item.bus_stop_code}
              </Text>
              <Text style={[styles.cardSub, { color: theme.subtext }]}>
                {item.inspector_name} · {item.inspection_date}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: item.status === 'completed' ? theme.success : theme.danger },
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {item.status === 'completed' ? 'Completed' : 'In Progress'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2 },
  archiveLink: { alignSelf: 'center', paddingVertical: 10 },
  archiveLinkText: { fontSize: 15, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSub: { fontSize: 13, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
