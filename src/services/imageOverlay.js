/**
 * imageOverlay.js
 * -------------------------------------------------------------------------
 * Burns a timestamp + bus stop code into the TOP-RIGHT corner of a captured
 * photo, permanently (i.e. baked into the pixel data, not a UI overlay).
 *
 * Approach: react-native-view-shot renders a composite (<Image> + a
 * positioned <Text> label styled like a CCTV timestamp burn-in) and
 * rasterizes it to a new JPEG. This requires zero AI/OCR — it is plain
 * image compositing — and works fully offline.
 *
 * IMPORTANT implementation note (why this isn't hidden off-screen):
 * Earlier versions tried to hide this compositor two different ways:
 *   1. Positioning it 100,000px off-screen — Android's renderer culled it
 *      entirely, producing a fully black snapshot (nothing painted).
 *   2. Wrapping it in a zero-size `overflow: hidden` box at (0,0) — this
 *      avoided the culling issue, BUT Android's image-decoding pipeline
 *      treats a view with zero *visible* area as effectively invisible and
 *      skips actually decoding/painting the bitmap into it (a common
 *      optimization in Android image loaders). A sibling <Text> still
 *      draws fine regardless of visibility, which is exactly the symptom
 *      reported: the timestamp badge appeared, but the photo underneath
 *      stayed solid black (JPEG has no alpha channel, so the untouched
 *      transparent area flattens to black).
 *
 * The fix: don't hide it. Render the compositor as a real, genuinely
 * visible full-screen view for the brief moment it takes to snapshot. This
 * guarantees Android draws everything normally — nothing can be culled or
 * skipped as "invisible" because it isn't. The user sees a brief flash of
 * their own photo with the badge applied, which doubles as a subtle visual
 * confirmation that the overlay was actually burned in.
 *
 * Callers render <OverlayCompositor /> once (see App.js) and call
 * `ref.current.burnIn(...)` to produce the final file.
 */
import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect } from 'react';
import { View, Image, Text, StyleSheet, Dimensions } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

/** Formats a Date as "YYYY-MM-DD HH:mm:ss" (24h, zero-padded). */
export function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

export const OverlayCompositor = forwardRef(function OverlayCompositor(_, ref) {
  const containerRef = useRef(null);
  const [job, setJob] = useState(null); // { uri, displayWidth, displayHeight, label, resolve, reject }
  const [imageLoaded, setImageLoaded] = useState(false);

  useImperativeHandle(ref, () => ({
    /**
     * Composites the timestamp + bus stop code onto `sourceUri` and returns
     * the file:// URI of the resulting JPEG saved into app document storage.
     */
    async burnIn(sourceUri, busStopCode, when = new Date()) {
      if (!busStopCode) {
        console.warn('OverlayCompositor.burnIn called without a busStopCode');
      }

      const { width, height } = await ImageManipulator.manipulateAsync(sourceUri, [], {});
      const label = `${busStopCode || ''}\n${formatTimestamp(when)}`.trim();

      // Render at a normal, on-screen DP size (fit to device width). This
      // is plenty of resolution — report embedding already caps images to
      // 1600px anyway (see imagePrep.js) — and, critically, keeps the view
      // genuinely visible so Android doesn't skip painting it.
      const screenW = Dimensions.get('window').width;
      const displayWidth = screenW;
      const displayHeight = (height / width) * displayWidth;

      return new Promise((resolve, reject) => {
        setImageLoaded(false);
        setJob({ uri: sourceUri, displayWidth, displayHeight, label, resolve, reject });
      });
    },
  }));

  // Once the <Image> below fires onLoad, the frame is fully painted (photo
  // + badge text) — safe to snapshot.
  useEffect(() => {
    if (!job || !imageLoaded) return;
    let cancelled = false;

    (async () => {
      try {
        // One extra frame so the Text/badge layout (computed after Image
        // load) has definitely committed before we snapshot.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const snapshotUri = await captureRef(containerRef, {
          format: 'jpg',
          quality: 0.95,
          result: 'tmpfile',
        });

        const dir = `${FileSystem.documentDirectory}inspections/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        const finalName = `${dir}${Date.now()}_overlay.jpg`;
        await FileSystem.copyAsync({ from: snapshotUri, to: finalName });

        if (!cancelled) job.resolve(finalName);
      } catch (err) {
        if (!cancelled) job.reject(err);
      } finally {
        if (!cancelled) {
          setJob(null);
          setImageLoaded(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [job, imageLoaded]);

  if (!job) return null;

  return (
    <View style={styles.visibleOverlay} pointerEvents="none">
      <View
        ref={containerRef}
        collapsable={false}
        style={{ width: job.displayWidth, height: job.displayHeight, backgroundColor: 'rgba(0, 0, 0, 0)' }}
      >
        <Image
          source={{ uri: job.uri }}
          fadeDuration={0}
          style={{ width: job.displayWidth, height: job.displayHeight }}
          resizeMode="cover"
          onLoad={() => setImageLoaded(true)}
          onError={(e) => job.reject(new Error(`Failed to load captured photo: ${e.nativeEvent?.error}`))}
        />
        <View style={[styles.badge, scaledBadgePosition(job.displayWidth)]}>
          <Text style={[styles.badgeText, { fontSize: Math.max(14, job.displayWidth * 0.032) }]}>
            {job.label}
          </Text>
        </View>
      </View>
      <Text style={styles.processingLabel}>Applying timestamp overlay…</Text>
    </View>
  );
});

// Scales the badge padding/position relative to the display width.
function scaledBadgePosition(width) {
  const margin = Math.max(8, width * 0.02);
  return { top: margin, right: margin, maxWidth: width - margin * 2 };
}

const styles = StyleSheet.create({
  visibleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    // Rendered as the last sibling in App.js, so it already paints on top
    // of the navigator without needing zIndex — kept as a defensive extra.
    zIndex: 9999,
    elevation: 9999,
  },
  badge: {
    position: 'absolute',
    // No background fill — fully transparent, per request. Legibility on
    // light/bright photo backgrounds comes from the text shadow below
    // instead of a solid box behind the text.
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 20,
    flexShrink: 1,
    // Dark drop shadow keeps white text readable over light/bright areas
    // of the photo without needing an opaque box behind it.
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  processingLabel: {
    position: 'absolute',
    bottom: 40,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
