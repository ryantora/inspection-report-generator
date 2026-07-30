// import * as SQLite from 'expo-sqlite';
// // SDK 54+: the default 'expo-file-system' export is the new File/Directory
// // API and no longer has EncodingType/readAsStringAsync/etc. This file uses
// // the classic functional API, which now lives at 'expo-file-system/legacy'.
// import * as FileSystem from 'expo-file-system/legacy';
// import { REQUIRED_ITEM_IDS, CHECKLIST_ITEMS } from '../config/checklist';

// const DB_NAME = 'inspections.db';
// let dbInstance = null;

// /**
//  * Opens (and lazily initializes) the on-device SQLite database.
//  * Safe to call repeatedly — subsequent calls reuse the same connection.
//  */
// export async function getDb() {
//   if (dbInstance) return dbInstance;
//   dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
//   await initSchema(dbInstance);
//   return dbInstance;
// }

// async function initSchema(db) {
//   // Inlined so the app has zero dependency on bundling the raw .sql file.
//   // Keep in sync with database/schema.sql.
//   await db.execAsync(`
//     PRAGMA journal_mode = WAL;
//     PRAGMA foreign_keys = ON;

//     CREATE TABLE IF NOT EXISTS inspections (
//       id              INTEGER PRIMARY KEY AUTOINCREMENT,
//       bus_stop_code   TEXT    NOT NULL,
//       inspector_name  TEXT    NOT NULL,
//       inspection_date TEXT    NOT NULL,
//       status          TEXT    NOT NULL DEFAULT 'in_progress',
//       created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
//       updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
//     );

//     CREATE TABLE IF NOT EXISTS checklist_entries (
//       id              INTEGER PRIMARY KEY AUTOINCREMENT,
//       inspection_id   INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
//       item_id         INTEGER NOT NULL,
//       item_title      TEXT    NOT NULL,
//       image_uri       TEXT,
//       source_type     TEXT,
//       status          TEXT    NOT NULL DEFAULT 'missing',
//       captured_at     TEXT,
//       UNIQUE(inspection_id, item_id)
//     );

//     CREATE TABLE IF NOT EXISTS reports (
//       id              INTEGER PRIMARY KEY AUTOINCREMENT,
//       inspection_id   INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
//       bus_stop_code   TEXT    NOT NULL,
//       docx_uri        TEXT    NOT NULL,
//       pdf_uri         TEXT    NOT NULL,
//       generated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
//     );

//     CREATE INDEX IF NOT EXISTS idx_entries_inspection ON checklist_entries(inspection_id);
//     CREATE INDEX IF NOT EXISTS idx_reports_inspection ON reports(inspection_id);
//   `);
// }

// // ---------------------------------------------------------------------------
// // Inspections
// // ---------------------------------------------------------------------------

// export async function createInspection({ busStopCode, inspectorName, inspectionDate }) {
//   const db = await getDb();
//   const result = await db.runAsync(
//     `INSERT INTO inspections (bus_stop_code, inspector_name, inspection_date) VALUES (?, ?, ?)`,
//     [busStopCode.trim(), inspectorName.trim(), inspectionDate]
//   );
//   const inspectionId = result.lastInsertRowId;

//   // Pre-seed one "missing" row per checklist item so progress tracking is trivial.
//   for (const item of CHECKLIST_ITEMS) {
//     await db.runAsync(
//       `INSERT INTO checklist_entries (inspection_id, item_id, item_title, status) VALUES (?, ?, ?, 'missing')`,
//       [inspectionId, item.id, item.title]
//     );
//   }

//   return inspectionId;
// }

// export async function getInspection(inspectionId) {
//   const db = await getDb();
//   return db.getFirstAsync(`SELECT * FROM inspections WHERE id = ?`, [inspectionId]);
// }

// export async function listInspections() {
//   const db = await getDb();
//   return db.getAllAsync(`SELECT * FROM inspections ORDER BY created_at DESC`);
// }

