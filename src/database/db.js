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

    CREATE INDEX IF NOT EXISTS idx_entries_inspection ON checklist_entries(inspection_id);
    CREATE INDEX IF NOT EXISTS idx_reports_inspection ON reports(inspection_id);
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

/**
 * Returns { completedCount, totalRequired, missingTitles[] }
 * "na" (not applicable, optional items only) counts as satisfied.
 */
export async function getValidationSummary(inspectionId) {
  const entries = await getChecklistEntries(inspectionId);
  const requiredEntries = entries.filter((e) => REQUIRED_ITEM_IDS.includes(e.item_id));
  const missing = requiredEntries.filter((e) => e.status === 'missing');
  const completedCount = entries.filter((e) => e.status === 'completed' || e.status === 'na').length;

  return {
    completedCount,
    totalItems: entries.length,
    totalRequired: requiredEntries.length,
    isReadyForReport: missing.length === 0,
    missingTitles: missing.map((e) => e.item_title),
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

