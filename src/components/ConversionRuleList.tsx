// src/components/ConversionRuleList.tsx
import { List, ActionPanel, Action, showToast, Toast, Icon, Color, useNavigation, Detail } from "@raycast/api";
import { useEffect, useState, useMemo } from "react";
import { fetchConversionRules, ConversionRule } from "../lib/conversionRulesService";

interface ConversionRuleListProps {
  listTitle: string;
  accountIdToFetch: string; // This MUST be the string slug for the API call
  onRuleSelected: (rule: ConversionRule) => void;
  onNoRulesFound?: (accountIdFetched: string) => void;
  currentPrimaryRuleId?: string | null;
  onCancel?: () => void;
}

const RELEVANT_CATEGORIES = ["MAKE_PURCHASE", "LEAD", "APP_INSTALL"];

export default function ConversionRuleList({
  listTitle,
  accountIdToFetch,
  onRuleSelected,
  onNoRulesFound,
  currentPrimaryRuleId,
  onCancel,
}: ConversionRuleListProps) {
  const [allFetchedRules, setAllFetchedRules] = useState<ConversionRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { pop } = useNavigation();

  useEffect(() => {
    console.log(`[CnvRuleList] Fetching rules for Account Slug: ${accountIdToFetch}`);
    showToast({ style: Toast.Style.Animated, title: "Fetching Rules..." });
    setIsLoading(true);
    setError(null);

    fetchConversionRules(accountIdToFetch)
      .then(async (fetchedRules) => {
        setAllFetchedRules(fetchedRules);
        showToast({ style: Toast.Style.Success, title: "Rules Fetched", message: `${fetchedRules.length} total found.` });
      })
      .catch(async (err) => {
        console.error(`[CnvRuleList] Fetch rules ERROR for ${accountIdToFetch}:`, err);
        setError(`Failed to fetch rules: ${String(err).substring(0,150)}`);
        showToast({ style: Toast.Style.Failure, title: "Fetch Rules Failed", message: String(err).substring(0,100) });
      })
      .finally(() => setIsLoading(false));
  }, [accountIdToFetch]);

  const filteredRules = useMemo(() => {
    if (isLoading || error) return [];
    
    const activeRules = allFetchedRules.filter(rule =>
      rule.status === "ACTIVE" &&
      rule.category &&
      RELEVANT_CATEGORIES.includes(rule.category) &&
      rule.include_in_total_conversions === true
    );

    console.log(`[CnvRuleList] Filtered rules with include_in_total_conversions=true for account ${accountIdToFetch} (count: ${activeRules.length}):`, activeRules);

    if (!isLoading && allFetchedRules.length > 0 && activeRules.length === 0) {
        showToast({ style: Toast.Style.Failure, title: "No Relevant Rules", message: `Found ${allFetchedRules.length}, but none matched filters.` });
    }

    if (!isLoading && allFetchedRules.length === 0 && onNoRulesFound) {
        // This means the API call itself returned zero rules (e.g. 404 or empty array from API)
        console.log(`[CnvRuleList] API returned 0 rules for ${accountIdToFetch}, calling onNoRulesFound.`);
        onNoRulesFound(accountIdToFetch);
    }
    return activeRules;
  }, [allFetchedRules, isLoading, error, accountIdToFetch, onNoRulesFound]);


  const handleSelectRule = (rule: ConversionRule) => {
    console.log("[CnvRuleList] Rule selected:", rule.id, rule.display_name);
    onRuleSelected(rule);
    pop();
  };

  const handleCancel = () => {
    onCancel?.();
    pop();
  };

  if (error && !isLoading) {
    return (
        <Detail 
            markdown={`# Error Fetching Rules\n\nCould not fetch for: **${accountIdToFetch}**.\n\n**Error:**\n\`\`\`\n${error}\n\`\`\``}
            actions={ <ActionPanel> <Action title="Go Back" icon={Icon.ArrowLeft} onAction={handleCancel} /> </ActionPanel> }
        />
    );
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle={listTitle}
      searchBarPlaceholder="Filter displayed rules..."
      actions={<ActionPanel><Action title="Cancel" icon={Icon.XMarkCircle} onAction={handleCancel} /></ActionPanel>}
    >
      {filteredRules.length === 0 && !isLoading ? (
        <List.EmptyView 
          title="No Matching Rules" 
          description={`No active rules for categories: ${RELEVANT_CATEGORIES.join(", ")}.`} 
          actions={<ActionPanel><Action title="Go Back" icon={Icon.ArrowLeft} onAction={handleCancel} /></ActionPanel>} 
        />
      ) : (
        filteredRules.map((r) => (
          <List.Item
            key={r.id}
            title={r.display_name}
            subtitle={`${r.category || "N/A"} (${r.rule_type || "N/A"})`}
            accessories={[
              { text: r.total_received != null ? `Total: ${r.total_received}` : undefined, tooltip: "Total Received" },
              { date: r.last_received ? new Date(r.last_received) : undefined, tooltip: "Last Received" },
              { text: r.advertiser_id ? `Adv: ${r.advertiser_id}` : undefined, tooltip: r.advertiser_id ? `Advertiser ID: ${r.advertiser_id}` : undefined },
              { 
                tag: r.include_in_total_conversions ? { value: "In Total Conv.", color: Color.Green } : { value: "Not In Total", color: Color.Orange }, 
                tooltip: `Included in Total Conversions: ${r.include_in_total_conversions ? 'Yes' : 'No'}` 
              },
              // Highlight if total_received is 0/null or last_received is before yesterday
              ...((r.total_received == null || r.total_received === 0 ||
                  (r.last_received && new Date(r.last_received) < new Date(Date.now() - 24 * 60 * 60 * 1000)))
                ? [{ tag: { value: "Stale/Inactive", color: Color.Red }, tooltip: "No recent conversions or never received." }]
                : []),
              ...(currentPrimaryRuleId === r.id ? [{ icon: Icon.Star, tooltip: "Current Primary" }] : []),
            ]}
            actions={
              <ActionPanel>
                <Action title="Use This Rule" icon={Icon.Checkmark} onAction={() => handleSelectRule(r)} />
                <Action title="Cancel" icon={Icon.XMarkCircle} onAction={handleCancel} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
