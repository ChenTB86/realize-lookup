// src/lib/reportFormatter.ts
import { ReportRow } from "./reportService";

const safe = (v: unknown): string => `${v ?? "–"}`.replace(/\|/g, "\\|");
function has<K extends string>(row: ReportRow, key: K): row is ReportRow & Record<K, string | number> {
  return key in row && row[key] != null;
}
function getStringOrNumber(val: unknown): string | number | undefined {
  if (typeof val === "string" || typeof val === "number") return val;
  return undefined;
}

const LINK_ID: Record<string, string> = {
  day: "day",
  week: "week",
  month: "month",
  by_hour_of_day: "hour-of-day",
  campaign_breakdown: "campaigns",
  site_breakdown: "sites", // For "Total Active" label
  country_breakdown: "country",
  platform_breakdown: "platform",
  item_breakdown: "creative", // Corresponds to "Ad" breakdown
};

export const PRETTY_DIMENSION: Record<string, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  by_hour_of_day: "Hour of Day",
  campaign_breakdown: "Campaign",
  site_breakdown: "Site", // Added for "Total Active" label
  country_breakdown: "Country",
  platform_breakdown: "Platform",
  item_breakdown: "Ad",
};

// Generic number formatter for counts
const fmtCount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtPercentage = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });


export interface MarkdownConfig {
  accountName: string;
  accountId: number;
  accountCurrency?: string;
  breakdown: string;
  startDate: string;
  endDate: string;
  rows: ReportRow[]; // This should be the full set of rows for "total active" calculation
  conversionRuleName?: string | null;
  conversionCountMetricId?: string;
  conversionCountCaption?: string;
  cpaMetricId?: string;
  cpaCaption?: string;
  cpaGoalValue?: number;
  // For CTR - these IDs will be passed if CTR is to be shown
  clicksMetricId?: string;       // e.g., "clicks" if that's the metric ID from your API
  impressionsMetricId?: string;  // e.g., "impressions"
}

/**
 * Returns column definitions for a given breakdown and options.
 * Used for both Markdown and XLSX export.
 */
