import { getInspection, getChecklistEntries, getValidationSummary, saveReportRecord, markInspectionCompleted } from '../database/db';
import { generateDocxReport } from './docxGenerator';
import { generatePdfReport } from './pdfGenerator';

export class ValidationError extends Error {
  constructor(missingTitles) {
    super('Cannot generate report: required items are missing.');
    this.name = 'ValidationError';
    this.missingTitles = missingTitles;
  }
}

/**
 * Validates the inspection, then generates BOTH the .docx and .pdf reports
 * and records them in the local database. Throws ValidationError if any
 * required checklist item is missing.
 */
export async function generateReport(inspectionId) {
  const summary = await getValidationSummary(inspectionId);
  if (!summary.isReadyForReport) {
    throw new ValidationError(summary.missingTitles);
  }

  const inspection = await getInspection(inspectionId);
  const entries = await getChecklistEntries(inspectionId);

  const docxUri = await generateDocxReport({ inspection, entries });
  const pdfUri = await generatePdfReport({ inspection, entries });

  const reportId = await saveReportRecord({
    inspectionId,
    busStopCode: inspection.bus_stop_code,
    docxUri,
    pdfUri,
  });

  await markInspectionCompleted(inspectionId);

  return { reportId, docxUri, pdfUri };
}
