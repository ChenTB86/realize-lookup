// src/lib/campaignService.ts
import { showToast, Toast } from "@raycast/api";
import { getAuthHeader } from "./auth";
import { BASE_URL } from "./config";

export interface CampaignSetting {
  id: string;
  advertiser_id: string;
  branding_text: string;
  name: string;
  tracking_code?: string;
  cpc?: number;
  daily_cap?: number | null;
  spending_limit?: number | null;
  spending_limit_model?: string;
  country_targeting?: {
    type: "INCLUDE" | "EXCLUDE" | string;
    value: string[];
  };
  sub_country_targeting?: { type: string; value: string[]; href?: string | null } | null;
  postal_code_targeting?: { type: string; value: string[] | null; href?: string | null } | null; // value can be null
  platform_targeting?: {
    type: "INCLUDE" | "EXCLUDE" | string;
    value: string[];
  };
  os_targeting?: { // Updated structure
    type: "ALL" | "INCLUDE" | "EXCLUDE" | string;
    value: Array<{
      os_family?: string; // e.g., "Windows", "iOS"
      sub_categories?: Array<{ // Assuming sub_categories might be objects or strings
        id?: string;
        name?: string;
        // or just string[] if it's simpler
      }>;
    }>;
    href?: string | null;
  };
  publisher_targeting?: {
    type: "INCLUDE" | "EXCLUDE" | string;
    value: string[]; // Array of publisher/site IDs or names
    blocked_sites_by_id?: string[];
    blocked_publishers_by_id?: string[];
    href?: string | null;
  } | null;
  comments?: string | null;
  start_date?: string;
  end_date?: string | null;
  approval_state?: string;
  is_active: boolean;
  spent?: number;
  status: string;
  daily_ad_delivery_model?: string;
  traffic_allocation_mode?: string;
  marketing_objective?: string;
  activity_schedule?: {
    mode: "ALWAYS" | "CUSTOM" | string;
    rules: Array<{ days: string[]; from_hour: number; to_hour: number }>;
    time_zone: string;
  };
  publisher_bid_modifier?: {
    values: Array<{
      target: string;
      cpc_modification: number;
      type?: "PERCENTAGE" | "FIXED_VALUE";
    }>;
    default_bid_modifier_value?: number;
  } | null;
  // Fields from the user's JSON example
  creator?: { id?: number; email?: string };
  pricing_model?: string;
  safety_rating?: string;
  cpa_goal?: number | null;
  min_expected_conversions_for_cpa_goal?: number | null;
  dma_country_targeting?: any; // Define if structure is known
  region_country_targeting?: any; // Define if structure is known
  city_targeting?: any; // Define if structure is known
  contextual_targeting?: any; // Define if structure is known
  auto_publisher_targeting?: any; // Define if structure is known
  connection_type_targeting?: any; // Define if structure is known
  publisher_groups_targeting?: any; // Define if structure is known
  domain_targeting?: any; // Define if structure is known
  platform_bid_modifier?: { values: any[] }; // Define if structure is known
  publisher_platform_bid_modifier?: { values: any[] }; // Define if structure is known
  day_time_bid_modifier?: { values: any[]; time_zone?: string }; // Define if structure is known
  publisher_bid_strategy_modifiers?: { values: any[] }; // Define if structure is known
  campaign_profile?: {
    content_type?: string;
    ad_type?: string;
    content_safety?: string;
    category?: string;
    iab_category?: string;
    language?: string;
  };
  external_campaign_profile?: { campaign_category?: string };
  bid_type?: string;
  bid_strategy?: string;
  external_brand_safety?: { type?: string; values?: any[] };
  campaign_groups?: any; // Define if structure is known
  target_cpa?: number | null;
  learning_state?: string;
  techno_segment_targeting?: any; // Define if structure is known
  conversion_rules?: {
    rules?: Array<{ id?: number; display_name?: string; status?: string; include_in_total_conversions?: boolean }>;
  };
  conversion_configuration?: any; // Define if structure is known
  funnel_template?: any; // Define if structure is known
  start_date_in_utc?: string;
  end_date_in_utc?: string;
  traffic_allocation_ab_test_end_date?: string | null;
  audience_segments_multi_targeting?: any; // Define if structure is known
  contextual_segments_targeting?: any; // Define if structure is known
  custom_contextual_targeting?: any; // Define if structure is known
  audiences_targeting?: any; // Define if structure is known
  custom_audience_targeting?: any; // Define if structure is known
  segments_targeting?: { GENDER?: any; AGE?: any }; // Define if structure is known
  segments_multi_targeting?: any; // Define if structure is known
  marking_label_multi_targeting?: any; // Define if structure isknown
  lookalike_audience_targeting?: any; // Define if structure is known
  predefined_targeting_options?: {
    predefined_premium_site_targeting?: string;
    predefined_brand_safety_targeting?: string;
    predefined_supply_targeting?: string;
  };
  verification_pixel?: string | null;
  viewability_tag?: string | null;
  policy_review?: { reject_reason?: string; reject_reason_description?: string; reviewer_notes?: string | null };
  browser_targeting?: { type?: string; value?: string[]; href?: string | null };
  type?: string; // e.g. "PAID"
  external_metadata?: any; // Define if structure is known
  geo_targeting?: any; // Define if structure is known
  page_zone_targeting?: any; // Define if structure is known
  advanced_publisher_targeting?: any; // Define if structure is known
  is_spend_guard_active?: string;
  frequency_capping_targeting?: { threshold?: number | null; frequency_capping_days?: string };
  finance?: { profit_margin?: number | null };
  campaign_item_type?: string;
  performance_rule_ids?: any[]; // Define if structure is known
  inventory_summary?: { number_of_items?: number; number_of_approved_items?: number; number_of_reject_items?: number };
  budget_additional_parameters?: { pace_ahead_factor?: number };
}