// export async function markInspectionCompleted(inspectionId) {
//   const db = await getDb();
//   await db.runAsync(
//     `UPDATE inspections SET status = 'completed', updated_at = datetime('now') WHERE id = ?`,
//     [inspectionId]
//   );
// }

// export async function deleteInspection(inspectionId) {
//   const db = await getDb();
//   await db.runAsync(`DELETE FROM inspections WHERE id = ?`, [inspectionId]);
// }

// // ---------------------------------------------------------------------------
// // Checklist entries
// // ---------------------------------------------------------------------------

// export async function getChecklistEntries(inspectionId) {
//   const db = await getDb();
//   return db.getAllAsync(
//     `SELECT * FROM checklist_entries WHERE inspection_id = ? ORDER BY item_id ASC`,
//     [inspectionId]
//   );
// }

// export async function saveChecklistImage({ inspectionId, itemId, itemTitle, imageUri, sourceType }) {
//   const db = await getDb();
//   await db.runAsync(
//     `UPDATE checklist_entries
//      SET image_uri = ?, source_type = ?, status = 'completed', captured_at = datetime('now')
//      WHERE inspection_id = ? AND item_id = ?`,
//     [imageUri, sourceType, inspectionId, itemId]
//   );
//   await touchInspection(inspectionId);
// }

// export async function markItemNotApplicable({ inspectionId, itemId }) {
//   const db = await getDb();
//   await db.runAsync(
//     `UPDATE checklist_entries SET status = 'na', image_uri = NULL WHERE inspection_id = ? AND item_id = ?`,
//     [inspectionId, itemId]
//   );
//   await touchInspection(inspectionId);
// }

// export async function clearChecklistImage({ inspectionId, itemId }) {
//   const db = await getDb();
//   await db.runAsync(
//     `UPDATE checklist_entries SET image_uri = NULL, status = 'missing', captured_at = NULL WHERE inspection_id = ? AND item_id = ?`,
//     [inspectionId, itemId]
//   );
//   await touchInspection(inspectionId);
// }

// async function touchInspection(inspectionId) {
//   const db = await getDb();
//   await db.runAsync(`UPDATE inspections SET updated_at = datetime('now') WHERE id = ?`, [inspectionId]);
// }

// /**
//  * Returns { completedCount, totalRequired, missingTitles[] }
//  * "na" (not applicable, optional items only) counts as satisfied.
//  */
// export async function getValidationSummary(inspectionId) {
//   const entries = await getChecklistEntries(inspectionId);
//   const requiredEntries = entries.filter((e) => REQUIRED_ITEM_IDS.includes(e.item_id));
//   const missing = requiredEntries.filter((e) => e.status === 'missing');
//   const completedCount = entries.filter((e) => e.status === 'completed' || e.status === 'na').length;

//   return {
//     completedCount,
//     totalItems: entries.length,
//     totalRequired: requiredEntries.length,
//     isReadyForReport: missing.length === 0,
//     missingTitles: missing.map((e) => e.item_title),
//   };
// }

// // ---------------------------------------------------------------------------
// // Reports
// // ---------------------------------------------------------------------------

// export async function saveReportRecord({ inspectionId, busStopCode, docxUri, pdfUri }) {
//   const db = await getDb();
//   const result = await db.runAsync(
//     `INSERT INTO reports (inspection_id, bus_stop_code, docx_uri, pdf_uri) VALUES (?, ?, ?, ?)`,
//     [inspectionId, busStopCode, docxUri, pdfUri]
//   );
//   return result.lastInsertRowId;
// }

// export async function listReports() {
//   const db = await getDb();
//   return db.getAllAsync(`SELECT * FROM reports ORDER BY generated_at DESC`);
// }

// export async function getReportForInspection(inspectionId) {
//   const db = await getDb();
//   return db.getFirstAsync(
//     `SELECT * FROM reports WHERE inspection_id = ? ORDER BY generated_at DESC LIMIT 1`,
//     [inspectionId]
//   );
// }

