import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function ProgressBar({ completed, total }) {
  const theme = useTheme();
  const pct = total > 0 ? completed / total : 0;
  const isDone = completed >= total;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: theme.text }]}>
          {completed} / {total} Completed
        </Text>
        <Text style={[styles.pct, { color: isDone ? theme.success : theme.subtext }]}>
          {Math.round(pct * 100)}%
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: isDone ? theme.success : theme.primary },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 10 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 16, fontWeight: '700' },
  pct: { fontSize: 14, fontWeight: '600' },
  track: { height: 10, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
});
