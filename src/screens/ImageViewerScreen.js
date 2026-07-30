import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text, ScrollView, Dimensions } from 'react-native';
// The core RN SafeAreaView is effectively a no-op on Android (it only
// really applies insets on iOS) — this version computes real device
// insets cross-platform, including Android's navigation/gesture bar,
// which matters now that Expo SDK 54+ defaults to edge-to-edge rendering.
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/**
 * Full-screen photo viewer for reviewing a completed checklist item's
 * image. Pinch-to-zoom is provided by ScrollView's built-in
 * minimumZoomScale/maximumZoomScale (native zoom, no extra dependency
 * needed) rather than a custom gesture implementation.
 */
export default function ImageViewerScreen({ route, navigation }) {
  const { imageUri, title } = route.params;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        maximumZoomScale={5}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
      </ScrollView>

      <SafeAreaView style={styles.headerOverlay} pointerEvents="box-none">
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        {title ? (
          <View style={styles.titleWrap} pointerEvents="none">
            <Text style={styles.titleText} numberOfLines={1}>
              {title}
            </Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: SCREEN_W, height: SCREEN_H },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  titleWrap: { flex: 1, marginLeft: 10 },
  titleText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