export function getTableColumns(
  breakdown: string,
  opts: {
    conversionCountCaption?: string;
    cpaCaption?: string;
    clicksMetricId?: string;
    impressionsMetricId?: string;
    includeClicks?: boolean;
    includeCTR?: boolean;
    includeUrl?: boolean;
    includeThumbnail?: boolean;
    accountCurrency?: string;
  } = {}
): { header: string; key: string; width?: number; style?: any }[] {
  const {
    conversionCountCaption,
    cpaCaption,
    clicksMetricId,
    impressionsMetricId,
    includeClicks,
    includeCTR,
    includeUrl,
    includeThumbnail,
    accountCurrency = "USD",
  } = opts;
  const currencyFmt = accountCurrency === "USD"
    ? '"$"#,##0'
    : accountCurrency === "EUR"
    ? '"€"#,##0'
    : accountCurrency === "GBP"
    ? '"£"#,##0'
    : '#,##0';
  const columns: { header: string; key: string; width?: number; style?: any }[] = [];
  const isAdBreakdown = breakdown === "item_breakdown";
  if (isAdBreakdown) {
    columns.push({ header: "Item ID", key: "item", width: 16 });
    columns.push({ header: "Item Name", key: "item_name", width: 24 });
    columns.push({ header: "Spent", key: "spent", width: 14, style: { numFmt: currencyFmt } });
    if (includeClicks || clicksMetricId) {
      columns.push({ header: "Clicks", key: "clicks", width: 12, style: { numFmt: "#,##0" } });
    }
    if (includeCTR || (clicksMetricId && impressionsMetricId)) {
      columns.push({ header: "CTR", key: "ctr", width: 10, style: { numFmt: "0.00%" } });
    }
    if (includeUrl) {
      columns.push({ header: "URL", key: "url", width: 32 });
    }
    if (includeThumbnail) {
      columns.push({ header: "Thumbnail", key: "thumbnail_url", width: 32 });
    }
  } else if (breakdown === "campaign_breakdown") {
    columns.push({ header: "Campaign ID", key: "campaign", width: 16 });
    columns.push({ header: "Campaign Name", key: "campaign_name", width: 24 });
    columns.push({ header: "Spent", key: "spent", width: 14, style: { numFmt: currencyFmt } });
    if (includeClicks || clicksMetricId) {
      columns.push({ header: "Clicks", key: "clicks", width: 12, style: { numFmt: "#,##0" } });
    }
    if (includeCTR || (clicksMetricId && impressionsMetricId)) {
      columns.push({ header: "CTR", key: "ctr", width: 10, style: { numFmt: "0.00%" } });
    }
  } else if (["day", "week", "month"].includes(breakdown)) {
    columns.push({ header: "Date", key: "date", width: 14 });
    columns.push({ header: "Spent", key: "spent", width: 14, style: { numFmt: currencyFmt } });
    if (includeClicks || clicksMetricId) {
      columns.push({ header: "Clicks", key: "clicks", width: 12, style: { numFmt: "#,##0" } });
    }
    if (includeCTR || (clicksMetricId && impressionsMetricId)) {
      columns.push({ header: "CTR", key: "ctr", width: 10, style: { numFmt: "0.00%" } });
    }
  } else {
    columns.push({ header: PRETTY_DIMENSION[breakdown] || breakdown, key: breakdown.replace("_breakdown", "").toLowerCase(), width: 18 });
    columns.push({ header: "Spent", key: "spent", width: 14, style: { numFmt: currencyFmt } });
    if (includeClicks || clicksMetricId) {
      columns.push({ header: "Clicks", key: "clicks", width: 12, style: { numFmt: "#,##0" } });
    }
    if (includeCTR || (clicksMetricId && impressionsMetricId)) {
      columns.push({ header: "CTR", key: "ctr", width: 10, style: { numFmt: "0.00%" } });
    }
  }
  if (conversionCountCaption) {
    columns.push({ header: conversionCountCaption, key: "conversionCount", width: 18, style: { numFmt: "#,##0" } });
  }
  if (cpaCaption) {
    columns.push({ header: cpaCaption, key: "cpa", width: 18, style: { numFmt: currencyFmt } });
  }
  return columns;
}

