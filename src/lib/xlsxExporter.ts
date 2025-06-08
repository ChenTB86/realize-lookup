import ExcelJS from "exceljs";
import os from "os";
import path from "path";
import { getPreferenceValues } from "@raycast/api";
import { ReportRow } from "./reportService";

/**
 * Returns the download directory from preferences, or ~/Downloads if not set.
 */
import fs from "fs";

function getDownloadDir(): string {
  const prefs = getPreferenceValues<{ download_directory?: string }>();
  const dir = prefs.download_directory?.trim();
  const fallback = path.join(os.homedir(), "Downloads");
  if (!dir) {
    console.log("[XLSX] No download_directory set, using fallback:", fallback);
    return fallback;
  }
  try {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      fs.accessSync(dir, fs.constants.W_OK);
      console.log("[XLSX] Using user download_directory:", dir);
      return dir;
    }
  } catch (e) {
    console.error("[XLSX] Download directory invalid or not writable:", dir, e);
  }
  console.log("[XLSX] Falling back to:", fallback);
  return fallback;
}

/**
 * Maps ReportRow[] to objects matching the column keys for Excel export.
 * Handles calculated fields (CTR, conversions, CPA) as needed.
 */
function getStringOrNumberOrUndefined(obj: Record<string, unknown>, key: string): string | number | undefined {
  const val = obj[key];
  return (typeof val === "string" || typeof val === "number") ? val : undefined;
}

