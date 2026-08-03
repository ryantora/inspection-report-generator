# CCTV & Networking Infrastructure Inspection App

A production-ready, offline-first Android app for field engineers to run
CCTV/networking inspections at bus stops and automatically generate DOCX +
PDF reports — no manual copy-pasting into Word, no AI image recognition, no
OCR. The workflow is 100% checklist-driven.

```
cctv-inspection-app/
├── mobile-app/     ← the Expo/React Native Android app (this is the product)
└── backend/        ← OPTIONAL companion Node/Express service (see below)
```

---

## 1. How the pieces map to your requirements

| Requirement | Implementation |
|---|---|
| React Native + Expo frontend | `mobile-app/` — Expo SDK 51, React Navigation |
| SQLite on device | `expo-sqlite`, schema in `mobile-app/src/database/schema.sql` |
| Node.js + Express backend | `backend/` — optional, see §4 |
| DOCX generation | `docx` npm package, on-device, `src/services/docxGenerator.js` |
| PDF generation | `expo-print` (HTML→PDF via OS engine), on-device, `src/services/pdfGenerator.js` |
| Local device storage | `expo-file-system`, images/reports under app document directory |
| No AI/OCR | Timestamp burn-in is plain image compositing (`react-native-view-shot`), never text recognition |
| Offline operation | Every screen works with zero network access |

### Why no server round-trip for report generation on the phone?

The spec asks for a Node/Express backend in the stack *and* for the app to
work offline in the field with minimal clicks. Those two requirements are in
tension — a phone can't reliably reach a Node server at a bus stop with no
signal. So the architecture generates reports **on-device** using pure-JS
libraries (`docx`, `expo-print`), which is what makes true offline operation
possible, and ships the Express backend as an **optional** companion for
back-office use (batch regeneration, central archiving from multiple
devices). This is explained in detail in §4.

---

## 2. Report format — matches the supplied template exactly

- A4 page, 1 inch margins (`11906 × 16838` twips, matching `44111.docx`)
- Header row: `Bus Stop Code: <code>` ................ `Inspected by: <name>`
- **One checklist item per page**: bold numbered title, then the image
  scaled to fill the page's content width while preserving aspect ratio
  and original image quality
- Output filenames: `<BusStopCode>_Inspection_Report.docx` and `.pdf`

The 23-item checklist (`mobile-app/src/config/checklist.js`) mirrors the
template 1:1, including the optional Dome Camera C2–C4 items (site-specific,
markable as N/A).

---

## 3. Mobile app — install & run

