    // src/components/RunningCampaignList.tsx
    import { List, ActionPanel, Action, Icon, showToast, Toast, useNavigation, Detail, Color } from "@raycast/api";
    import { useEffect, useState } from "react";
    import { fetchCampaigns, CampaignSetting } from "../lib/campaignService";
    import { Account } from "../lib/useAccounts";
    import CampaignDetailView from "./CampaignDetailView"; // Ensure this component is correct and default exported

    interface RunningCampaignListProps {
      account: Account;
    }

    export default function RunningCampaignList({ account }: RunningCampaignListProps) {
      const [allCampaigns, setAllCampaigns] = useState<CampaignSetting[]>([]);
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const { pop, push } = useNavigation();

      useEffect(() => {
        if (!account || !account.account_id) { // account_id is the slug
          const errMsg = "Account data or Account ID (slug) is missing.";
          console.error("[RunningCampaignList]", errMsg, account);
          setError(errMsg);
          setIsLoading(false);
          showToast(Toast.Style.Failure, "Error", "Account ID missing for campaign fetch.");
          return;
        }

        const toastIdPromise = showToast({ style: Toast.Style.Animated, title: "Fetching Campaigns..." });
        setIsLoading(true);
        setError(null);

        fetchCampaigns(account.account_id) // Use slug for API
          .then(async (fetchedCampaigns) => {
            setAllCampaigns(fetchedCampaigns);
            const runningOrActive = fetchedCampaigns.filter(c => c.status === "RUNNING" || (c.status !== "ENDED" && c.status !== "ARCHIVED" && c.is_active === true));
            
            if (fetchedCampaigns.length > 0 && runningOrActive.length === 0) {
                (await toastIdPromise).update({ style: Toast.Style.Success, title: "Campaigns Fetched", message: `Found ${fetchedCampaigns.length} campaigns, but none are 'RUNNING' or active.` });
            } else if (runningOrActive.length > 0) {
                (await toastIdPromise).update({ style: Toast.Style.Success, title: "Campaigns Fetched", message: `${runningOrActive.length} running/active campaigns found.` });
            } else {
                 (await toastIdPromise).update({ style: Toast.Style.Success, title: "No Campaigns Found", message: `No campaigns returned for this account.` });
            }
          })
          .catch(async (err) => {
            const errorMsg = `Failed to fetch campaigns: ${String(err.message || err).substring(0, 150)}`;
            console.error(`[RunningCampaignList] Fetch campaigns ERROR for ${account.account_id}:`, err);
            setError(errorMsg);
            (await toastIdPromise).update({ style: Toast.Style.Failure, title: "Fetch Campaigns Failed", message: errorMsg });
          })
          .finally(() => setIsLoading(false));
      }, [account]);

      const displayedCampaigns = allCampaigns.filter(c => c.status === "RUNNING" || (c.status !== "ENDED" && c.status !== "ARCHIVED" && c.is_active === true));

      const handleSelectCampaign = (campaign: CampaignSetting) => {
        const numericAccountIdForUrl = String(account.id); // Use numeric account.id for the Realize URL
        
        if (typeof CampaignDetailView !== 'function') { // Defensive check
            showToast(Toast.Style.Failure, "Error", "CampaignDetailView component is not available.");
            console.error("[RunningCampaignList] CampaignDetailView is not a function:", CampaignDetailView);
            return;
        }

        push(
            <CampaignDetailView 
                campaign={campaign} 
                accountCurrency={(account as Account & { currency?: string }).currency || "USD"} 
                accountId={numericAccountIdForUrl} // Pass numeric account ID
            />
        );
      };

      if (error && !isLoading) {
        return (
          <Detail
            markdown={`# Error Fetching Campaigns\n\nCould not fetch campaigns for account: **${account.name} (${account.account_id})**.\n\n**Error Details:**\n\`\`\`\n${error}\n\`\`\``}
            actions={ <ActionPanel> <Action title="Go Back" icon={Icon.ArrowLeft} onAction={pop} /> </ActionPanel> }
          />
        );
      }

      return (
        <List
          isLoading={isLoading}
          navigationTitle={`Active Campaigns: ${account.name}`}
          searchBarPlaceholder="Filter displayed campaigns by name or ID..."
        >
          {displayedCampaigns.length === 0 && !isLoading ? (
            <List.EmptyView
              title="No Active Campaigns Found"
              description="This account has no campaigns currently marked as 'RUNNING' or active."
              actions={ <ActionPanel> <Action title="Go Back" icon={Icon.ArrowLeft} onAction={pop} /> </ActionPanel> }
            />
          ) : (
            <List.Section title={`${displayedCampaigns.length} Active Campaign(s)`}>
            {displayedCampaigns.map((campaign) => (
              <List.Item
                key={campaign.id}
                title={campaign.name}
                subtitle={campaign.id ? `ID: ${campaign.id}` : undefined}
                accessories={[
                  { tag: { value: campaign.status, color: campaign.status === "RUNNING" ? Color.Green : (campaign.is_active ? Color.Blue : Color.Orange) }, tooltip: `Status: ${campaign.status}`},
                  { text: campaign.cpc ? `CPC: ${campaign.cpc}` : undefined, tooltip: "Cost Per Click"},
                  { date: campaign.start_date ? new Date(campaign.start_date) : undefined, tooltip: "Start Date"},
                  { icon: campaign.is_active ? Icon.Play : Icon.Pause, tooltip: campaign.is_active ? "Active" : "Inactive" }
                ]}
                actions={
                  <ActionPanel>
                    <Action title="View Configuration" icon={Icon.Cog} onAction={() => handleSelectCampaign(campaign)} />
                    <Action.OpenInBrowser
                        title="Open Campaign in Realize GUI"
                        // Use numeric account.id for the Realize URL
                        url={`https://ads.realizeperformance.com/campaigns?locale=en&accountId=${account.id}&dimension=SPONSORED&reportEntityIds=${campaign.id}&reportEntityType=CAMPAIGN&reportId=campaign`}
                    />
                    <Action title="Go Back" icon={Icon.ArrowLeft} shortcut={{ modifiers: ["cmd"], key: "arrowLeft" }} onAction={pop} />
                  </ActionPanel>
                }
              />
            ))}
            </List.Section>
          )}
        </List>
      );
    }
    