export function mapRowsForXlsx(
  rows: ReportRow[],
  breakdown: string,
  opts: {
    conversionCountMetricId?: string;
    cpaMetricId?: string;
    clicksMetricId?: string;
    impressionsMetricId?: string;
    includeClicks?: boolean;
    includeCTR?: boolean;
    includeUrl?: boolean;
    includeThumbnail?: boolean;
  } = {}
): Record<string, (string | number | undefined)>[] {
  const {
    conversionCountMetricId,
    cpaMetricId,
    clicksMetricId,
    impressionsMetricId,
    includeClicks,
    includeCTR,
    includeUrl,
    includeThumbnail,
  } = opts;
  return rows.map((row) => {
    const mapped: Record<string, string | number | undefined> = {};
    if (breakdown === "item_breakdown") {
      mapped["item"] = row.item ?? "";
      mapped["item_name"] = row.item_name ?? "";
      mapped["spent"] = row.spent ?? 0;
      // Clicks
      if (includeClicks || clicksMetricId) {
        let clicks = getStringOrNumberOrUndefined(row.dynamic_metrics ?? {}, clicksMetricId ?? "clicks");
        if (clicks == null && Object.prototype.hasOwnProperty.call(row, clicksMetricId ?? "clicks")) {
          clicks = getStringOrNumberOrUndefined(row, clicksMetricId ?? "clicks");
        }
        mapped["clicks"] = typeof clicks === "number" ? clicks : (typeof clicks === "string" ? Number(clicks) : undefined);
      }
      // Impressions
      let impressions: number | undefined;
      if (impressionsMetricId) {
        let imp = getStringOrNumberOrUndefined(row.dynamic_metrics ?? {}, impressionsMetricId);
        if (imp == null && Object.prototype.hasOwnProperty.call(row, impressionsMetricId)) {
          imp = getStringOrNumberOrUndefined(row, impressionsMetricId);
        }
        impressions = typeof imp === "number" ? imp : (typeof imp === "string" ? Number(imp) : undefined);
      }
      // CTR
      if (includeCTR || (clicksMetricId && impressionsMetricId)) {
        const clicks = mapped["clicks"];
        if (typeof clicks === "number" && typeof impressions === "number" && impressions > 0) {
          mapped["ctr"] = clicks / impressions;
        } else {
          mapped["ctr"] = undefined;
        }
      }
      // URL & Thumbnail
      if (includeUrl) {
        mapped["url"] = row.url ?? "";
      }
      if (includeThumbnail) {
        mapped["thumbnail_url"] = row.thumbnail_url ?? "";
      }
    } else {
      // Dimension columns
      if (breakdown === "campaign_breakdown") {
        mapped["campaign"] = row.campaign ?? "";
        mapped["campaign_name"] = row.campaign_name ?? "";
      } else if (["day", "week", "month"].includes(breakdown)) {
        mapped["date"] = row.date?.split(" ")[0] ?? "";
      } else {
        const dimKey = breakdown.replace("_breakdown", "").toLowerCase();
        const dimVal = getStringOrNumberOrUndefined(row, dimKey);
        mapped[dimKey] = dimVal !== undefined ? dimVal : "";
      }
      mapped["spent"] = row.spent ?? 0;
      // Clicks
      if (includeClicks || clicksMetricId) {
        let clicks = row.dynamic_metrics?.[clicksMetricId ?? "clicks"];
        if (clicks == null && Object.prototype.hasOwnProperty.call(row, clicksMetricId ?? "clicks")) {
          clicks = getStringOrNumberOrUndefined(row, clicksMetricId ?? "clicks");
        }
        mapped["clicks"] = typeof clicks === "number" ? clicks : (typeof clicks === "string" ? Number(clicks) : undefined);
      }
      // Impressions
      let impressions: number | undefined;
      if (impressionsMetricId) {
        let imp = getStringOrNumberOrUndefined(row.dynamic_metrics ?? {}, impressionsMetricId);
        if (imp == null && Object.prototype.hasOwnProperty.call(row, impressionsMetricId)) {
          imp = getStringOrNumberOrUndefined(row, impressionsMetricId);
        }
        impressions = typeof imp === "number" ? imp : (typeof imp === "string" ? Number(imp) : undefined);
      }
      // CTR
      if (includeCTR || (clicksMetricId && impressionsMetricId)) {
        const clicks = mapped["clicks"];
        if (typeof clicks === "number" && typeof impressions === "number" && impressions > 0) {
          mapped["ctr"] = clicks / impressions;
        } else {
          mapped["ctr"] = undefined;
        }
      }
    }
    // Conversion count
    if (conversionCountMetricId) {
      let countVal = getStringOrNumberOrUndefined(row.dynamic_metrics ?? {}, conversionCountMetricId);
      if (countVal == null && Object.prototype.hasOwnProperty.call(row, conversionCountMetricId)) {
        const rawVal = getStringOrNumberOrUndefined(row, conversionCountMetricId);
        countVal = rawVal;
      }
      // Fallbacks for common conversion fields
      if (countVal == null) {
        countVal =
          getStringOrNumberOrUndefined(row, "cpa_actions_num_from_clicks") ??
          getStringOrNumberOrUndefined(row, "actions") ??
          getStringOrNumberOrUndefined(row, "conversions") ??
          getStringOrNumberOrUndefined(row, "actions_num") ??
          getStringOrNumberOrUndefined(row, "conversions_num") ??
          undefined;
      }
      // Log for diagnostics (first row only)
      if (row === rows[0]) {
        console.log("[MAP] conv id", conversionCountMetricId, "val", countVal, "row keys", Object.keys(row));
      }
      mapped["conversionCount"] = typeof countVal === "number" ? countVal : (typeof countVal === "string" ? Number(countVal) : undefined);
    }
    // CPA
    if (cpaMetricId) {
      let cpaVal = getStringOrNumberOrUndefined(row.dynamic_metrics ?? {}, cpaMetricId);
      if (cpaVal == null && Object.prototype.hasOwnProperty.call(row, cpaMetricId)) {
        const rawVal = getStringOrNumberOrUndefined(row, cpaMetricId);
        cpaVal = rawVal;
      }
      mapped["cpa"] = typeof cpaVal === "number" ? cpaVal : (typeof cpaVal === "string" ? Number(cpaVal) : undefined);
    }
    return mapped;
  });
}

/**
 * Builds an Excel worksheet from report rows and column schema.
 * @param worksheet ExcelJS.Worksheet
 * @param rows Array of ReportRow
 * @param columns Array of column definitions { header, key, width }
 */
function buildWorksheet(
  worksheet: ExcelJS.Worksheet,
  rows: Record<string, string | number | undefined>[],
  columns: { header: string; key: string; width?: number; style?: Partial<ExcelJS.Style> }[]
) {
  worksheet.columns = columns;
  rows.forEach(row => {
    worksheet.addRow(row);
  });
}

