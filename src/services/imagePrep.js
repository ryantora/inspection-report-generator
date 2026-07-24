/**
 * imagePrep.js
 * -------------------------------------------------------------------------
 * Caps any image's longest edge before it gets embedded into a report.
 *
 * Why this exists: CropScreen.js already downsizes CAMERA-captured photos
 * to 1600px before saving. But uploaded screenshots (uploadService.js) are
 * intentionally copied in untouched — "no renaming/resizing" for uploads —
 * so several checklist items (Live View OSD, Recording Playback, Alarm
 * Input, IP address screenshots, etc.) can still be full-resolution
 * originals, sometimes many MB each. Assembling ~10+ of those into one
 * .docx in memory (base64-encoding the whole zip, then writing that string
 * natively) is what was blowing the Android JS heap with
 * "OutOfMemoryError: Failed to allocate a 67186272 byte allocation".
 *
 * Fixing this at the point of embedding (here) — rather than only at
 * capture/upload time — guarantees every image a report ever touches is
 * bounded, regardless of where it came from.
 */
import * as ImageManipulator from 'expo-image-manipulator';

const MAX_REPORT_DIMENSION = 1600;
const JPEG_COMPRESS_QUALITY = 0.8;

/**
 * @param {string} uri local file:// image URI
 * @returns {Promise<{uri:string, width:number, height:number}>}
 *   A URI guaranteed to be <= MAX_REPORT_DIMENSION on its longest edge
 *   (re-encoded as JPEG when downsizing was needed), plus its resolved
 *   dimensions — callers don't need a separate Image.getSize() call.
 */
export async function prepareImageForReport(uri) {
  // A no-op manipulateAsync call is the cheapest way to read real
  // dimensions without loading the full bitmap into JS.
  const { width, height } = await ImageManipulator.manipulateAsync(uri, [], {});
  const longestEdge = Math.max(width, height);

  if (longestEdge <= MAX_REPORT_DIMENSION) {
    return { uri, width, height };
  }

  const resizeOpts =
    width >= height ? { width: MAX_REPORT_DIMENSION } : { height: MAX_REPORT_DIMENSION };

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: resizeOpts }],
    { compress: JPEG_COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );

  return { uri: result.uri, width: result.width, height: result.height };
}
