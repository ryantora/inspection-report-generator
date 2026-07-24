/**
 * pdfGenerator.js
 * -------------------------------------------------------------------------
 * Generates the PDF version of the report.
 *
 * Why not "convert the .docx to PDF"? True DOCX→PDF conversion requires a
 * layout engine like LibreOffice/Word, which does not exist on Android.
 * Instead we render the SAME structure (header, one item per page, image
 * fit to page width preserving aspect ratio) from HTML using `expo-print`,
 * which rasterizes via the OS's native PDF engine — fully offline, no
 * server required. The result is visually identical to the .docx.
 */
import * as Print from 'expo-print';
// SDK 54+: the default 'expo-file-system' export is the new File/Directory
// API and no longer has EncodingType/readAsStringAsync/etc. This file uses
// the classic functional API, which now lives at 'expo-file-system/legacy'.
import * as FileSystem from 'expo-file-system/legacy';
import { prepareImageForReport } from './imagePrep';

async function toDataUri(uri) {
  // Same OOM fix as docxGenerator.js: cap the image before reading it as
  // base64, since uploaded screenshots can be full-resolution originals.
  const prepared = await prepareImageForReport(uri);
  const ext = prepared.uri.split('.').pop().toLowerCase().split('?')[0];
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(prepared.uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {Object} params
 * @param {{busStopCode:string, inspectorName:string, inspectionDate:string}} params.inspection
 * @param {Array<{item_id:number,item_title:string,image_uri:string,status:string}>} params.entries
 * @returns {Promise<string>} local file:// URI of the generated .pdf
 */
export async function generatePdfReport({ inspection, entries }) {
  const applicableEntries = entries.filter((e) => e.status === 'completed' && e.image_uri);

  const pages = [];
  for (const entry of applicableEntries) {
    let imgTag = '<p><em>[Image unavailable]</em></p>';
    try {
      const dataUri = await toDataUri(entry.image_uri);
      imgTag = `<img src="${dataUri}" class="item-image" />`;
    } catch (e) {
      // fall through with placeholder text
    }

    pages.push(`
      <section class="page">
        <div class="header-row">
          <span>Bus Stop Code: ${escapeHtml(inspection.bus_stop_code)}</span>
          <span>Inspected by: ${escapeHtml(inspection.inspector_name)}</span>
        </div>
        <h2 class="item-title">${entry.item_id}. ${escapeHtml(entry.item_title)}</h2>
        ${imgTag}
      </section>
    `);
  }

  const html = `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 20mm 20mm 20mm 20mm; }
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
        .page { page-break-after: always; padding-top: 4mm; }
        .page:last-child { page-break-after: auto; }
        .header-row {
          display: flex;
          justify-content: space-between;
          font-size: 11pt;
          border-bottom: 0.5pt solid #999;
          padding-bottom: 4mm;
          margin-bottom: 6mm;
        }
        .item-title { font-size: 13pt; margin: 0 0 6mm 0; }
        .item-image {
          max-width: 100%;
          width: 100%;
          height: auto;
          object-fit: contain;
        }
        .reminder { margin-top: 8mm; font-size: 11pt; }
        .reminder-title { font-weight: 700; margin-bottom: 2mm; }
      </style>
    </head>
    <body>
      ${pages.join('\n')}
      <div class="reminder">
        <p class="reminder-title">Reminder:</p>
        <p>[Yes/<s>No</s>] Inspector had checked against all FOV against camera label</p>
      </div>
    </body>
  </html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const dir = `${FileSystem.documentDirectory}reports/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const outPath = `${dir}${inspection.bus_stop_code}_Inspection_Report.pdf`;
  await FileSystem.moveAsync({ from: uri, to: outPath });
  return outPath;
}
