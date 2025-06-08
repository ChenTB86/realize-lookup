// src/lib/reportService.ts
import { BASE_URL } from "./config";
import { getAuthHeader } from "./auth";

// Node.js stream-json imports for streaming large JSON responses
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";
import { pick } from "stream-json/filters/Pick";
import { chain } from "stream-chain";
import https from "https";
import { IncomingMessage } from "http";

// Interface for dynamic fields within each report row result
interface DynamicFieldValue {
  id: string; // This is the metric ID
  value: number | string;
}

export interface ReportRow {
  date?: string;
  spent: number;
  campaign?: string;
  item?: string;
  site?: string;
  country?: string;
  platform?: string;
  creative?: string;
  hour_of_day?: string | number;
  item_name?: string;
  campaign_name?: string;
  url?: string;
  thumbnail_url?: string;
  currency?: string;
  
  // Standard conversion metrics (if API returns them directly like this)
  actions?: number;
  actions_num_from_clicks?: number;
  actions_num_from_views?: number;
  conversions_value?: number;
  roas?: number;
  cvr?: number;
  cvr_clicks?: number;
  cvr_views?: number;
  cpa?: number;
  cpa_clicks?: number;
  cpa_views?: number;

  // For storing parsed dynamic fields: metric_id -> value
  dynamic_metrics?: Record<string, number | string>; 
  [key: string]: unknown; // Allow other potential fields
}

export interface SubAccountReportRow {
  content_provider: string;
  content_provider_id: string;
  spent: number;
}

// For metadata about dynamic fields from the main API response
interface DynamicFieldMeta {
    id: string;
    format: string;
    data_type: string;
    caption: string;
}

interface ReportAPIResponse {
  "last-used-rawdata-update-time"?: string;
  "last-used-rawdata-update-time-gmt-millisec"?: number;
  timezone?: string;
  results: (ReportRow | null)[]; // API returns ReportRow-like objects, which might have dynamic_fields or nulls
  metadata?: {
    total?: number;
    count?: number;
    static_fields?: unknown[];
    static_total_fields?: unknown[];
    dynamic_fields?: DynamicFieldMeta[] | null; // This is key for captions
    start_date?: string | null;
    end_date?: string | null;
  };
}

export interface FetchReportResult {
  rows: ReportRow[];
  dynamicFieldCaptions: Record<string, string>; // metric_id -> caption
}

/**
 * Stream and paginate site_breakdown results without loading the full response into memory.
 * Returns 10 sites per page, up to 5 pages (50 sites max).
 */
export async function fetchSiteBreakdownPaged(
  accountIdSlug: string,
  startDate: string,
  endDate: string,
  conversionRuleId?: string | null,
  includeMultiConversions?: boolean,
  page: number = 1
): Promise<{ rows: ReportRow[]; totalAvailable: number }> {
  if (page < 1 || page > 5) throw new Error("Page must be between 1 and 5");
  const headers = await getAuthHeader();
  const qs = `?start_date=${startDate}&end_date=${endDate}` +
    (conversionRuleId ? `&conversion_rule_id=${encodeURIComponent(conversionRuleId)}` : "") +
    (includeMultiConversions ? `&include_multi_conversions=true` : "");
  const url = `${BASE_URL}/api/1.0/${accountIdSlug}/reports/campaign-summary/dimensions/site_breakdown${qs}`;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers,
    };

    const rows: ReportRow[] = [];
    let resultsCount = 0;
    let errorOccurred = false;

    const req = https.request(options, (res: IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 400) {
        errorOccurred = true;
        reject(new Error(`API error: ${res.statusCode}`));
        res.resume();
        return;
      }

      // Stream just the "results" array using pick and streamArray
      const pipeline = chain([
        res,
        parser(),
        pick({ filter: "results" }),
        streamArray(),
      ]);

      pipeline.on("data", (data: any) => {
        if (errorOccurred) return;
        if (resultsCount < 50) rows.push(data.value);
        resultsCount++;
        if (rows.length >= 50) {
          const startIdx = (page - 1) * 10;
          const endIdx   = startIdx + 10;
          resolve({ rows: rows.slice(startIdx, endIdx), totalAvailable: resultsCount });
          pipeline.destroy();
        }
      });

      pipeline.on("end", () => {
        if (!errorOccurred && rows.length < 50) {
          const startIdx = (page - 1) * 10;
          const endIdx = startIdx + 10;
          resolve({ rows: rows.slice(startIdx, endIdx), totalAvailable: resultsCount });
        }
      });

      pipeline.on("error", (err: any) => {
        errorOccurred = true;
        reject(err);
      });
    });

    req.on("error", (err: unknown) => {
      errorOccurred = true;
      reject(err);
    });

    req.end();
  });
}