/**
 * Builds a single-sheet workbook and saves to a temp file.
 * @param rows Array of ReportRow
 * @param breakdown Breakdown name
 * @param columns Array of column definitions
 * @returns Absolute path to the saved XLSX file
 */
export async function buildWorkbookSingle(
  rows: Record<string, string | number | undefined>[],
  breakdown: string,
  columns: { header: string; key: string; width?: number; style?: Partial<ExcelJS.Style> }[],
  opts?: { accountName?: string; startDate?: string; endDate?: string; cpaGoal?: number }
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(breakdown);
  buildWorksheet(worksheet, rows, columns);

  // Highlight CPA cells below goal
  if (opts?.cpaGoal && columns.some(col => col.key === "cpa")) {
    const cpaColIdx = columns.findIndex(col => col.key === "cpa") + 1;
    if (cpaColIdx > 0) {
      for (let i = 2; i <= worksheet.rowCount; i++) { // skip header
        const cell = worksheet.getRow(i).getCell(cpaColIdx);
        const val = typeof cell.value === "object" && cell.value && "result" in cell.value
          ? (cell.value as any).result
          : cell.value;
        if (typeof val === "number" && val < opts.cpaGoal!) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFB6FFB6" }, // light green
          };
        }
      }
    }
  }

  const dir = getDownloadDir();
  const safe = (s?: string) => (s || "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const account = safe(opts?.accountName);
  const start = safe(opts?.startDate);
  const end = safe(opts?.endDate);
  const filePath = path.join(
    dir,
    `RealizeReport-${account ? account + "-" : ""}${breakdown}${start && end ? `-${start}_to_${end}` : ""}.xlsx`
  );
  console.log("[XLSX] Attempting to write file:", filePath);
  try {
    await workbook.xlsx.writeFile(filePath);
    console.log("[XLSX] Successfully wrote file:", filePath);
    return filePath;
  } catch (err) {
    console.error("[XLSX] Error writing file:", filePath, err);
    throw err;
  }
}

/**
 * Builds a multi-sheet workbook from a map of breakdowns to rows.
 * @param breakdownMap Object mapping breakdown name to ReportRow[]
 * @param columnsMap Object mapping breakdown name to column definitions
 * @returns Absolute path to the saved XLSX file
 */
export async function buildWorkbookMulti(
  breakdownMap: Record<string, Record<string, string | number | undefined>[]>,
  columnsMap: Record<string, { header: string; key: string; width?: number; style?: Partial<ExcelJS.Style> }[]>,
  opts?: { accountName?: string; startDate?: string; endDate?: string; cpaGoal?: number }
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  for (const [breakdown, rows] of Object.entries(breakdownMap)) {
    const worksheet = workbook.addWorksheet(breakdown);
    const columns = columnsMap[breakdown] || [];
    buildWorksheet(worksheet, rows, columns);

    // Highlight CPA cells below goal
    if (opts?.cpaGoal && columns.some(col => col.key === "cpa")) {
      const cpaColIdx = columns.findIndex(col => col.key === "cpa") + 1;
      if (cpaColIdx > 0) {
        for (let i = 2; i <= worksheet.rowCount; i++) { // skip header
          const cell = worksheet.getRow(i).getCell(cpaColIdx);
          const val = typeof cell.value === "object" && cell.value && "result" in cell.value
            ? (cell.value as any).result
            : cell.value;
          if (typeof val === "number" && val < opts.cpaGoal!) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFB6FFB6" }, // light green
            };
          }
        }
      }
    }
  }
  const dir = getDownloadDir();
  const safe = (s?: string) => (s || "").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const account = safe(opts?.accountName);
  const start = safe(opts?.startDate);
  const end = safe(opts?.endDate);
  const filePath = path.join(
    dir,
    `RealizeReport-${account ? account + "-" : ""}${start && end ? `-${start}_to_${end}` : ""}.xlsx`
  );
  console.log("[XLSX] Attempting to write file:", filePath);
  try {
    await workbook.xlsx.writeFile(filePath);
    console.log("[XLSX] Successfully wrote file:", filePath);
    return filePath;
  } catch (err) {
    console.error("[XLSX] Error writing file:", filePath, err);
    throw err;
  }
}