export function buildMarkdown({
  accountName,
  accountId,
  accountCurrency = "USD",
  breakdown,
  startDate,
  endDate,
  rows, // Expecting all rows here for "total active" calculation
  conversionRuleName,
  conversionCountMetricId,
  conversionCountCaption,
  cpaMetricId,
  cpaCaption,
  cpaGoalValue,
  clicksMetricId,      // For CTR
  impressionsMetricId, // For CTR
}: MarkdownConfig): {
  markdown: string;
  guiLink: string;
} {
  console.log(`[ReportFormatter][DEBUG] buildMarkdown called with: conversionRuleName=${conversionRuleName}, conversionCountMetricId=${conversionCountMetricId}, conversionCountCaption=${conversionCountCaption}`);
  const currentFmtCurrency = new Intl.NumberFormat("en-US", { style: "currency", currency: accountCurrency, maximumFractionDigits: 0 });
  const currentFmtCpaNoDecimal = new Intl.NumberFormat("en-US", { style: "currency", currency: accountCurrency, maximumFractionDigits: 0 });

  const headerParts: string[] = [];
  const headerLineParts: string[] = [];

  const isAdBreakdown = breakdown === "item_breakdown";

  if (isAdBreakdown) {
    headerParts.push("Item ID", "Item Name", "Spent");
    headerLineParts.push("---------", "-----------", "-------:");
    // Add CTR header for Ad breakdown if metric IDs are provided
    if (clicksMetricId && impressionsMetricId) {
        headerParts.push("CTR");
        headerLineParts.push("-----:");
    }
  } else if (breakdown === "campaign_breakdown") {
    headerParts.push("Campaign ID", "Campaign Name", "Spent");
    headerLineParts.push("-------------", "---------------", "------:");
  } else if (["day", "week", "month"].includes(breakdown)) {
    headerParts.push("Date", "Spent");
    headerLineParts.push("------", "------:");
  } else { // Includes "site_breakdown" and others
    headerParts.push(PRETTY_DIMENSION[breakdown] || breakdown, "Spent");
    headerLineParts.push("-".repeat(Math.max(3, (PRETTY_DIMENSION[breakdown] || breakdown).length)), "------:");
  }

  if (conversionCountMetricId && conversionCountCaption) {
    headerParts.push(safe(conversionCountCaption));
    headerLineParts.push("-".repeat(Math.max(3, safe(conversionCountCaption).length)) + ":");
  }
  if (cpaMetricId && cpaCaption) {
    headerParts.push(safe(cpaCaption));
    headerLineParts.push("-".repeat(Math.max(3, safe(cpaCaption).length)) + ":");
  }

  const header = `| ${headerParts.join(" | ")} |\n| ${headerLineParts.join(" | ")} |`;

  // Display top 10 rows in the table
  const bodyRows = rows.slice(0, 10).map((r, idx) => {
    let rowString = "| ";
    if (isAdBreakdown) {
      // Use vctr field for CTR column if present
      rowString += `${r.item ?? "–"} | ${has(r, "item_name") ? safe(r.item_name) : "–"} | ${currentFmtCurrency.format(r.spent)} `;
      let ctrDisplay = "–";
      if (typeof r.vctr !== "undefined" && r.vctr !== null) {
        const numericVctr = Number(r.vctr);
        // vctr is in %, so divide by 100. Only show if result is between 0 and 1.
        const vctrFraction = numericVctr / 100;
        if (
          !isNaN(numericVctr) &&
          vctrFraction >= 0 &&
          vctrFraction <= 1
        ) {
          ctrDisplay = fmtPercentage.format(vctrFraction);
        }
      }
      rowString += `| ${ctrDisplay} `;
    } else if (breakdown === "campaign_breakdown") {
      rowString += `${r.campaign ?? "–"} | ${has(r, "campaign_name") ? safe(r.campaign_name) : "–"} | ${currentFmtCurrency.format(r.spent)} `;
    } else if (["day", "week", "month"].includes(breakdown)) {
      rowString += `${r.date?.split(" ")[0] ?? "–"} | ${currentFmtCurrency.format(r.spent)} `;
    } else { // Includes "site_breakdown" and others
      const dimensionValueKey = breakdown.replace("_breakdown", "").toLowerCase(); 
      const dimensionValueRaw = r[dimensionValueKey];
      const dimensionValue = getStringOrNumber(dimensionValueRaw);
      rowString += `${safe(dimensionValue)} | ${currentFmtCurrency.format(r.spent)} `;
    }

    let conversionCountVal: number | null = null;
    let conversionWarning = "";
    if (conversionCountMetricId) {
      // Try dynamic_metrics first, then fallback to top-level field
      let countVal = r.dynamic_metrics ? r.dynamic_metrics[conversionCountMetricId] : undefined;
      if (countVal == null && Object.prototype.hasOwnProperty.call(r, conversionCountMetricId)) {
        countVal = getStringOrNumber(r[conversionCountMetricId]);
      }
      if (countVal != null) {
        const numericCount = Number(countVal);
        if (!isNaN(numericCount)) {
            conversionCountVal = numericCount;
        }
      } else {
        conversionWarning = "⚠️ Conversion data not available for selected rule. Please check API mapping.";
        console.warn(`[ReportFormatter][WARN] Row ${idx}: conversionCountMetricId "${conversionCountMetricId}" missing in dynamic_metrics and top-level fields.`, r);
      }
      rowString += `| ${conversionCountVal != null ? fmtCount.format(conversionCountVal) : conversionWarning || "–"} `;
    }

    if (cpaMetricId) {
      // Try dynamic_metrics first, then fallback to top-level field
      let cpaValFromMetrics = r.dynamic_metrics ? r.dynamic_metrics[cpaMetricId] : undefined;
      if (cpaValFromMetrics == null && Object.prototype.hasOwnProperty.call(r, cpaMetricId)) {
        cpaValFromMetrics = getStringOrNumber(r[cpaMetricId]);
      }
      let cpaDisplay = "–";
      let numericCpa: number | null = null;

      if (cpaValFromMetrics != null) {
        const tempNumericCpa = Number(String(cpaValFromMetrics).replace(/[^0-9.-]+/g,""));
        if (!isNaN(tempNumericCpa)) {
          numericCpa = tempNumericCpa;
          cpaDisplay = currentFmtCpaNoDecimal.format(numericCpa); 
        }
      }
      
      const validCpaGoal = typeof cpaGoalValue === 'number' && !isNaN(cpaGoalValue);

      if (conversionCountVal !== null && conversionCountVal > 0 && 
          validCpaGoal &&
          numericCpa !== null) { 
        if (numericCpa < cpaGoalValue!) { 
          cpaDisplay = `**${cpaDisplay}** 🟢`;
        } else if (numericCpa > cpaGoalValue! * 1.5) { 
          cpaDisplay = `**${cpaDisplay}** 🔴`;
        }
      }
      rowString += `| ${cpaDisplay} `;
    }
    rowString += "|";
    return rowString;
  });

  const totalSpent = rows.reduce((sum, r) => sum + r.spent, 0);
  let totalConversionCount = 0;
  if (conversionCountMetricId) {
    totalConversionCount = rows.reduce((sum, r) => {
        let countVal = r.dynamic_metrics?.[conversionCountMetricId];
        if (countVal == null && Object.prototype.hasOwnProperty.call(r, conversionCountMetricId)) {
          countVal = getStringOrNumber(r[conversionCountMetricId]);
        }
        const numericCount = Number(countVal);
        return sum + (isNaN(numericCount) ? 0 : numericCount);
    },0);
    console.log(`[ReportFormatter][DEBUG] totalConversionCount for metric "${conversionCountMetricId}": ${totalConversionCount}`);
  }

  const totalActiveWithSpent = rows.filter(r => r.spent > 0).length;
  let activeItemsSummary = "";
  if (["campaign_breakdown", "site_breakdown", "item_breakdown"].includes(breakdown)) {
      const itemTypeLabel = (PRETTY_DIMENSION[breakdown] || "items").toLowerCase(); 
      activeItemsSummary = `Total active ${itemTypeLabel} (w/ spend > $0): ${fmtCount.format(totalActiveWithSpent)}\n`;
  }


  let totalLine = `\n**Totals:** Spent: ${currentFmtCurrency.format(totalSpent)}`;
  if (conversionCountMetricId && conversionRuleName) {
    totalLine += `, ${conversionCountCaption || 'Conversions'}: ${fmtCount.format(totalConversionCount)}`;
  }
  totalLine += "\n";

  const reportIdForLink = LINK_ID[breakdown] ?? "campaigns";
  const guiLink = `https://ads.realizeperformance.com/campaigns?accountId=${accountId}&reportId=${reportIdForLink}&startDate=${startDate}&endDate=${endDate}${conversionRuleName ? `&conversionRuleName=${encodeURIComponent(conversionRuleName)}` : ''}`;

  let markdown = `## ${PRETTY_DIMENSION[breakdown] ?? breakdown} Report for ${accountName}\n\n`;
  if (conversionRuleName) {
    markdown += `**Using Conversion Rule:** ${safe(conversionRuleName)}\n`;
    if (cpaGoalValue !== undefined && typeof cpaGoalValue === 'number' && !isNaN(cpaGoalValue)) {
        markdown += `**CPA Goal:** ${currentFmtCurrency.format(cpaGoalValue)}\n`;
    }
    if (conversionCountMetricId && cpaMetricId) {
        markdown += `*(Metrics: "${conversionCountCaption}" & "${cpaCaption}")*\n`;
    } else if (conversionCountMetricId) {
        markdown += `*(Metric: "${conversionCountCaption}")*\n`;
    }
    markdown += "\n";
  }

  markdown += header + "\n" + bodyRows.join("\n") + "\n";
  if(activeItemsSummary) markdown += activeItemsSummary; 
  markdown += totalLine + "\n" + `[See more in Realize ↗](${guiLink})`;

  return { markdown, guiLink };
}