interface CampaignsAPIResponseWrapper {
  results: CampaignSetting[];
  metadata?: {
    total_count?: number;
  };
}

export async function fetchCampaigns(accountIdSlug: string): Promise<CampaignSetting[]> {
  console.log(`[CampaignSvc] Fetching campaigns for Account Slug: ${accountIdSlug}`);
  if (!accountIdSlug) {
    console.error("[CampaignSvc] Account ID Slug is undefined or empty.");
    await showToast(Toast.Style.Failure, "Missing Parameter", "Account ID slug is required to fetch campaigns.");
    return [];
  }
  const headers = await getAuthHeader();
  const url = `${BASE_URL}/api/1.0/${accountIdSlug}/campaigns/`;

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => `HTTP ${response.status}`);
      console.error(`[CampaignSvc] API error for slug ${accountIdSlug} at ${url}: ${response.status} - ${errorBody}`);
      await showToast(Toast.Style.Failure, "API Error", `Failed to fetch campaigns: ${response.status}`);
      throw new Error(`API ${response.status} fetching campaigns`);
    }

    const jsonResponse = await response.json();

    if (jsonResponse && Array.isArray(jsonResponse.results)) {
      console.log(`[CampaignSvc] Fetched ${jsonResponse.results.length} campaigns (from results array).`);
      return jsonResponse.results as CampaignSetting[];
    } else if (Array.isArray(jsonResponse)) {
      console.log(`[CampaignSvc] Fetched ${jsonResponse.length} campaigns (direct array).`);
      return jsonResponse as CampaignSetting[];
    }
    
    console.warn("[CampaignSvc] Unexpected or empty campaign response structure:", jsonResponse);
    return [];

  } catch (error) {
    console.error(`[CampaignSvc] Fetch campaigns general ERROR for slug ${accountIdSlug}:`, error);
    if (!(error instanceof Error && error.message.startsWith("API "))) {
        await showToast(Toast.Style.Failure, "Fetch Error", "Could not fetch campaigns.");
    }
    throw error;
  }
}