### Prerequisites
- Node.js 18+
- An Android device or emulator, or Expo Go for quick testing
- (For real APK/AAB builds) an [Expo EAS](https://expo.dev) account

### Steps

```bash
cd mobile-app
npm install

# Add real icon/splash images (see assets/README.md) before building —
# app.json references icon.png / adaptive-icon.png / splash.png.

npx expo start
```

Scan the QR code with Expo Go on an Android device, or press `a` to launch
an Android emulator.

> **Note on `docx` in React Native:** the `docx` package is pure JS and runs
> fine under Metro/Hermes for generating `.docx` files. If you hit a
> `Buffer is not defined` error on some Expo SDK versions, add
> `import { Buffer } from 'buffer'; global.Buffer = global.Buffer || Buffer;`
> near the top of `App.js` (install `buffer` via `npm install buffer`).

### Building a real Android APK/AAB

```bash
npm install -g eas-cli
eas login
cd mobile-app
eas build --platform android --profile preview   # → installable .apk
eas build --platform android --profile production # → .aab for Play Store
```

`eas.json` is already configured with `preview` (APK, for direct install/
sideloading in the field) and `production` (AAB, for Play Store) profiles.

### Permissions requested
- **Camera** — capturing inspection photos
- **Photo library** — uploading screenshots for screen-based items (OSD,
  playback, alarm views, IP address screenshots, etc.)

---

## 4. Backend (optional) — install & run

The mobile app does **not** need this to function. Run it only if you want
a central place to (re)generate/archive reports from a desktop, or to merge
reports uploaded from several field devices.

```bash
cd backend
npm install
npm start
# → CCTV inspection backend listening on http://localhost:4000
```

`POST /api/reports/generate` (multipart/form-data):
- `busStopCode`, `inspectorName`, `inspectionDate` — text fields
- `items` — JSON string: `[{ "itemId": 1, "title": "Enclosure Metal Tag" }, ...]`
- one file per item, field name `image_<itemId>` (e.g. `image_5` for item 5)

Returns `{ docxUrl, pdfUrl }` served from `/files`.

---

## 5. Data model (SQLite, on-device)

See `mobile-app/src/database/schema.sql` for the full DDL. Summary:

- **inspections** — one row per bus-stop inspection job (code, inspector,
  date, status)
- **checklist_entries** — one row per checklist item per inspection
  (image path, source `camera`/`upload`, status `missing`/`completed`/`na`)
- **reports** — one row per generated DOCX+PDF pair, used by the Report
  Archive screen

---

## 6. Key modules

| File | Purpose |
|---|---|
| `src/config/checklist.js` | Single source of truth for the 23 checklist items |
| `src/database/db.js` | All SQLite reads/writes, validation summary logic |
| `src/services/imageOverlay.js` | Burns `YYYY-MM-DD HH:mm:ss` + bus stop code into the top-right corner of captured photos — pure compositing, no OCR/AI |
| `src/services/uploadService.js` | Gallery/file picker for screenshot-based items (JPG/PNG/JPEG only) |
| `src/services/docxGenerator.js` | Builds the `.docx` report matching the template |
| `src/services/pdfGenerator.js` | Builds the `.pdf` report via HTML + `expo-print` |
| `src/services/reportService.js` | Validates completeness, then orchestrates both generators + saves a report record |
| `src/screens/*` | Create Inspection → Checklist → Capture → Report Preview → Report Archive |

---

## 7. Troubleshooting: black photos, shutter sound, crop, flash/torch

- **Shutter sound wouldn't turn off even with `shutterSound: false`**: that
  option was only added to `expo-camera` in a native-module update that
  shipped *after* SDK 51. This project now targets **Expo SDK 54**
  (`expo-camera ~17.0.0`), which includes it. After `npm install`, run
  `npx expo install --fix` once to let Expo pin exact compatible patch
  versions for your SDK. Note: on some Android devices/regions the OS-level
  shutter sound is legally mandated and cannot be silenced by any app,
  regardless of API support — if it persists after the upgrade, that's the
  likely cause.
- **Black photos**: `src/screens/CaptureScreen.js` now gates the shutter
  button behind `onCameraReady` (Expo's docs call out firing
  `takePictureAsync` too early as a common cause) and exports a
  `DEBUG_SKIP_OVERLAY` flag — while `true`, the raw camera output bypasses
  the timestamp-overlay compositor entirely, which is useful for isolating
  whether black frames originate from the camera or from compositing. Flip
  it to `false` once raw captures look correct.
- **Crop**: after capture, engineers land on `CropScreen.js` and can drag
  the 4 corner handles to tighten the frame, then "Use Cropped Area" (crops
  via `expo-image-manipulator`, a pure geometric operation — no AI/OCR) or
  "Use Full Photo" to skip cropping.
- **Flash / torch**: `CaptureScreen.js` has an on-screen flash toggle
  (off → auto → on, applied per-shot via `takePictureAsync`'s `flash` prop)
  and a separate torch toggle (continuous light via `enableTorch`, handy
  for photographing labels inside dark enclosures).

## 8. Field-engineer UX notes

- **Large buttons everywhere** (`src/components/BigButton.js`) — usable with
  gloves, in direct sunlight.
- **Dark mode** follows the device's system setting automatically
  (`src/theme/ThemeContext.js`).
- **Minimum clicks**: tapping "Capture Photo" opens the camera directly;
  the shutter button saves, overlays, associates with the item, and returns
  to the checklist in one tap — no extra confirmation dialogs.
- **Progress tracking**: `X / 23 Completed` bar with green/red status per
  item; optional items (Dome Camera C2–C4) can be marked N/A.
- **Validation before report generation**: missing required items are
  listed by name and block report generation until resolved.
