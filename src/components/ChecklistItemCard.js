import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * entry: { item_id, item_title, image_uri, status } where status is
 * 'missing' | 'completed' | 'na'
 */
export default function ChecklistItemCard({ entry, optional, onCapture, onUpload, onMarkNA, onRetake }) {
  const theme = useTheme();
  const statusColor =
    entry.status === 'completed' ? theme.success : entry.status === 'na' ? theme.subtext : theme.danger;
  const statusLabel =
    entry.status === 'completed' ? 'Completed' : entry.status === 'na' ? 'N/A' : 'Missing';

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={3}>
          {entry.item_id}. {entry.item_title}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
      </View>

      {entry.image_uri ? (
        <Image source={{ uri: entry.image_uri }} style={styles.preview} resizeMode="cover" />
      ) : (
        <View style={[styles.placeholder, { borderColor: theme.border }]}>
          <Text style={{ color: theme.subtext }}>No image yet</Text>
        </View>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={onCapture}>
          <Text style={styles.actionText}>📷 Capture Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={onUpload}>
          <Text style={styles.actionText}>🖼️ Upload Screenshot</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.secondaryRow}>
        {entry.image_uri && (
          <TouchableOpacity onPress={onRetake}>
            <Text style={[styles.secondaryLink, { color: theme.primary }]}>Retake / Replace</Text>
          </TouchableOpacity>
        )}
        {optional && entry.status !== 'completed' && (
          <TouchableOpacity onPress={onMarkNA}>
            <Text style={[styles.secondaryLink, { color: theme.subtext }]}>Mark N/A</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', marginRight: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  preview: { width: '100%', height: 180, borderRadius: 10, marginBottom: 10 },
  placeholder: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginHorizontal: 2 },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  secondaryLink: { fontSize: 13, fontWeight: '600' },
});