export async function fetchReport(
  accountIdSlug: string,
  breakdown: string,
  startDate: string,
  endDate: string,
  conversionRuleId?: string | null,
  includeMultiConversions?: boolean,
): Promise<FetchReportResult> { // Return type changed
  console.log(`[ReportSvc][DEBUG] fetchReport called with: accountIdSlug=${accountIdSlug}, breakdown=${breakdown}, startDate=${startDate}, endDate=${endDate}, conversionRuleId=${conversionRuleId}, includeMultiConversions=${includeMultiConversions}`);
  const headers = await getAuthHeader();
  const isByAd = breakdown === "item_breakdown";
  const endpoint = isByAd ? "top-campaign-content" : "campaign-summary";
  
  let qs = `?start_date=${startDate}&end_date=${endDate}`;

  if (isByAd) qs += `&dimensions=${breakdown}`;
  
  if (conversionRuleId) {
    qs += `&conversion_rule_id=${encodeURIComponent(conversionRuleId)}`;
    if (includeMultiConversions) {
      qs += `&include_multi_conversions=true`;
    }
  }

  const url = `${BASE_URL}/api/1.0/${accountIdSlug}/reports/${endpoint}/dimensions/${breakdown}${qs}`;
  console.log(`[ReportSvc] API Call: ${url}`);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => `HTTP ${res.status}`);
    console.error(`[ReportSvc] fetchReport API ERROR ${res.status} for ${url}: ${errorBody}`);
    throw new Error(`API ${res.status} (fetchReport)`);
  }

  // Check Content-Length header to avoid OOM on huge responses
  const contentLength = res.headers.get("content-length");
  const MAX_BYTES = 20 * 1024 * 1024; // 20MB
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    console.error(`[ReportSvc][ERROR] API response too large (${contentLength} bytes). Please reduce your date range or breakdown granularity.`);
    throw new Error("API response too large. Please reduce your date range or breakdown granularity.");
  }
  
  const jsonResponse = (await res.json()) as ReportAPIResponse;
  console.log("[ReportSvc][DEBUG] Full API response jsonResponse:", JSON.stringify(jsonResponse, null, 2));
  const dynamicFieldCaptions: Record<string, string> = {};

  if (jsonResponse.metadata?.dynamic_fields) {
    for (const fieldMeta of jsonResponse.metadata.dynamic_fields) {
      dynamicFieldCaptions[fieldMeta.id] = fieldMeta.caption;
    }
    console.log(`[ReportSvc][DEBUG] dynamicFieldCaptions:`, dynamicFieldCaptions);
  } else {
    if (conversionRuleId) {
      console.warn(`[ReportSvc][WARN] No dynamic_fields found in metadata, but conversionRuleId was provided: ${conversionRuleId}`);
    }
  }

  // Limit the number of rows to avoid out-of-memory errors
  const MAX_ROWS = 10000;
  let truncated = false;
  let results: (ReportRow | null)[] = jsonResponse.results || [];
  if (results.length > MAX_ROWS) {
    console.warn(
      `[ReportSvc][WARN] API returned ${results.length} rows, truncating to first ${MAX_ROWS} to avoid memory issues.`
    );
    truncated = true;
    results = results.slice(0, MAX_ROWS);
  }

  const filteredRows: ReportRow[] = [];
  for (const row of results) {
    if (row !== null && typeof row.spent === "number") {
      filteredRows.push(row as ReportRow);
    }
  }
  const processedRows = filteredRows.map(row => {
    const parsedDynamicMetrics: Record<string, number | string> = {};
    if (Array.isArray(row.dynamic_fields)) { // Ensure dynamic_fields is an array
      (row.dynamic_fields as DynamicFieldValue[]).forEach(df => {
        parsedDynamicMetrics[df.id] = df.value;
      });
    }
    return { ...row, dynamic_metrics: parsedDynamicMetrics };
  });

  if (truncated) {
    console.warn(
      `[ReportSvc][WARN] Only the first ${MAX_ROWS} rows are returned. Please reduce your date range or breakdown for more precise results.`
    );
  }
  
  console.log(`[ReportSvc] Fetched ${processedRows.length} report rows for AccID ${accountIdSlug}.`);
  return { rows: processedRows, dynamicFieldCaptions };
}

// fetchSubAccountBreakdown remains the same as report_service_log_cleanup_final
export async function fetchSubAccountBreakdown(
  networkAccountIdSlug: string,
  startDate: string,
  endDate: string
): Promise<SubAccountReportRow[]> {
  const headers = await getAuthHeader();
  const breakdownDimension = "content_provider_breakdown";
  const qs = `?start_date=${startDate}&end_date=${endDate}&orderBy=-spent`;
  const url = `${BASE_URL}/api/1.0/${networkAccountIdSlug}/reports/campaign-summary/dimensions/${breakdownDimension}${qs}`;

  // Log the full request URL for debugging
  console.log(`[ReportSvc] API Call (SubAccounts): ${url}`);
  // Also log the parameters for clarity
  console.log(`[ReportSvc] SubAccount Drilldown Params:`, {
    networkAccountIdSlug,
    startDate,
    endDate,
    endpoint: url
  });

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => `HTTP ${res.status}`);
    console.error(`[ReportSvc] fetchSubAcc API ERROR ${res.status} for ${url}: ${errorBody}`);
    throw new Error(`API ${res.status} (fetchSubAccountBreakdown)`);
  }
  const json = (await res.json()) as { results: SubAccountReportRow[] | null };
  return Array.isArray(json.results) ? json.results : [];
}
