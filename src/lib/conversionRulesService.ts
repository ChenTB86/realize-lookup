// src/lib/conversionRulesService.ts
import { LocalStorage, showToast, Toast } from "@raycast/api";
import { getAuthHeader } from "./auth";
import { BASE_URL } from "./config";

interface ApiUnipConversionRule {
  id: number;
  display_name: string;
  category?: string;
  status?: string;
  type?: string;
  event_name?: string;
  include_in_total_conversions?: boolean;
  advertiser_id?: string | number;
}
export interface ApiConversionRuleWrapper {
  last_received: string | null;
  total_received: number | null;
  unip_conversion_rule: ApiUnipConversionRule;
}

export interface ConversionRule {
  id: string;
  display_name: string;
  category?: string;
  status?: string;
  rule_type?: string;
  event_name?: string;
  last_received?: string | null;
  total_received?: number | null;
  include_in_total_conversions?: boolean;
  advertiser_id?: string | number;
  cpaGoal?: number; // Added CPA Goal
}

const PRIMARY_RULE_STORAGE_PREFIX = "primaryConversionRule_realize_";

/**
 * In-memory promise cache for fetchConversionRules to deduplicate requests per account slug.
 */
const ruleFetchCache: Record<string, Promise<ConversionRule[]>> = {};

// fetchConversionRules remains the same as conversion_rules_service_final_may12_v3
export async function fetchConversionRules(accountIdSlug: string): Promise<ConversionRule[]> {
  // Return cached promise if one is already inflight or fulfilled
  // Only return cached promise if it is defined and not undefined/null
  if (Object.prototype.hasOwnProperty.call(ruleFetchCache, accountIdSlug)) return ruleFetchCache[accountIdSlug];

  ruleFetchCache[accountIdSlug] = (async () => {
    console.log(`[CnvRuleSvc] Fetching rules for Account Slug: ${accountIdSlug}`);
    const headers = await getAuthHeader();
    const url = `${BASE_URL}/api/1.0/${accountIdSlug}/universal_pixel/conversion_rule/data`;

    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[CnvRuleSvc] API 404 (No rules) for slug: ${accountIdSlug}`);
          return [];
        }
        const errorBody = await response.text().catch(() => `HTTP ${response.status}`);
        console.error(`[CnvRuleSvc] API error for slug ${accountIdSlug}: ${response.status} - ${errorBody}`);
        throw new Error(`API ${response.status} fetching rules`);
      }

      const jsonResponse = await response.json();
      let itemsToParse: ApiConversionRuleWrapper[];

      function hasResultsArray(obj: unknown): obj is { results: ApiConversionRuleWrapper[] } {
        return (
          typeof obj === "object" &&
          obj !== null &&
          "results" in obj &&
          Array.isArray((obj as { results: unknown }).results)
        );
      }

      if (Array.isArray(jsonResponse)) {
        itemsToParse = jsonResponse as ApiConversionRuleWrapper[];
      } else if (hasResultsArray(jsonResponse)) {
        itemsToParse = jsonResponse.results;
      } else {
        console.error(`[CnvRuleSvc] Unexpected response for slug ${accountIdSlug}. Got:`, jsonResponse);
        return [];
      }

      const rules: ConversionRule[] = itemsToParse.map(item => ({
        id: String(item.unip_conversion_rule.id),
        display_name: item.unip_conversion_rule.display_name,
        category: item.unip_conversion_rule.category,
        status: item.unip_conversion_rule.status,
        rule_type: item.unip_conversion_rule.type,
        event_name: item.unip_conversion_rule.event_name,
        last_received: item.last_received,
        total_received: item.total_received,
        include_in_total_conversions: item.unip_conversion_rule.include_in_total_conversions,
        advertiser_id: item.unip_conversion_rule.advertiser_id,
        // cpaGoal will be loaded/saved separately or as part of the primary rule object
      }));
      console.log(`[CnvRuleSvc] Processed ${rules.length} rules for slug: ${accountIdSlug}. Rules:`, rules);
      return rules;
    } catch (error) {
      console.error(`[CnvRuleSvc] Fetch rules general ERROR for slug ${accountIdSlug}:`, error);
      throw error;
    }
  })();

  // Ensure cache entry is cleared on error
  return ruleFetchCache[accountIdSlug].catch(err => {
    delete ruleFetchCache[accountIdSlug];
    throw err;
  });
}


// Modified to include cpaGoal in the saved object
export async function savePrimaryRule(accountIdSlug: string, rule: ConversionRule): Promise<void> {
  try {
    // The 'rule' object passed here should already have the cpaGoal if set in the form
    await LocalStorage.setItem(`${PRIMARY_RULE_STORAGE_PREFIX}${accountIdSlug}`, JSON.stringify(rule));
    console.log(`[CnvRuleSvc] Saved primary rule ID ${rule.id} (CPA Goal: ${rule.cpaGoal}) for Acc ${accountIdSlug}.`);
    showToast(Toast.Style.Success, "Primary Rule Saved", `"${rule.display_name}" set as primary.`);
  } catch (error) {
    console.error(`[CnvRuleSvc] Save primary rule ERROR for ${accountIdSlug}:`, error);
    showToast(Toast.Style.Failure, "Could Not Save Rule");
  }
}

// Modified to load cpaGoal from the saved object
export async function loadPrimaryRule(accountIdSlug: string): Promise<ConversionRule | null> {
  try {
    const ruleString = await LocalStorage.getItem<string>(`${PRIMARY_RULE_STORAGE_PREFIX}${accountIdSlug}`);
    if (ruleString) {
      const rule = JSON.parse(ruleString) as ConversionRule; // ConversionRule now includes cpaGoal
      console.log(`[CnvRuleSvc] Loaded primary rule ID ${rule.id} (CPA Goal: ${rule.cpaGoal}) from LocalStorage for slug ${accountIdSlug}.`);
      return rule;
    }
    return null;
  } catch (error) {
    console.error(`[CnvRuleSvc] Load primary rule ERROR for ${accountIdSlug}:`, error);
    return null;
  }
}

export async function clearPrimaryRule(accountIdSlug: string): Promise<void> {
  try {
    await LocalStorage.removeItem(`${PRIMARY_RULE_STORAGE_PREFIX}${accountIdSlug}`);
    showToast(Toast.Style.Success, "Primary Rule Cleared");
  } catch (error) {
    console.error(`[CnvRuleSvc] Clear primary rule ERROR for ${accountIdSlug}:`, error);
    showToast(Toast.Style.Failure, "Could Not Clear Rule");
  }
}
