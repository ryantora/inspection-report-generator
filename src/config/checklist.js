// /**
//  * Checklist configuration
//  * -------------------------------------------------------------------------
//  * Single source of truth for all inspection items. Order here is the exact
//  * order items appear in the checklist screen AND in the generated report.
//  *
//  * imageLayout:
//  *   'small' -> matches template items that use ~3.5in wide label photos
//  *   'wide'  -> matches template items that use ~6in wide screenshots
//  *   (Both are just a *starting* box — actual DOCX/PDF rendering always
//  *    preserves the real aspect ratio of the captured image and fits it to
//  *    the available page width, per the spec.)
//  *
//  * optional: true  -> item can be marked "N/A" (e.g. Dome Camera C2-C4 only
//  *                     exist on sites with more than 1 camera). Optional
//  *                     items do not block report generation when skipped.
//  */

// export const CHECKLIST_ITEMS = [
//   { id: 1, title: 'Enclosure Metal Tag', imageLayout: 'small', optional: false },
//   { id: 2, title: 'SLD Laminated Sheet (A3 Electrical Wiring Diagram, A4 OG Box/Lamp Pole)', imageLayout: 'small', optional: false },
//   { id: 3, title: 'Switch Port Labels (Left View)', imageLayout: 'small', optional: false },
//   { id: 4, title: 'Switch Port Labels (Right View)', imageLayout: 'small', optional: false },
//   { id: 5, title: 'Router Label (Front View)', imageLayout: 'small', optional: false },
//   { id: 6, title: 'Router Label (Top View)', imageLayout: 'small', optional: false },
//   { id: 7, title: 'NVR Label (Front View)', imageLayout: 'small', optional: false },
//   { id: 8, title: 'NVR Label (Top View)', imageLayout: 'small', optional: false },
//   { id: 9, title: 'SPD Label', imageLayout: 'small', optional: false },
//   { id: 10, title: 'Live View — OSD', imageLayout: 'wide', optional: false },
//   { id: 11, title: 'Discreet Camera (Corridor View)', imageLayout: 'wide', optional: false },
//   { id: 12, title: 'Recording Playback', imageLayout: 'wide', optional: false },
//   { id: 13, title: 'Alarm Input', imageLayout: 'wide', optional: false },
//   { id: 14, title: 'Alarm Input Stop', imageLayout: 'wide', optional: false },
//   { id: 15, title: 'Video Resolution and Bit Rate', imageLayout: 'wide', optional: false },
//   { id: 16, title: 'Ziplock Bag with Cable Ties', imageLayout: 'small', optional: false },
//   { id: 17, title: 'Dome Camera (C1) with Chevron Sticker — FOV check against camera label', imageLayout: 'small', optional: false },
//   { id: 18, title: 'Dome Camera (C2) with Chevron Sticker — FOV check against camera label', imageLayout: 'small', optional: true },
//   { id: 19, title: 'Dome Camera (C3) with Chevron Sticker — FOV check against camera label', imageLayout: 'small', optional: true },
//   { id: 20, title: 'Dome Camera (C4) with Chevron Sticker — FOV check against camera label', imageLayout: 'small', optional: true },
//   { id: 21, title: 'Router Device Details (Commands: show version, sdwan certificate serial)', imageLayout: 'wide', optional: false },
//   { id: 22, title: 'Bus Stop IP Address (from FES IP Planning Excel)', imageLayout: 'wide', optional: false },
//   { id: 23, title: 'SADP IP Address Details', imageLayout: 'wide', optional: false },
// ];

// export const REQUIRED_ITEM_IDS = CHECKLIST_ITEMS.filter((i) => !i.optional).map((i) => i.id);
// export const TOTAL_REQUIRED = REQUIRED_ITEM_IDS.length;

// export function getItemById(id) {
//   return CHECKLIST_ITEMS.find((i) => i.id === id);
// }


/**
 * Checklist configuration
 * -------------------------------------------------------------------------
 * Single source of truth for the STATIC inspection items. Order here is
 * the exact order items appear in the checklist screen AND in the
 * generated report.
 *
 * Dome Camera sections (C1, C2, ...) are NOT listed here — they're fully
 * dynamic, stored in the `dome_cameras` table (see database/db.js) and
 * managed via the "Add Camera" button on the Checklist screen, so an
 * arbitrary number of cameras can be added per inspection. They're
 * displayed between item 16 and item 21 (see
 * db.js:getCombinedOrderedEntries), and every added camera is required —
 * there's no "N/A" for cameras anymore; if a camera isn't needed, it's
 * simply never added.
 *
 * imageLayout:
 *   'small' -> matches template items that use ~3.5in wide label photos
 *   'wide'  -> matches template items that use ~6in wide screenshots
 *   (Both are just a *starting* box — actual DOCX/PDF rendering always
 *    preserves the real aspect ratio of the captured image and fits it to
 *    the available page width, per the spec.)
 */

export const CHECKLIST_ITEMS = [
  { id: 1, title: 'Enclosure Metal Tag', imageLayout: 'small', optional: false },
  { id: 2, title: 'SLD Laminated Sheet (A3 Electrical Wiring Diagram, A4 OG Box/Lamp Pole)', imageLayout: 'small', optional: false },
  { id: 3, title: 'Switch Port Labels (Left View)', imageLayout: 'small', optional: false },
  { id: 4, title: 'Switch Port Labels (Right View)', imageLayout: 'small', optional: false },
  { id: 5, title: 'Router Label (Front View)', imageLayout: 'small', optional: false },
  { id: 6, title: 'Router Label (Top View)', imageLayout: 'small', optional: false },
  { id: 7, title: 'NVR Label (Front View)', imageLayout: 'small', optional: false },
  { id: 8, title: 'NVR Label (Top View)', imageLayout: 'small', optional: false },
  { id: 9, title: 'SPD Label', imageLayout: 'small', optional: false },
  { id: 10, title: 'Live View — OSD', imageLayout: 'wide', optional: false },
  { id: 11, title: 'Discreet Camera (Corridor View)', imageLayout: 'wide', optional: false },
  { id: 12, title: 'Recording Playback', imageLayout: 'wide', optional: false },
  { id: 13, title: 'Alarm Input', imageLayout: 'wide', optional: false },
  { id: 14, title: 'Alarm Input Stop', imageLayout: 'wide', optional: false },
  { id: 15, title: 'Video Resolution and Bit Rate', imageLayout: 'wide', optional: false },
  { id: 16, title: 'Ziplock Bag with Cable Ties', imageLayout: 'small', optional: false },
  { id: 21, title: 'Router Device Details (Commands: show version, sdwan certificate serial)', imageLayout: 'wide', optional: false },
  { id: 22, title: 'Bus Stop IP Address (from FES IP Planning Excel)', imageLayout: 'wide', optional: false },
  { id: 23, title: 'SADP IP Address Details', imageLayout: 'wide', optional: false },
];

export const REQUIRED_ITEM_IDS = CHECKLIST_ITEMS.filter((i) => !i.optional).map((i) => i.id);
export const TOTAL_REQUIRED = REQUIRED_ITEM_IDS.length;

export function getItemById(id) {
  return CHECKLIST_ITEMS.find((i) => i.id === id);
}