// export async function deleteReport(reportId) {
//   const db = await getDb();
//   const report = await db.getFirstAsync(`SELECT * FROM reports WHERE id = ?`, [reportId]);
//   if (report) {
//     // Best-effort cleanup of the files on disk; ignore errors if already gone.
//     try { await FileSystem.deleteAsync(report.docx_uri, { idempotent: true }); } catch (e) {}
//     try { await FileSystem.deleteAsync(report.pdf_uri, { idempotent: true }); } catch (e) {}
//   }
//   await db.runAsync(`DELETE FROM reports WHERE id = ?`, [reportId]);
// }



import * as SQLite from 'expo-sqlite';
// SDK 54+: the default 'expo-file-system' export is the new File/Directory
// API and no longer has EncodingType/readAsStringAsync/etc. This file uses
// the classic functional API, which now lives at 'expo-file-system/legacy'.
import * as FileSystem from 'expo-file-system/legacy';
import { REQUIRED_ITEM_IDS, CHECKLIST_ITEMS } from '../config/checklist';

const DB_NAME = 'inspections.db';
let dbInstance = null;

/**
 * Opens (and lazily initializes) the on-device SQLite database.
 * Safe to call repeatedly — subsequent calls reuse the same connection.
 */
export async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  await initSchema(dbInstance);
  return dbInstance;
}

async function initSchema(db) {
  // Inlined so the app has zero dependency on bundling the raw .sql file.
  // Keep in sync with database/schema.sql.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS inspections (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      bus_stop_code   TEXT    NOT NULL,
      inspector_name  TEXT    NOT NULL,
      inspection_date TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'in_progress',
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checklist_entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_id   INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
      item_id         INTEGER NOT NULL,
      item_title      TEXT    NOT NULL,
      image_uri       TEXT,
      source_type     TEXT,
      status          TEXT    NOT NULL DEFAULT 'missing',
      captured_at     TEXT,
      UNIQUE(inspection_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_id   INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
      bus_stop_code   TEXT    NOT NULL,
      docx_uri        TEXT    NOT NULL,
      pdf_uri         TEXT    NOT NULL,
      generated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Dynamic "Dome Camera" sections. Unlike checklist_entries (a fixed
    -- set seeded at inspection creation), rows here are added on demand
    -- via the "Add Camera" button — camera_number just increments. Every
    -- row that exists is required to complete the inspection; there's no
    -- N/A status here since a camera that isn't needed is simply never
    -- added.
    CREATE TABLE IF NOT EXISTS dome_cameras (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      inspection_id   INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
      camera_number   INTEGER NOT NULL,
      image_uri       TEXT,
      source_type     TEXT,
      status          TEXT    NOT NULL DEFAULT 'missing',
      captured_at     TEXT,
      UNIQUE(inspection_id, camera_number)
    );

    CREATE INDEX IF NOT EXISTS idx_entries_inspection ON checklist_entries(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_reports_inspection ON reports(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_cameras_inspection ON dome_cameras(inspection_id);
  `);
}

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

export async function createInspection({ busStopCode, inspectorName, inspectionDate }) {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO inspections (bus_stop_code, inspector_name, inspection_date) VALUES (?, ?, ?)`,
    [busStopCode.trim(), inspectorName.trim(), inspectionDate]
  );
  const inspectionId = result.lastInsertRowId;

  // Pre-seed one "missing" row per checklist item so progress tracking is trivial.
  for (const item of CHECKLIST_ITEMS) {
    await db.runAsync(
      `INSERT INTO checklist_entries (inspection_id, item_id, item_title, status) VALUES (?, ?, ?, 'missing')`,
      [inspectionId, item.id, item.title]
    );
  }

  // Every inspection starts with exactly one dome camera (C1) — additional
  // ones are added later via addDomeCamera() through the "Add Camera"
  // button on the Checklist screen.
  await db.runAsync(
    `INSERT INTO dome_cameras (inspection_id, camera_number, status) VALUES (?, 1, 'missing')`,
    [inspectionId]
  );

  return inspectionId;
}

export async function getInspection(inspectionId) {
  const db = await getDb();
  return db.getFirstAsync(`SELECT * FROM inspections WHERE id = ?`, [inspectionId]);
}

export async function listInspections() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM inspections ORDER BY created_at DESC`);
}

export async function markInspectionCompleted(inspectionId) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE inspections SET status = 'completed', updated_at = datetime('now') WHERE id = ?`,
    [inspectionId]
  );
}

