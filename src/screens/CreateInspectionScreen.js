import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
// The core RN SafeAreaView is effectively a no-op on Android (it only
// really applies insets on iOS) — this version computes real device
// insets cross-platform, including Android's navigation/gesture bar,
// which matters now that Expo SDK 54+ defaults to edge-to-edge rendering.
import { SafeAreaView } from 'react-native-safe-area-context';
import { createInspection } from '../database/db';
import { useTheme } from '../theme/ThemeContext';
import BigButton from '../components/BigButton';

function todayIso() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export default function CreateInspectionScreen({ navigation }) {
  const theme = useTheme();
  const [busStopCode, setBusStopCode] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [inspectionDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const canSubmit = busStopCode.trim().length > 0 && inspectorName.trim().length > 0 && !saving;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const id = await createInspection({ busStopCode, inspectorName, inspectionDate });
      navigation.replace('Checklist', { inspectionId: id });
    } catch (err) {
      Alert.alert('Could not create inspection', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={[styles.title, { color: theme.text }]}>New Inspection</Text>

        <Text style={[styles.label, { color: theme.subtext }]}>Bus Stop Code</Text>
        <TextInput
          value={busStopCode}
          onChangeText={setBusStopCode}
          placeholder="e.g. 44111"
          placeholderTextColor={theme.subtext}
          keyboardType="number-pad"
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        />

        <Text style={[styles.label, { color: theme.subtext }]}>Inspector Name</Text>
        <TextInput
          value={inspectorName}
          onChangeText={setInspectorName}
          placeholder="e.g. Ryan"
          placeholderTextColor={theme.subtext}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        />

        <Text style={[styles.label, { color: theme.subtext }]}>Inspection Date</Text>
        <View style={[styles.input, { justifyContent: 'center', borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.text }}>{inspectionDate} (today)</Text>
        </View>

        <BigButton title="Start Inspection" onPress={onSubmit} disabled={!canSubmit} loading={saving} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 16,
  },
});
