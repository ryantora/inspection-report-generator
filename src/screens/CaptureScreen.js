import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../theme/ThemeContext';
import BigButton from '../components/BigButton';

/**
 * TEMPORARY DEBUG SWITCH
 * ---------------------------------------------------------------------
 * Set to `true` to skip the timestamp/bus-stop overlay entirely and carry
 * the (possibly cropped) camera output straight through as-is. Use this to
 * confirm whether black photos are coming from the camera capture itself
 * or from the overlay compositor. Set back to `false` once the raw camera
 * output looks good — CropScreen honors this flag too.
 */
export const DEBUG_SKIP_OVERLAY = false;

// Cycles through flash modes for takePictureAsync. "torch" (continuous
// light, like a normal camera app's flashlight toggle) is handled
// separately via enableTorch since it isn't a "flash" value.
const FLASH_MODES = ['off', 'auto', 'on'];
const FLASH_ICON = { off: '⚡️ Off', auto: '⚡️ Auto', on: '⚡️ On' };

/**
 * Fast-capture flow: open camera -> shoot -> crop (optional) -> overlay
 * (when enabled) -> auto-save -> return to checklist.
 */
export default function CaptureScreen({ route, navigation }) {
  const { inspectionId, itemId, itemTitle, busStopCode } = route.params;
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [busy, setBusy] = useState(false);
  // A separate, common cause of black Android photos: taking a picture
  // before the camera hardware has actually finished initializing.
  // onCameraReady tells us when it's safe to shoot.
  const [cameraReady, setCameraReady] = useState(false);

  const [flashIndex, setFlashIndex] = useState(0); // index into FLASH_MODES
  const flashMode = FLASH_MODES[flashIndex];
  const [torchOn, setTorchOn] = useState(false); // continuous light, like a flashlight

  if (!permission) {
    return <View style={[styles.center, { backgroundColor: theme.background }]}><ActivityIndicator /></View>;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background, padding: 24 }]}>
        <Text style={{ color: theme.text, textAlign: 'center', marginBottom: 16, fontSize: 16 }}>
          Camera access is required to capture inspection photos.
        </Text>
        <BigButton title="Grant Camera Permission" onPress={requestPermission} />
      </SafeAreaView>
    );
  }

  const cycleFlash = () => setFlashIndex((i) => (i + 1) % FLASH_MODES.length);
  const toggleTorch = () => setTorchOn((t) => !t);

  const handleShutter = async () => {
    if (!cameraRef.current || busy || !cameraReady) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        // skipProcessing:true skips Android's normal rotation/orientation
        // correction, which can leave photo.width/height inconsistent with
        // the actual bitmap the crop step reads — a likely contributor to
        // the "x + width must be <= bitmap.width()" crash on the Crop
        // screen. Keep this false unless you hit a black-photo issue that
        // specifically requires it.
        skipProcessing: false,
        shutterSound: false, // requires expo-camera >= the version that ships this option (see package.json note)
      });

      // Hand off to the crop screen rather than saving immediately, so the
      // engineer can tighten the frame (e.g. exclude glare, other labels)
      // before it's committed to the checklist item.
      navigation.navigate('Crop', {
        photoUri: photo.uri,
        naturalWidth: photo.width,
        naturalHeight: photo.height,
        inspectionId,
        itemId,
        itemTitle,
        busStopCode,
      });
    } catch (err) {
      Alert.alert('Capture failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        flash={flashMode}
        enableTorch={torchOn}
        animateShutter={false}
        onCameraReady={() => setCameraReady(true)}
      />
      <SafeAreaView style={styles.overlayUi}>
        <View style={styles.topRow}>
          <View style={[styles.banner, { backgroundColor: 'rgba(250, 11, 158, 0.55)' }]}>
            <Text style={styles.bannerText}>{itemTitle}</Text>
            {DEBUG_SKIP_OVERLAY && (
              <Text style={[styles.bannerText, { fontSize: 11, opacity: 0.8, marginTop: 4 }]}>
                DEBUG: timestamp overlay disabled
              </Text>
            )}
          </View>

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.controlBtn} onPress={cycleFlash}>
              <Text style={styles.controlText}>{FLASH_ICON[flashMode]}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, torchOn && styles.controlBtnActive]}
              onPress={toggleTorch}
            >
              <Text style={styles.controlText}>🔦 {torchOn ? 'Light On' : 'Light Off'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.shutterRow}>
          <BigButton
            title={!cameraReady ? 'Warming up…' : busy ? 'Saving…' : '⬤  Capture'}
            onPress={handleShutter}
            loading={busy}
            disabled={!cameraReady}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlayUi: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  topRow: { padding: 16 },
  banner: { padding: 12, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  controlsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  controlBtn: {
    backgroundColor: 'rgba(250, 137, 235, 0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  controlBtnActive: { backgroundColor: 'rgba(76,154,255,0.85)' },
  controlText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  shutterRow: { padding: 24 },
});
