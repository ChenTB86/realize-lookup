// src/lib/reportService.ts
import { BASE_URL } from "./config";
import { getAuthHeader } from "./auth";

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
  [key: string]: any; // Allow other potential fields
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
  results: ReportRow[]; // API returns ReportRow-like objects, which might have dynamic_fields
  metadata?: {
    total?: number;
    count?: number;
    static_fields?: any[];
    static_total_fields?: any[];
    dynamic_fields?: DynamicFieldMeta[] | null; // This is key for captions
    start_date?: string | null;
    end_date?: string | null;
  };
}

export interface FetchReportResult {
  rows: ReportRow[];
  dynamicFieldCaptions: Record<string, string>; // metric_id -> caption
}

export async function fetchReport(
  accountIdSlug: string,
  breakdown: string,
  startDate: string,
  endDate: string,
  conversionRuleId?: string | null,
  includeMultiConversions?: boolean,
): Promise<FetchReportResult> { // Return type changed
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
  
  const jsonResponse = (await res.json()) as ReportAPIResponse;
  const dynamicFieldCaptions: Record<string, string> = {};

  if (jsonResponse.metadata?.dynamic_fields) {
    for (const fieldMeta of jsonResponse.metadata.dynamic_fields) {
      dynamicFieldCaptions[fieldMeta.id] = fieldMeta.caption;
    }
  }
  // console.log("[ReportSvc] Dynamic Field Captions:", dynamicFieldCaptions);

  const processedRows = (jsonResponse.results || []).map(row => {
    const parsedDynamicMetrics: Record<string, number | string> = {};
    if (Array.isArray(row.dynamic_fields)) { // Ensure dynamic_fields is an array
      (row.dynamic_fields as DynamicFieldValue[]).forEach(df => {
        parsedDynamicMetrics[df.id] = df.value;
      });
    }
    return { ...row, dynamic_metrics: parsedDynamicMetrics };
  });
  
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

  console.log(`[ReportSvc] API Call (SubAccounts): ${url}`);

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => `HTTP ${res.status}`);
    console.error(`[ReportSvc] fetchSubAcc API ERROR ${res.status} for ${url}: ${errorBody}`);
    throw new Error(`API ${res.status} (fetchSubAccountBreakdown)`);
  }
  const json = (await res.json()) as { results: SubAccountReportRow[] };
  return json.results || [];
}
