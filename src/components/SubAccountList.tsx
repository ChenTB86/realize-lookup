// src/components/SubAccountList.tsx
import { useEffect, useState } from "react";
import { Action, ActionPanel, Icon, List, showToast, Toast, useNavigation } from "@raycast/api";
import { fetchSubAccountBreakdown, SubAccountReportRow } from "../lib/reportService";
import { Account } from "../lib/useAccounts";
import { ReportConfigurationView } from "./ReportConfigurationForm";

interface SubAccountListProps {
  networkAccount: Account;
  startDate: string;
  endDate: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
};

export function SubAccountList({ networkAccount, startDate, endDate }: SubAccountListProps) {
  const [subAccounts, setSubAccounts] = useState<SubAccountReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { pop } = useNavigation();

  useEffect(() => {
    console.log(`[SubAccList] Fetching for NetworkID: ${networkAccount.account_id} (${startDate}-${endDate})`);
    setIsLoading(true);
    const toast = showToast({ style: Toast.Style.Animated, title: "Fetching Sub-Accounts..." });

    fetchSubAccountBreakdown(networkAccount.account_id, startDate, endDate)
      .then((data) => {
        setSubAccounts(data);
        toast.then(t => t.update({ style: Toast.Style.Success, title: "Sub-Accounts Loaded", message: `${data.length} found.` }));
      })
      .catch((err) => {
        console.error(`[SubAccList] Fetch ERROR for ${networkAccount.account_id}:`, err);
        toast.then(t => t.update({ style: Toast.Style.Failure, title: "Fetch Sub-Accounts Failed", message: String(err).substring(0, 100) }));
        setSubAccounts([]);
      })
      .finally(() => setIsLoading(false));
  }, [networkAccount.account_id, startDate, endDate]);

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`Sub-Accounts of ${networkAccount.name}`}
      searchBarPlaceholder="Search sub-accounts..."
      actions={
        <ActionPanel>
          <Action title="Back to Parent Account" icon={Icon.ArrowLeft} onAction={pop} />
        </ActionPanel>
      }
    >
      {subAccounts.length === 0 && !isLoading ? (
        <List.EmptyView title="No Sub-Accounts Found" description={`For ${networkAccount.name} in period.`} icon={Icon.MagnifyingGlass}/>
      ) : (
        subAccounts.map((subAcc) => {
          // content_provider is the string slug/name
          // content_provider_id is the numeric-like ID (potentially string)
          
          const subAccountForForm: Account = {
            // Use a consistent numeric ID for the Account object's `id` field (for React keys, etc.)
            // If subAcc.content_provider_id can be reliably parsed to a number, use that.
            // Otherwise, a fallback or a different strategy for `Account.id` might be needed if strict numbering is required.
            // For now, let's assume content_provider_id is the best source for a unique numeric-like key.
            id: parseInt(subAcc.content_provider_id, 10) || Math.random(), // Fallback if parsing fails
            name: subAcc.content_provider,         // This is the display name and the string slug
            account_id: subAcc.content_provider,  // CRITICAL: Use the string slug for API calls
            network_account_id: networkAccount.account_id,
            type: "ADVERTISER", // Assuming sub-accounts are ADVERTISER type. Adjust if API provides this.
            is_network: false, // Sub-accounts are not networks themselves.
          };

          return (
            <List.Item
              key={subAcc.content_provider_id} // Use the unique ID from API as key
              title={subAcc.content_provider} // Display name/slug
              subtitle={`ID: ${subAcc.content_provider_id}`} // Display the numeric-like ID
              accessories={[{ text: `Spent: ${formatCurrency(subAcc.spent)}` }]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Get Report Data for Sub-Account"
                    icon={Icon.Document}
                    target={<ReportConfigurationView account={subAccountForForm} />}
                  />
                  <Action.OpenInBrowser
                    title="Open Sub-Account in Realize"
                    icon={Icon.Globe}
                    // Use the string slug for the Realize URL
                    url={`https://ads.realizeperformance.com/campaigns?locale=en&accountId=${subAcc.content_provider}`}
                  />
                  <Action title="Back to Parent Account" icon={Icon.ArrowLeft} onAction={pop} />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