export async function deleteInspection(inspectionId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM inspections WHERE id = ?`, [inspectionId]);
}

// ---------------------------------------------------------------------------
// Checklist entries
// ---------------------------------------------------------------------------

export async function getChecklistEntries(inspectionId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM checklist_entries WHERE inspection_id = ? ORDER BY item_id ASC`,
    [inspectionId]
  );
}

export async function saveChecklistImage({ inspectionId, itemId, itemTitle, imageUri, sourceType }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE checklist_entries
     SET image_uri = ?, source_type = ?, status = 'completed', captured_at = datetime('now')
     WHERE inspection_id = ? AND item_id = ?`,
    [imageUri, sourceType, inspectionId, itemId]
  );
  await touchInspection(inspectionId);
}

export async function markItemNotApplicable({ inspectionId, itemId }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE checklist_entries SET status = 'na', image_uri = NULL WHERE inspection_id = ? AND item_id = ?`,
    [inspectionId, itemId]
  );
  await touchInspection(inspectionId);
}

export async function clearChecklistImage({ inspectionId, itemId }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE checklist_entries SET image_uri = NULL, status = 'missing', captured_at = NULL WHERE inspection_id = ? AND item_id = ?`,
    [inspectionId, itemId]
  );
  await touchInspection(inspectionId);
}

async function touchInspection(inspectionId) {
  const db = await getDb();
  await db.runAsync(`UPDATE inspections SET updated_at = datetime('now') WHERE id = ?`, [inspectionId]);
}

// ---------------------------------------------------------------------------
// Dome cameras (dynamic — see schema comment on dome_cameras above)
// ---------------------------------------------------------------------------

export async function getDomeCameras(inspectionId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM dome_cameras WHERE inspection_id = ? ORDER BY camera_number ASC`,
    [inspectionId]
  );
}

/** Adds the next camera (C2, C3, ...) below whichever camera is currently last. Returns the new camera_number. */
export async function addDomeCamera(inspectionId) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT COALESCE(MAX(camera_number), 0) as maxNum FROM dome_cameras WHERE inspection_id = ?`,
    [inspectionId]
  );
  const nextNumber = (row?.maxNum || 0) + 1;
  await db.runAsync(
    `INSERT INTO dome_cameras (inspection_id, camera_number, status) VALUES (?, ?, 'missing')`,
    [inspectionId, nextNumber]
  );
  await touchInspection(inspectionId);
  return nextNumber;
}

export async function saveDomeCameraImage({ inspectionId, cameraNumber, imageUri, sourceType }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE dome_cameras
     SET image_uri = ?, source_type = ?, status = 'completed', captured_at = datetime('now')
     WHERE inspection_id = ? AND camera_number = ?`,
    [imageUri, sourceType, inspectionId, cameraNumber]
  );
  await touchInspection(inspectionId);
}

