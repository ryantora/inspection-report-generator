-- ============================================================================
-- CCTV / Networking Inspection App — SQLite schema (on-device)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- One row per inspection ("job") created at a bus stop
CREATE TABLE IF NOT EXISTS inspections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_stop_code   TEXT    NOT NULL,
  inspector_name  TEXT    NOT NULL,
  inspection_date TEXT    NOT NULL,          -- ISO 8601, e.g. 2026-07-23
  status          TEXT    NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per checklist item captured for a given inspection
CREATE TABLE IF NOT EXISTS checklist_entries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id   INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  item_id         INTEGER NOT NULL,          -- matches CHECKLIST_ITEMS[].id in src/config/checklist.js
  item_title      TEXT    NOT NULL,          -- snapshotted at capture time (survives future checklist edits)
  image_uri       TEXT,                      -- local file:// path of the final (overlaid) image
  source_type     TEXT,                      -- 'camera' | 'upload'
  status          TEXT    NOT NULL DEFAULT 'missing', -- missing | completed | na
  captured_at     TEXT,
  UNIQUE(inspection_id, item_id)
);

-- One row per generated report (docx + pdf pair) for an inspection
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
