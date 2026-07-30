import React, { useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, PanResponder } from 'react-native';
// The core RN SafeAreaView is effectively a no-op on Android (it only
// really applies insets on iOS) — this version computes real device
// insets cross-platform, including Android's navigation/gesture bar,
// which matters now that Expo SDK 54+ defaults to edge-to-edge rendering.
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useFocusEffect } from '@react-navigation/native';
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
  const { inspectionId, itemId, itemTitle, busStopCode, target, cameraNumber } = route.params;
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

  // Digital zoom, 1x (CameraView's default lens, zoom=0) up to 5x
  // (zoom=1). Driven by a raw two-finger pinch via PanResponder — no
  // extra gesture library needed, since PanResponder already exposes all
  // active touches.
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 5;

  const [zoomMultiplier, setZoomMultiplier] = useState(1); // what the user sees/pinches, 1x .. 5x
  const zoomMultiplierRef = useRef(1);
  const pinchStartRef = useRef({ distance: 0, zoomMultiplier: 1 });

  // Maps our 1x..5x display multiplier to CameraView's own 0..1 zoom prop.
  const cameraZoomProp = (zoomMultiplier - 1) / (ZOOM_MAX - 1);

  const touchDistance = (touches) => {
    const [a, b] = touches;
    const dx = a.pageX - b.pageX;
    const dy = a.pageY - b.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const pinchResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim the gesture once a second finger is down — a single
        // touch on the camera area itself shouldn't be mistaken for the
        // start of a pinch (the flash/torch/shutter buttons live in their
        // own separate rows now, not on top of the camera, so this is
        // just about not hijacking an accidental single-finger touch).
        onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
        onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length === 2) {
            pinchStartRef.current = { distance: touchDistance(touches), zoomMultiplier: zoomMultiplierRef.current };
          }
        },
        onPanResponderMove: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length !== 2) return;
          const { distance: startDistance, zoomMultiplier: startZoom } = pinchStartRef.current;
          if (startDistance <= 0) return;
          const currentDistance = touchDistance(touches);
          const scale = currentDistance / startDistance;
          const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, startZoom * scale));
          zoomMultiplierRef.current = newZoom;
          setZoomMultiplier(newZoom);
        },
      }),
    []
  );

  // Guarantees the camera always starts at 1x (true default field of
  // view) every time this screen is shown — even if React Navigation ends
  // up reusing a previous route instance instead of a fresh mount. This
  // was the fix for photos being captured pre-zoomed (with a portion of
  // the true FOV never captured at all) after a previous pinch gesture.
  useFocusEffect(
    useCallback(() => {
      zoomMultiplierRef.current = 1;
      setZoomMultiplier(1);
    }, [])
  );

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

      // iOS quirk: a landscape-orientation capture can come back with an
      // EXIF orientation TAG (not physically-rotated pixel data) while
      // photo.width/height are reported pre-rotation — Android's capture
      // pipeline already normalizes this, iOS's doesn't consistently. Two
      // symptoms trace back to this single root cause: (1) the Crop
      // screen's initial crop box was sized off the wrong (pre-rotation)
      // dimensions, so it didn't match the actually-displayed (correctly
      // rotated) <Image>, overshooting past its edges into the buttons;
      // (2) the FINAL saved photo kept the stale EXIF tag, so it came out
      // sideways wherever that tag isn't respected.
      //
      // Passing an explicit `{ rotate: 0 }` action (rather than an EMPTY
      // action list) forces a full decode -> apply-EXIF-orientation ->
      // re-encode round trip every time. A truly empty action array can be
      // treated as a fast passthrough on some platform/library version
      // combinations — just reading metadata without actually baking the
      // corrected orientation into the pixel data — which is the likely
      // reason the previous no-op version didn't reliably fix this on iOS.
      // Harmless no-op either way on Android, whose dimensions were
      // already correct.
      const normalized = await ImageManipulator.manipulateAsync(photo.uri, [{ rotate: 0 }], {
        compress: 1,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      // Hand off to the crop screen rather than saving immediately, so the
      // engineer can tighten the frame (e.g. exclude glare, other labels)
      // before it's committed to the checklist item.
      navigation.navigate('Crop', {
        photoUri: normalized.uri,
        naturalWidth: normalized.width,
        naturalHeight: normalized.height,
        inspectionId,
        itemId,
        itemTitle,
        busStopCode,
        target,
        cameraNumber,
      });
    } catch (err) {
      Alert.alert('Capture failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topRow}>
        <View style={[styles.banner, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
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

        {zoomMultiplier !== 1 && (
          <View pointerEvents="none" style={styles.zoomBadge}>
            <Text style={styles.controlText}>{zoomMultiplier.toFixed(1)}x</Text>
          </View>
        )}
      </View>

      {/* This flex:1 region — not the whole screen — is the ONLY space the
          camera preview occupies. Previously the CameraView filled the
          entire screen edge-to-edge with the buttons drawn in an
          absolutely-positioned layer on top of it; on some Android devices
          (especially with the system navigation bar / gesture area taken
          into account) that let the bottom controls visually overlap the
          live preview. Putting the camera in its own flex sibling between
          two normal (non-absolute) control rows makes that structurally
          impossible — the black background here also fills any leftover
          gap if the camera's own aspect ratio doesn't exactly match this
          area. */}
      <View style={styles.cameraArea} {...pinchResponder.panHandlers}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          flash={flashMode}
          enableTorch={torchOn}
          zoom={cameraZoomProp}
          animateShutter={false}
          onCameraReady={() => setCameraReady(true)}
        />
      </View>

      <View style={styles.shutterRow}>
        <Text style={styles.pinchHint}>Pinch with two fingers to zoom</Text>
        <BigButton
          title={!cameraReady ? 'Warming up…' : busy ? 'Saving…' : '⬤  Capture'}
          onPress={handleShutter}
          loading={busy}
          disabled={!cameraReady}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The camera preview's own reserved region — flex:1 fills whatever
  // space is left after topRow/shutterRow take theirs. Black background
  // covers any letterboxing gap if the camera's aspect ratio doesn't
  // exactly match this area.
  cameraArea: { flex: 1, backgroundColor: '#000' },
  topRow: { padding: 16, backgroundColor: '#000' },
  banner: { padding: 12, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  controlsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  controlBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  controlBtnActive: { backgroundColor: 'rgba(76,154,255,0.85)' },
  controlText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  zoomBadge: {
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  pinchHint: { color: '#fff', textAlign: 'center', fontSize: 12, opacity: 0.8, marginBottom: 8 },
  // No longer absolutely positioned, so no need for pointerEvents tricks —
  // this is just a normal, solid-black control row below the camera area.
  shutterRow: { padding: 24, backgroundColor: '#000' },
});