export async function clearDomeCameraImage({ inspectionId, cameraNumber }) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE dome_cameras SET image_uri = NULL, status = 'missing', captured_at = NULL WHERE inspection_id = ? AND camera_number = ?`,
    [inspectionId, cameraNumber]
  );
  await touchInspection(inspectionId);
}

/**
 * Merges the static checklist_entries (split before/after where cameras
 * sit — item ids <=16, then all cameras, then item ids >=21) with the
 * dynamic dome_cameras rows into ONE ordered list, and assigns a
 * sequential `displayNumber` (1..N) based on final position. This is the
 * single source of truth for numbering used by BOTH the Checklist screen
 * UI and report generation (see reportService.js), so however many
 * cameras exist, numbering always stays correctly sequential with no gaps.
 */
export async function getCombinedOrderedEntries(inspectionId) {
  const staticEntries = await getChecklistEntries(inspectionId);
  const cameras = await getDomeCameras(inspectionId);

  const before = staticEntries.filter((e) => e.item_id <= 16).map((e) => ({ ...e, kind: 'static' }));
  const after = staticEntries.filter((e) => e.item_id >= 21).map((e) => ({ ...e, kind: 'static' }));

  const cameraEntries = cameras.map((c) => ({
    // Normalized to the same shape as a checklist_entries row so the UI
    // card and report generators don't need to special-case cameras.
    item_id: c.camera_number, // stable internal id — NOT the printed number
    item_title: `Dome Camera (C${c.camera_number}) with Chevron Sticker — FOV check against camera label`,
    image_uri: c.image_uri,
    source_type: c.source_type,
    status: c.status,
    captured_at: c.captured_at,
    kind: 'camera',
    camera_number: c.camera_number,
    isLastCamera: false,
  }));
  if (cameraEntries.length > 0) {
    cameraEntries[cameraEntries.length - 1].isLastCamera = true;
  }

  const combined = [...before, ...cameraEntries, ...after];
  return combined.map((e, idx) => ({ ...e, displayNumber: idx + 1 }));
}

/**
 * Returns { completedCount, totalRequired, missingTitles[] }
 * "na" (not applicable, optional items only) counts as satisfied.
 * Every dome camera that exists is required — no N/A concept for cameras.
 */
export async function getValidationSummary(inspectionId) {
  const entries = await getChecklistEntries(inspectionId);
  const cameras = await getDomeCameras(inspectionId);

  const requiredEntries = entries.filter((e) => REQUIRED_ITEM_IDS.includes(e.item_id));
  const missingStatic = requiredEntries.filter((e) => e.status === 'missing');
  const missingCameras = cameras.filter((c) => c.status !== 'completed');

  const completedStatic = entries.filter((e) => e.status === 'completed' || e.status === 'na').length;
  const completedCameras = cameras.filter((c) => c.status === 'completed').length;

  return {
    completedCount: completedStatic + completedCameras,
    totalItems: entries.length + cameras.length,
    totalRequired: requiredEntries.length + cameras.length,
    isReadyForReport: missingStatic.length === 0 && missingCameras.length === 0,
    missingTitles: [
      ...missingStatic.map((e) => e.item_title),
      ...missingCameras.map(
        (c) => `Dome Camera (C${c.camera_number}) with Chevron Sticker — FOV check against camera label`
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function saveReportRecord({ inspectionId, busStopCode, docxUri, pdfUri }) {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO reports (inspection_id, bus_stop_code, docx_uri, pdf_uri) VALUES (?, ?, ?, ?)`,
    [inspectionId, busStopCode, docxUri, pdfUri]
  );
  return result.lastInsertRowId;
}

export async function listReports() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM reports ORDER BY generated_at DESC`);
}

export async function getReportForInspection(inspectionId) {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT * FROM reports WHERE inspection_id = ? ORDER BY generated_at DESC LIMIT 1`,
    [inspectionId]
  );
}

export async function deleteReport(reportId) {
  const db = await getDb();
  const report = await db.getFirstAsync(`SELECT * FROM reports WHERE id = ?`, [reportId]);
  if (report) {
    // Best-effort cleanup of the files on disk; ignore errors if already gone.
    try { await FileSystem.deleteAsync(report.docx_uri, { idempotent: true }); } catch (e) {}
    try { await FileSystem.deleteAsync(report.pdf_uri, { idempotent: true }); } catch (e) {}
  }
  await db.runAsync(`DELETE FROM reports WHERE id = ?`, [reportId]);
}

