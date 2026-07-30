import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  PanResponder,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
// The core RN SafeAreaView is effectively a no-op on Android (it only
// really applies insets on iOS) — this version computes real device
// insets cross-platform, including Android's navigation/gesture bar,
// which matters now that Expo SDK 54+ defaults to edge-to-edge rendering.
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import BigButton from '../components/BigButton';
import { saveChecklistImage, saveDomeCameraImage } from '../database/db';
import { DEBUG_SKIP_OVERLAY } from './CaptureScreen';
import { useOverlayCompositor } from '../../App';

const HANDLE_SIZE = 28;
// Room to leave around the fitted photo so the drag handles (which
// protrude HANDLE_SIZE/2 past each edge) never get clipped by the
// measured container bounds.
const HANDLE_INSET = HANDLE_SIZE * 1.5;

/** Scales {naturalW,naturalH} to fit fully inside {boxW,boxH}, preserving aspect ratio (like resizeMode="contain"). */
function fitContain(naturalW, naturalH, boxW, boxH) {
  if (!naturalW || !naturalH || boxW <= 0 || boxH <= 0) return { width: 0, height: 0 };
  const scale = Math.min(boxW / naturalW, boxH / naturalH);
  return { width: naturalW * scale, height: naturalH * scale };
}

function computeInitialRect(displayW, displayH) {
  // Starts covering the FULL photo — no default inset. Previously this
  // cropped 10% off each edge by default, which visually looked like the
  // photo preview was "zoomed in" (the dimmed regions hid real photo
  // content the engineer had to manually drag out to reveal, even though
  // nothing was actually lost — it just wasn't shown until dragged).
  return { x: 0, y: 0, w: displayW, h: displayH };
}

/**
 * Lets the engineer drag the 4 corners of a crop rectangle over the photo
 * they just took, then crops via expo-image-manipulator (pure geometric
 * crop — no AI/OCR involved) before the image is saved to the checklist
 * item.
 *
 * RESPONSIVE LAYOUT NOTE: the photo preview is sized to fit whatever space
 * is actually left over after the title/subtitle and the action buttons —
 * measured at runtime via onLayout — rather than assuming the device's
 * full screen width. A previous version always sized the preview to
 * (screen width, aspect-ratio-derived height), which for a tall portrait
 * photo could compute a height taller than the screen (pushing the action
 * buttons off-screen), and for a wide/landscape photo left large unused
 * empty space (looking too small). Fitting into the measured, remaining
 * flex space fixes both on any device/orientation.
 */
