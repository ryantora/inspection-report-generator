// import { getInspection, getChecklistEntries, getValidationSummary, saveReportRecord, markInspectionCompleted } from '../database/db';
// import { generateDocxReport } from './docxGenerator';
// import { generatePdfReport } from './pdfGenerator';

// export class ValidationError extends Error {
//   constructor(missingTitles) {
//     super('Cannot generate report: required items are missing.');
//     this.name = 'ValidationError';
//     this.missingTitles = missingTitles;
//   }
// }

// /**
//  * Validates the inspection, then generates BOTH the .docx and .pdf reports
//  * and records them in the local database. Throws ValidationError if any
//  * required checklist item is missing.
//  */
// export async function generateReport(inspectionId) {
//   const summary = await getValidationSummary(inspectionId);
//   if (!summary.isReadyForReport) {
//     throw new ValidationError(summary.missingTitles);
//   }

//   const inspection = await getInspection(inspectionId);
//   const entries = await getChecklistEntries(inspectionId);

//   const docxUri = await generateDocxReport({ inspection, entries });
//   const pdfUri = await generatePdfReport({ inspection, entries });

//   const reportId = await saveReportRecord({
//     inspectionId,
//     busStopCode: inspection.bus_stop_code,
//     docxUri,
//     pdfUri,
//   });

//   await markInspectionCompleted(inspectionId);

//   return { reportId, docxUri, pdfUri };
// }


import { getInspection, getCombinedOrderedEntries, getValidationSummary, saveReportRecord, markInspectionCompleted } from '../database/db';
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
  const combined = await getCombinedOrderedEntries(inspectionId);
  // docxGenerator.js/pdfGenerator.js print `${entry.item_id}. ${entry.item_title}`
  // unchanged — substituting the computed displayNumber in for item_id
  // here means those two files need no changes to support a variable
  // number of dynamically-added cameras.
  const entries = combined.map((e) => ({ ...e, item_id: e.displayNumber }));

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
