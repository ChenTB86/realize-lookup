// src/components/CampaignDetailView.tsx
import { Detail, ActionPanel, Action, Icon, useNavigation } from "@raycast/api";
import { CampaignSetting } from "../lib/campaignService";

interface CampaignDetailViewProps {
  campaign: CampaignSetting;
  accountCurrency: string;
  accountId: string; // This should be the NUMERIC account ID for the Realize URL
}

// Helper to safely escape Markdown special characters from a string
function escapeMarkdown(text: string | undefined | null): string {
  if (text === null || text === undefined) return "";
  // Only escape if it's not a simple number or common ID-like string
  if (/^[a-zA-Z0-9\s\-:_]+$/.test(String(text)) && String(text).length < 50) {
      return String(text);
  }
  return String(text)
    .replace(/\\/g, "\\\\") 
    .replace(/([_*~`>#+-=|{}.!.{}[\]])/g, "\\$1");
}

// Enhanced formatter
function formatDisplayValue(
  value: unknown,
  currency?: string,
  isCurrencyField = false,
  fieldName?: keyof CampaignSetting | string
): string {
  if (value === null || value === undefined) return "_N/A_";
  
  // ISSUE 3: If it's a number (like an ID) or a string that's purely numeric, don't over-escape
  if (typeof value === 'number' && !isCurrencyField) {
    return String(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value) && fieldName === 'id') { // Specifically for 'id' field if it's a numeric string
      return value;
  }
  // Also, if it's a string that doesn't contain markdown special characters, no need to escape
  if (typeof value === 'string' && !/[_*~`>#+-=|{}.!.{}[\]]/.test(value) && value.length < 50) {
      // For short strings without markdown characters, just return them.
      // This helps with things like "RUNNING", "ACTIVE", "USD", etc.
      // The escapeMarkdown function above also has a similar check now.
      return value;
  }


  if (String(value).trim() === "") return "_N/A_";


  if (isCurrencyField && typeof value === 'number' && currency) {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    } catch {
      return `${currency} ${value.toFixed(2)}`;
    }
  }

  if (typeof value === 'boolean') return value ? "**Yes**" : "No";

  if (Array.isArray(value)) {
    if (value.length === 0) return "_Empty_";
    if (fieldName === "os_targeting_value" && value.every(item => typeof item === 'object' && item !== null && 'os_family' in item)) {
        return value.map(os => escapeMarkdown(os.os_family || "Unknown OS")).filter(Boolean).join(", ") || "_N/A_";
    }
    return value.map(item => escapeMarkdown(String(item))).filter(Boolean).join(", ") || "_Empty_";
  }

  if (typeof value === 'object' && value !== null) {
    if (('type' in value) && ('value' in value)) {
        const type = escapeMarkdown(String(value.type)); // Ensure type is string before escape
        const val = Array.isArray(value.value) ?
                      (value.value.length > 0 ? value.value.map((v: unknown) => escapeMarkdown(String(v))).filter(Boolean).join(", ") : "_Empty Array_")
                      : escapeMarkdown(String(value.value));
        let display = `**Type:** ${type}`;
        if (val && val !== "_Not specified_" && val !== "_Empty Array_") display += `\n  - **Value:** ${val}`;
        else if (type.toLowerCase() === "all" || type.toLowerCase() === "none") display = type;
        else display += `\n  - **Value:** _Not specified_`;
        return display;
    }
    const content = Object.entries(value)
      .map(([k, v]) => `  - **${escapeMarkdown(k)}:** ${formatDisplayValue(v, currency)}`) // Recursive call for nested objects
      .join("\n");
    return content || "_Empty Object_";
  }
  // Default to escapeMarkdown for strings not caught by earlier specific conditions
  return escapeMarkdown(String(value));
}


export default function CampaignDetailView({ campaign, accountCurrency, accountId }: CampaignDetailViewProps) {
  const { pop } = useNavigation();

  // Use the numeric accountId passed as a prop for the Realize URL
  const realizeCampaignUrl = `https://ads.realizeperformance.com/campaigns?locale=en&accountId=${accountId}&dimension=SPONSORED&reportEntityIds=${campaign.id}&reportEntityType=CAMPAIGN&reportId=campaign`;

  // Main campaign ID for display
  const displayCampaignId = formatDisplayValue(campaign.id, undefined, false, "id");

  const markdown = `
# Campaign: ${formatDisplayValue(campaign.name)}
**(ID: ${displayCampaignId})**

## General
- **Status:** ${formatDisplayValue(campaign.status)}
- **Active:** ${formatDisplayValue(campaign.is_active)}
- **Branding Text:** ${formatDisplayValue(campaign.branding_text)}
- **Marketing Objective:** ${formatDisplayValue(campaign.marketing_objective)}
- **Advertiser ID (Slug):** ${formatDisplayValue(campaign.advertiser_id)}
${campaign.creator ? `- **Creator:** ${formatDisplayValue(campaign.creator.email, undefined, false, "creator_email")}` : ''}

## Budget & Bidding
- **Pricing Model:** ${formatDisplayValue(campaign.pricing_model)}
- **CPC:** ${formatDisplayValue(campaign.cpc, accountCurrency, true)}
- **Daily Cap:** ${formatDisplayValue(campaign.daily_cap, accountCurrency, true)}
- **Spending Limit:** ${formatDisplayValue(campaign.spending_limit, accountCurrency, true)}
- **Spending Limit Model:** ${formatDisplayValue(campaign.spending_limit_model)}
- **Bid Type:** ${formatDisplayValue(campaign.bid_type)}
- **Bid Strategy:** ${formatDisplayValue(campaign.bid_strategy)}
- **CPA Goal:** ${formatDisplayValue(campaign.cpa_goal, accountCurrency, true)}
- **Target CPA:** ${formatDisplayValue(campaign.target_cpa, accountCurrency, true)}

## Delivery
- **Daily Ad Delivery:** ${formatDisplayValue(campaign.daily_ad_delivery_model)}
- **Traffic Allocation:** ${formatDisplayValue(campaign.traffic_allocation_mode)}
- **Learning State:** ${formatDisplayValue(campaign.learning_state)}

## Schedule
- **Start Date:** ${formatDisplayValue(campaign.start_date)}
- **End Date:** ${formatDisplayValue(campaign.end_date)}
${campaign.activity_schedule ? `
### Activity Schedule
- **Mode:** ${formatDisplayValue(campaign.activity_schedule.mode)}
- **Time Zone:** ${formatDisplayValue(campaign.activity_schedule.time_zone)}
${campaign.activity_schedule.rules && campaign.activity_schedule.rules.length > 0 ? `- **Rules:** \n${campaign.activity_schedule.rules.map(r => `    - Days: ${formatDisplayValue(r.days)}, From: ${r.from_hour}, To: ${r.to_hour}`).join("\n")}` : ''}
` : '- **Activity Schedule:** _N/A_'}

## Targeting

### Location
- **Country Targeting:** ${campaign.country_targeting ? `\n  - **Type:** ${formatDisplayValue(campaign.country_targeting.type)}\n  - **Value:** ${formatDisplayValue(campaign.country_targeting.value)}` : '_N/A_'}
- **Sub-Country Targeting:** ${formatDisplayValue(campaign.sub_country_targeting, undefined, false, "sub_country_targeting")}
- **Postal Code Targeting:** ${formatDisplayValue(campaign.postal_code_targeting, undefined, false, "postal_code_targeting")}

### Device & OS
- **Platform Targeting:** ${campaign.platform_targeting ? `\n  - **Type:** ${formatDisplayValue(campaign.platform_targeting.type)}\n  - **Value:** ${formatDisplayValue(campaign.platform_targeting.value)}` : '_N/A_'}
- **OS Targeting:** ${campaign.os_targeting ? `\n  - **Type:** ${formatDisplayValue(campaign.os_targeting.type)}\n  - **Value:** ${formatDisplayValue(campaign.os_targeting.value, undefined, false, "os_targeting_value")}` : '_N/A_'}
- **Browser Targeting:** ${formatDisplayValue(campaign.browser_targeting, undefined, false, "browser_targeting")}

### Publisher & Content
- **Publisher Targeting:** ${formatDisplayValue(campaign.publisher_targeting, undefined, false, "publisher_targeting")}
- **Contextual Targeting:** ${formatDisplayValue(campaign.contextual_targeting, undefined, false, "contextual_targeting")}
- **IAB Category:** ${formatDisplayValue(campaign.campaign_profile?.iab_category)}
- **Language:** ${formatDisplayValue(campaign.campaign_profile?.language)}

### Audiences
- **Audiences Targeting:** ${formatDisplayValue(campaign.audiences_targeting, undefined, false, "audiences_targeting")}
- **Lookalike Audience Targeting:** ${formatDisplayValue(campaign.lookalike_audience_targeting, undefined, false, "lookalike_audience_targeting")}
- **Segments (Gender/Age):** ${formatDisplayValue(campaign.segments_targeting, undefined, false, "segments_targeting")}


## Other Settings
- **Tracking Code:** ${formatDisplayValue(campaign.tracking_code)}
- **Comments:** ${formatDisplayValue(campaign.comments)}
- **Approval State:** ${formatDisplayValue(campaign.approval_state)}
${campaign.policy_review && campaign.policy_review.reject_reason ? `- **Policy Review:** ${formatDisplayValue(campaign.policy_review.reject_reason)} (${formatDisplayValue(campaign.policy_review.reject_reason_description)})` : ''}
- **Conversion Rules:** ${campaign.conversion_rules?.rules?.map(r => `${formatDisplayValue(r.display_name)} (ID: ${formatDisplayValue(r.id)})`).join(', ') || '_N/A_'}

---
*For detailed debugging, you can copy the full JSON configuration via actions.*
`;

  return (
    <Detail
      markdown={markdown}
      navigationTitle={`Campaign: ${campaign.name.substring(0,25)}${campaign.name.length > 25 ? '...' : ''} (Config)`}
      actions={
        <ActionPanel>
          <Action title="Go Back" icon={Icon.ArrowLeft} onAction={pop} shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }}/>
          <Action.OpenInBrowser
            title="Open Campaign in Realize Gui"
            url={realizeCampaignUrl} // Uses numeric accountId from props
            icon={Icon.Globe}
          />
          <Action.CopyToClipboard
            title="Copy Campaign ID"
            content={String(campaign.id)} // Ensure content is string
            shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
          />
          <Action.CopyToClipboard
            title="Copy Campaign Name"
            content={campaign.name}
            shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
          />
           <Action.CopyToClipboard
            title="Copy Full JSON Configuration"
            content={JSON.stringify(campaign, null, 2)}
            shortcut={{ modifiers: ["cmd", "shift"], key: "j" }}
          />
        </ActionPanel>
      }
    />
  );
}