export default function CropScreen({ route, navigation }) {
  const {
    photoUri: initialPhotoUri,
    naturalWidth: initialNaturalWidth,
    naturalHeight: initialNaturalHeight,
    inspectionId,
    itemId,
    itemTitle,
    busStopCode,
    target,
    cameraNumber,
  } = route.params;

  // State (not plain route-param constants) so the Rotate button can
  // replace the working photo/dimensions in place — the crop UI below,
  // and the eventual save, both just read whatever these currently are.
  const [photoUri, setPhotoUri] = useState(initialPhotoUri);
  const [naturalWidth, setNaturalWidth] = useState(initialNaturalWidth);
  const [naturalHeight, setNaturalHeight] = useState(initialNaturalHeight);
  const [rotating, setRotating] = useState(false);

  const [saving, setSaving] = useState(false);
  const overlayRef = useOverlayCompositor();

  // Applies the timestamp/bus-stop overlay unless DEBUG_SKIP_OVERLAY is on
  // (see CaptureScreen.js), then saves the result to the correct table —
  // a static checklist item, or a dynamically added Dome Camera section.
  //
  // IMPORTANT: this is called with the FINAL (already cropped and/or
  // rotated) image URI — burnIn() always runs last, after any rotation.
  // That ordering is what guarantees the timestamp/bus-stop text is
  // composited onto the image in its final orientation and never gets
  // rotated along with the photo content itself.
  const finalizeAndSave = async (uri) => {
    const finalUri = DEBUG_SKIP_OVERLAY ? uri : await overlayRef.current.burnIn(uri, busStopCode, new Date());
    if (target === 'camera') {
      await saveDomeCameraImage({ inspectionId, cameraNumber, imageUri: finalUri, sourceType: 'camera' });
    } else {
      await saveChecklistImage({ inspectionId, itemId, itemTitle, imageUri: finalUri, sourceType: 'camera' });
    }
  };

  // Size of the flexible middle area, measured via onLayout below. null
  // until the first layout pass completes.
  const [containerSize, setContainerSize] = useState(null);

  // Displayed image box: the photo fitted (aspect-ratio preserved) inside
  // whatever space onLayout actually measured, minus room for the handles.
  const { width: displayW, height: displayH } = useMemo(() => {
    if (!containerSize) return { width: 0, height: 0 };
    const availW = Math.max(containerSize.width - HANDLE_INSET, 10);
    const availH = Math.max(containerSize.height - HANDLE_INSET, 10);
    return fitContain(naturalWidth, naturalHeight, availW, availH);
  }, [containerSize, naturalWidth, naturalHeight]);

  const scaleToNatural = displayW > 0 ? naturalWidth / displayW : 1;

  // Crop rectangle in DISPLAY coordinates. Starts null and is seeded once
  // displayW/displayH become known (i.e. once the container has actually
  // been measured), rather than assuming a size up front.
  const [rect, setRect] = useState(null);
  const rectRef = useRef(rect);
  rectRef.current = rect;

  // Tracks whether the user has actually started dragging a handle yet.
  // Until they have, we keep the crop rect synced to computeInitialRect()
  // every time displayW/displayH change. This matters on iOS specifically:
  // onLayout can fire twice on mount — once with a provisional size before
  // safe-area insets settle, then again with the corrected size. Without
  // this, the rect got permanently frozen to the FIRST (wrong)
  // measurement, causing the crop border to visibly exceed the actual
  // photo bounds and overlap the buttons below, until "Reset Crop" was
  // tapped (which recomputes against the then-current, correct
  // displayW/displayH).
  const hasAdjustedRef = useRef(false);

  useEffect(() => {
    if (displayW > 0 && displayH > 0 && !hasAdjustedRef.current) {
      setRect(computeInitialRect(displayW, displayH));
    }
  }, [displayW, displayH]);

  /**
   * Rotates the working photo 90° clockwise. This runs entirely on the
   * plain photo — the timestamp/bus-stop overlay is only ever applied
   * later, in finalizeAndSave(), once cropping AND rotation are both
   * finished. That ordering (rotate/crop first, overlay burned in last)
   * is what guarantees the overlay text always ends up correctly
   * oriented in the final image and never gets rotated along with it.
   */
  const rotatePhoto = async () => {
    setRotating(true);
    try {
      const result = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ rotate: 90 }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhotoUri(result.uri);
      setNaturalWidth(result.width);
      setNaturalHeight(result.height);
      // Aspect ratio just flipped 90° — the old crop rectangle's
      // coordinates no longer mean anything against the new dimensions.
      // Clearing rect (shows a brief loading spinner) and releasing the
      // "user has adjusted" lock lets the existing seeding effect above
      // recompute a fresh full-frame selection for the rotated photo.
      hasAdjustedRef.current = false;
      setRect(null);
    } catch (err) {
      Alert.alert('Rotate failed', err.message);
    } finally {
      setRotating(false);
    }
  };

  // PanResponder callbacks are created once (see responders useMemo below)
  // but displayW/displayH can change across renders (e.g. right after the
  // first layout measurement resolves) — read them from a ref so the
  // gesture handlers always see the current values instead of whatever
  // they were on the render the responders happened to be created on.
  const dimsRef = useRef({ displayW, displayH });
  dimsRef.current = { displayW, displayH };

  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  // One PanResponder per corner; each drags that corner while keeping the
  // opposite corner fixed, so the box can be freely resized.
  //
  // IMPORTANT: gesture.dx/dy from PanResponder are CUMULATIVE from the
  // start of the current touch, not per-event deltas. Snapshotting the
  // rect ONCE at onPanResponderGrant and computing every move purely from
  // that fixed snapshot + the cumulative gesture.dx/dy avoids the box
  // flinging to an edge (re-applying an already-applied delta every event).
  const makeCornerResponder = (corner) => {
    const gestureStart = { current: null };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gestureStart.current = rectRef.current;
        hasAdjustedRef.current = true;
      },
      onPanResponderMove: (_evt, gesture) => {
        const start = gestureStart.current;
        if (!start) return;
        const { displayW: dw, displayH: dh } = dimsRef.current;
        let { x, y, w, h } = start;
        const minSize = 40;

        if (corner === 'tl') {
          const newX = clamp(start.x + gesture.dx, 0, start.x + start.w - minSize);
          const newY = clamp(start.y + gesture.dy, 0, start.y + start.h - minSize);
          w = start.w - (newX - start.x);
          h = start.h - (newY - start.y);
          x = newX;
          y = newY;
        } else if (corner === 'tr') {
          const newY = clamp(start.y + gesture.dy, 0, start.y + start.h - minSize);
          w = clamp(start.w + gesture.dx, minSize, dw - start.x);
          h = start.h - (newY - start.y);
          y = newY;
        } else if (corner === 'bl') {
          const newX = clamp(start.x + gesture.dx, 0, start.x + start.w - minSize);
          w = start.w - (newX - start.x);
          h = clamp(start.h + gesture.dy, minSize, dh - start.y);
          x = newX;
        } else if (corner === 'br') {
          w = clamp(start.w + gesture.dx, minSize, dw - start.x);
          h = clamp(start.h + gesture.dy, minSize, dh - start.y);
        }

        setRect({ x, y, w, h });
      },
    });
  };

  // Each corner gets its own responder (and its own gestureStart closure),
  // created once.
  const responders = useMemo(
    () => ({
      tl: makeCornerResponder('tl'),
      tr: makeCornerResponder('tr'),
      bl: makeCornerResponder('bl'),
      br: makeCornerResponder('br'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const resetCrop = () => {
    hasAdjustedRef.current = false;
    if (displayW > 0 && displayH > 0) setRect(computeInitialRect(displayW, displayH));
  };

  // Any single checklist photo saved larger than this on its longest edge
  // gets downsized (JPEG, quality 0.85) before being written to disk. This
  // is what fixes the report-generation OutOfMemoryError: with ~20 full
  // resolution (12MP+) photos, assembling the .docx in memory (base64
  // encoding the whole zip, then writing that string natively) can exceed
  // the JS heap on Android. 1600px is still comfortably legible for label
  // photos while cutting per-image size roughly 10x.
  const MAX_SAVED_DIMENSION = 1600;

  const confirmCrop = async () => {
    if (!rect) return;
    setSaving(true);
    try {
      // originX/width and originY/height are rounded to pixels
      // INDEPENDENTLY here. Rounding both endpoints of a span up can push
      // origin + size 1px past the source bitmap's actual dimensions, which
      // is exactly what crashed the native crop step with
      // "x + width must be <= bitmap.width()". Deriving width/height from
      // two clamped edges (rather than rounding a size independently)
      // guarantees origin + size never exceeds the bitmap.
      const originX = clamp(Math.round(rect.x * scaleToNatural), 0, naturalWidth - 1);
      const originY = clamp(Math.round(rect.y * scaleToNatural), 0, naturalHeight - 1);
      const endX = clamp(Math.round((rect.x + rect.w) * scaleToNatural), originX + 1, naturalWidth);
      const endY = clamp(Math.round((rect.y + rect.h) * scaleToNatural), originY + 1, naturalHeight);
      const cropNatural = { originX, originY, width: endX - originX, height: endY - originY };

      const actions = [{ crop: cropNatural }];
      const longestEdge = Math.max(cropNatural.width, cropNatural.height);
      if (longestEdge > MAX_SAVED_DIMENSION) {
        actions.push(
          cropNatural.width >= cropNatural.height
            ? { resize: { width: MAX_SAVED_DIMENSION } }
            : { resize: { height: MAX_SAVED_DIMENSION } }
        );
      }

      const result = await ImageManipulator.manipulateAsync(photoUri, actions, {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      await finalizeAndSave(result.uri);

      // Pop Crop + Capture, back to the Checklist screen.
      navigation.pop(2);
    } catch (err) {
      Alert.alert('Crop failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const useFullPhoto = async () => {
    setSaving(true);
    try {
      let uri = photoUri;
      const longestEdge = Math.max(naturalWidth, naturalHeight);
      if (longestEdge > MAX_SAVED_DIMENSION) {
        const resized = await ImageManipulator.manipulateAsync(
          photoUri,
          [
            naturalWidth >= naturalHeight
              ? { resize: { width: MAX_SAVED_DIMENSION } }
              : { resize: { height: MAX_SAVED_DIMENSION } },
          ],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );
        uri = resized.uri;
      }
      await finalizeAndSave(uri);
      navigation.pop(2);
    } catch (err) {
      Alert.alert('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  const ready = containerSize && rect;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]}>
      <Text style={styles.title}>Crop Photo</Text>
      <Text style={styles.subtitle}>Drag the corners to adjust, or use the full photo as-is.</Text>

      {/* Flexible middle area: takes exactly whatever space is left after
          the header text above and the action buttons below, on any
          device/screen size. The photo is fitted inside it, never forced
          to a fixed width — this is what fixes both the "too big" (button
          cut off) and "too small" (lots of empty space) reports. */}
      <View style={styles.previewArea} onLayout={(e) => setContainerSize(e.nativeEvent.layout)}>
        {(!ready || rotating) && <ActivityIndicator color="#fff" />}

        {ready && !rotating && (
          <View style={{ width: displayW, height: displayH }}>
            <Image source={{ uri: photoUri }} style={{ width: displayW, height: displayH }} resizeMode="contain" />

            {/* Dimmed regions outside the crop box */}
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: 0, width: displayW, height: rect.y }]} />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: 0, top: rect.y + rect.h, width: displayW, height: displayH - rect.y - rect.h }]}
            />
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: rect.y, width: rect.x, height: rect.h }]} />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: rect.x + rect.w, top: rect.y, width: displayW - rect.x - rect.w, height: rect.h }]}
            />

            {/* Crop rectangle border */}
            <View
              pointerEvents="none"
              style={[styles.rectBorder, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]}
            />

            {/* Corner handles */}
            <View {...responders.tl.panHandlers} style={[styles.handle, { left: rect.x - HANDLE_SIZE / 2, top: rect.y - HANDLE_SIZE / 2 }]} />
            <View {...responders.tr.panHandlers} style={[styles.handle, { left: rect.x + rect.w - HANDLE_SIZE / 2, top: rect.y - HANDLE_SIZE / 2 }]} />
            <View {...responders.bl.panHandlers} style={[styles.handle, { left: rect.x - HANDLE_SIZE / 2, top: rect.y + rect.h - HANDLE_SIZE / 2 }]} />
            <View {...responders.br.panHandlers} style={[styles.handle, { left: rect.x + rect.w - HANDLE_SIZE / 2, top: rect.y + rect.h - HANDLE_SIZE / 2 }]} />
          </View>
        )}

        {/* Floating in the corner rather than a full row — keeps the
            vertical space budget we deliberately tightened elsewhere on
            this screen (see the "too big"/letterboxing fix) untouched. */}
        {ready && (
          <TouchableOpacity
            style={styles.rotateBtn}
            onPress={rotatePhoto}
            disabled={rotating}
            accessibilityLabel="Rotate photo 90 degrees"
          >
            <Text style={styles.rotateBtnText}>↻ Rotate</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actions}>
        {saving ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
        ) : (
          <>
            <BigButton title="Use Cropped Area" onPress={confirmCrop} disabled={!ready} />
            {/* Reset + Use Full Photo share a row instead of stacking as 3
                full-height buttons — reclaims vertical space for the
                preview above, which is what was causing side letterboxing
                on taller-screen devices (less leftover height meant the
                fit was being constrained by width instead of height). */}
            <View style={styles.secondaryRow}>
              <View style={styles.secondaryButtonWrap}>
                <BigButton title="Reset Crop" variant="secondary" onPress={resetCrop} disabled={!ready} />
              </View>
              <View style={styles.secondaryButtonWrap}>
                <BigButton title="Use Full Photo" variant="secondary" onPress={useFullPhoto} />
              </View>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  subtitle: { color: '#ccc', fontSize: 11, textAlign: 'center', marginBottom: 6, paddingHorizontal: 20 },
  // flex: 1 makes this take exactly whatever space remains between the
  // header text above and the fixed-height actions row below.
  previewArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  rotateBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  rotateBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  rectBorder: { position: 'absolute', borderWidth: 2, borderColor: '#4C9AFF' },
  handle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    backgroundColor: '#4C9AFF',
    borderWidth: 2,
    borderColor: '#fff',
  },
  actions: { padding: 16 },
  secondaryRow: { flexDirection: 'row', marginTop: 2 },
  secondaryButtonWrap: { flex: 1, marginHorizontal: 4 },
});
