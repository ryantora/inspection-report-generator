import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  PanResponder,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import BigButton from '../components/BigButton';
import { saveChecklistImage } from '../database/db';
import { DEBUG_SKIP_OVERLAY } from './CaptureScreen';
import { useOverlayCompositor } from '../../App';

const HANDLE_SIZE = 28;
const SCREEN_W = Dimensions.get('window').width;

/**
 * Lets the engineer drag the 4 corners of a crop rectangle over the photo
 * they just took, then crops via expo-image-manipulator (pure geometric
 * crop — no AI/OCR involved) before the image is saved to the checklist
 * item.
 */
export default function CropScreen({ route, navigation }) {
  const { photoUri, naturalWidth, naturalHeight, inspectionId, itemId, itemTitle, busStopCode } = route.params;
  const [saving, setSaving] = useState(false);
  const overlayRef = useOverlayCompositor();

  // Applies the timestamp/bus-stop overlay unless DEBUG_SKIP_OVERLAY is on
  // (see CaptureScreen.js), then saves the result to the checklist item.
  const finalizeAndSave = async (uri) => {
    const finalUri = DEBUG_SKIP_OVERLAY ? uri : await overlayRef.current.burnIn(uri, busStopCode, new Date());
    await saveChecklistImage({
      inspectionId,
      itemId,
      itemTitle,
      imageUri: finalUri,
      sourceType: 'camera',
    });
  };

  // Displayed image box (photo scaled down to fit the screen width).
  const displayW = SCREEN_W;
  const displayH = (naturalHeight / naturalWidth) * displayW;
  const scaleToNatural = naturalWidth / displayW;

  // Crop rectangle in DISPLAY coordinates, initialized to a centered 80% box.
  const initial = useMemo(() => {
    const margin = 0.1;
    return {
      x: displayW * margin,
      y: displayH * margin,
      w: displayW * (1 - margin * 2),
      h: displayH * (1 - margin * 2),
    };
  }, [displayW, displayH]);

  const [rect, setRect] = useState(initial);
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

  // One PanResponder per corner; each drags that corner while keeping the
  // opposite corner fixed, so the box can be freely resized.
  //
  // IMPORTANT: gesture.dx/dy from PanResponder are CUMULATIVE from the
  // start of the current touch, not per-event deltas. The previous version
  // re-read rectRef.current (the live, already-updated rect) on every
  // move and added the cumulative gesture.dx to it — re-applying the
  // whole delta on top of an already-shifted position on every single
  // event, which compounds explosively and flings the box to an edge
  // almost instantly. The fix: snapshot the rect ONCE when the gesture
  // begins (onPanResponderGrant) and compute every move purely from that
  // fixed snapshot + the cumulative gesture.dx/dy.
  const makeCornerResponder = (corner) => {
    const gestureStart = { current: null };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gestureStart.current = rectRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const start = gestureStart.current;
        if (!start) return;
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
          w = clamp(start.w + gesture.dx, minSize, displayW - start.x);
          h = start.h - (newY - start.y);
          y = newY;
        } else if (corner === 'bl') {
          const newX = clamp(start.x + gesture.dx, 0, start.x + start.w - minSize);
          w = start.w - (newX - start.x);
          h = clamp(start.h + gesture.dy, minSize, displayH - start.y);
          x = newX;
        } else if (corner === 'br') {
          w = clamp(start.w + gesture.dx, minSize, displayW - start.x);
          h = clamp(start.h + gesture.dy, minSize, displayH - start.y);
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

  const resetCrop = () => setRect(initial);

  // Any single checklist photo saved larger than this on its longest edge
  // gets downsized (JPEG, quality 0.85) before being written to disk. This
  // is what fixes the report-generation OutOfMemoryError: with ~20 full
  // resolution (12MP+) photos, assembling the .docx in memory (base64
  // encoding the whole zip, then writing that string natively) can exceed
  // the JS heap on Android. 1600px is still comfortably legible for label
  // photos while cutting per-image size roughly 10x.
  const MAX_SAVED_DIMENSION = 1600;

  const confirmCrop = async () => {
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]}>
      <Text style={styles.title}>Crop Photo</Text>
      <Text style={styles.subtitle}>Drag the corners to adjust, or use the full photo as-is.</Text>

      <View style={{ width: displayW, height: displayH, alignSelf: 'center' }}>
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

      <View style={styles.actions}>
        {saving ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 16 }} />
        ) : (
          <>
            <BigButton title="Use Cropped Area" onPress={confirmCrop} />
            <BigButton title="Reset Crop" variant="secondary" onPress={resetCrop} />
            <BigButton title="Use Full Photo (No Crop)" variant="secondary" onPress={useFullPhoto} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  subtitle: { color: '#ccc', fontSize: 12, textAlign: 'center', marginBottom: 12, paddingHorizontal: 20 },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  // dim: { position: 'absolute', backgroundColor: 'rgba(105, 255, 130, 0.55)' },
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
  actions: { padding: 20, marginTop: 'auto' },
});
