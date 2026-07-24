/**
 * docxGenerator.js
 * -------------------------------------------------------------------------
 * Generates a .docx report identical in structure to the supplied template:
 *   - A4 page, 1in margins
 *   - Header: "Bus Stop Code: <code>" ... tab ... "Inspected by: <name>"
 *   - One checklist item per page: bold numbered title, then the photo,
 *     scaled to fit the page width while preserving aspect ratio and
 *     original image quality (no re-encoding).
 *
 * Runs entirely on-device (no server round-trip) using the pure-JS `docx`
 * package, so it works fully offline.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Header,
  PageBreak,
  AlignmentType,
  PositionalTab,
  PositionalTabAlignment,
  PositionalTabLeader,
  PositionalTabRelativeTo,
  HeightRule,
} from 'docx';
// SDK 54+: the default 'expo-file-system' export is the new File/Directory
// API and no longer has EncodingType/readAsStringAsync/etc. This file uses
// the classic functional API, which now lives at 'expo-file-system/legacy'.
import * as FileSystem from 'expo-file-system/legacy';
import { prepareImageForReport } from './imagePrep';

// A4 in twips (matches the supplied template exactly)
const PAGE_WIDTH_TWIPS = 11906;
const PAGE_HEIGHT_TWIPS = 16838;
const MARGIN_TWIPS = 1440; // 1 inch

const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96; // docx ImageRun.transformation is in "pixels" at 96dpi equivalence

const CONTENT_WIDTH_IN = (PAGE_WIDTH_TWIPS - MARGIN_TWIPS * 2) / TWIPS_PER_INCH; // ≈ 6.27in
const MAX_IMAGE_WIDTH_PX = Math.floor(CONTENT_WIDTH_IN * PX_PER_INCH);
const MAX_IMAGE_HEIGHT_PX = Math.floor(8.5 * PX_PER_INCH); // generous cap so tall label photos still fit the page

/** Reads a local file:// image into a base64 string for ImageRun. */
async function readImageAsBase64(uri) {
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

/** Scales {width,height} to fit within the max box, preserving aspect ratio. */
function fitWithinBox(width, height, maxWidth, maxHeight) {
  // Scales (up or down) so the image fills the available content width,
  // capped by max height, always preserving the original aspect ratio.
  const fitScale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * fitScale),
    height: Math.round(height * fitScale),
  };
}

function guessImageType(uri) {
  const ext = uri.split('.').pop().toLowerCase().split('?')[0];
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  return 'jpg';
}

/**
 * @param {Object} params
 * @param {{busStopCode:string, inspectorName:string, inspectionDate:string}} params.inspection
 * @param {Array<{item_id:number,item_title:string,image_uri:string,status:string}>} params.entries
 * @returns {Promise<string>} local file:// URI of the generated .docx
 */
export async function generateDocxReport({ inspection, entries }) {
  const header = new Header({
    children: [
      new Paragraph({
        tabStops: [], // PositionalTab below handles right-alignment like the template
        children: [
          new TextRun({ text: `Bus Stop Code: ${inspection.bus_stop_code}` }),
          new TextRun({
            children: [new PositionalTab({
              relativeTo: PositionalTabRelativeTo.MARGIN,
              alignment: PositionalTabAlignment.RIGHT,
              leader: PositionalTabLeader.NONE,
            })],
          }),
          new TextRun({ text: `Inspected by: ${inspection.inspector_name}` }),
        ],
      }),
    ],
  });

  const sectionChildren = [];
  const applicableEntries = entries.filter((e) => e.status === 'completed' && e.image_uri);

  for (let i = 0; i < applicableEntries.length; i++) {
    const entry = applicableEntries[i];

    // Title paragraph — numbered + bold, matching the template style.
    sectionChildren.push(
      new Paragraph({
        spacing: { before: 200, after: 200 },
        children: [
          new TextRun({ text: `${entry.item_id}. ${entry.item_title}`, bold: true, size: 24 }),
        ],
      })
    );

    try {
      // Caps this image's longest edge to 1600px before it's read/embedded
      // — regardless of whether it came from the (already-downsized)
      // camera+crop flow or a full-resolution gallery upload. This is
      // what prevents the OutOfMemoryError when many large images are
      // assembled into one .docx.
      const prepared = await prepareImageForReport(entry.image_uri);
      const base64 = await readImageAsBase64(prepared.uri);
      const fitted = fitWithinBox(
        prepared.width,
        prepared.height,
        MAX_IMAGE_WIDTH_PX,
        MAX_IMAGE_HEIGHT_PX
      );

      sectionChildren.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new ImageRun({
              data: base64,
              type: guessImageType(prepared.uri),
              transformation: { width: fitted.width, height: fitted.height },
            }),
          ],
        })
      );
    } catch (err) {
      sectionChildren.push(
        new Paragraph({
          children: [new TextRun({ text: `[Image could not be embedded: ${err.message}]`, italics: true })],
        })
      );
    }

    // One checklist item per page, per spec — page break after every item
    // except the very last one.
    if (i < applicableEntries.length - 1) {
      sectionChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  // Static closing line appended after the last checklist item — not tied
  // to any data, just fixed presentation text on the final page.
  sectionChildren.push(
    new Paragraph({
      spacing: { before: 400 },
      children: [new TextRun({ text: 'Reminder:', bold: true })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: '[Yes/' }),
        new TextRun({ text: 'No', strike: true }),
        new TextRun({ text: '] Inspector had checked against all FOV against camera label' }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: {
              top: MARGIN_TWIPS,
              bottom: MARGIN_TWIPS,
              left: MARGIN_TWIPS,
              right: MARGIN_TWIPS,
              header: 708,
              footer: 708,
            },
          },
        },
        headers: { default: header },
        children: sectionChildren,
      },
    ],
  });

  const base64Doc = await Packer.toBase64String(doc);
  const dir = `${FileSystem.documentDirectory}reports/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const outPath = `${dir}${inspection.bus_stop_code}_Inspection_Report.docx`;
  await FileSystem.writeAsStringAsync(outPath, base64Doc, { encoding: FileSystem.EncodingType.Base64 });
  return outPath;
}
