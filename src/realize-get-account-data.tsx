// src/realize-get-account-data.tsx
import { useState } from "react";
import { Action, ActionPanel, List, Icon } from "@raycast/api";
import { useAccounts, EmptyView as DefaultEmptyView, Account } from "./lib/useAccounts"; // Renamed DefaultEmptyView if it's generic
import { ReportConfigurationView } from "./components/ReportConfigurationForm";
import RunningCampaignList from "./components/RunningCampaignList";

type CommandProps = {
  arguments: {
    query?: string;
  };
};

export default function Command(props: CommandProps) {
  const initialSearchText = props.arguments.query ?? "";
  const [searchText, setSearchText] = useState(initialSearchText);
  const { accounts, metadata, isLoading: isLoadingAccounts, isEmpty } = useAccounts(searchText);

  let emptyViewTitle = "No Results";
  let emptyViewDescription = "Try a different keyword.";
  let showCustomEmptyView = false;

  if (!isLoadingAccounts) {
    if (searchText.trim().length === 0) {
      emptyViewTitle = "Start Typing to Search";
      emptyViewDescription = "Enter an account name or ID to begin.";
      showCustomEmptyView = true;
    } else if (searchText.trim().length < 2) {
      emptyViewTitle = "Keep Typing...";
      emptyViewDescription = "Enter at least 2 characters of an account name or ID.";
      showCustomEmptyView = true;
    } else if (isEmpty) { // isEmpty is true when search term >= 2 chars and no accounts found
      emptyViewTitle = "No Accounts Found";
      emptyViewDescription = `No accounts match "${searchText}". Try a different keyword.`;
      showCustomEmptyView = true;
    }
  }


  return (
    <List
      isLoading={isLoadingAccounts}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarPlaceholder="Search account name or ID..."
      throttle
    >
      {/* Conditional rendering for the empty view to ensure only one is rendered */}
      {showCustomEmptyView && accounts.length === 0 && !isLoadingAccounts ? (
        <List.EmptyView title={emptyViewTitle} description={emptyViewDescription} />
      ) : null}

      {/* Render accounts only if not loading and accounts array is not empty */}
      {!isLoadingAccounts && accounts.length > 0 && metadata && (
        <List.Section title={`Showing ${accounts.length} of ${metadata.total} accounts`}>
          {accounts.map((acc: Account) => (
            <List.Item
              key={acc.id}
              title={acc.name}
              subtitle={acc.account_id ? `ID: ${acc.account_id}` : undefined}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Get Report Data"
                    icon={Icon.BarChart}
                    target={<ReportConfigurationView account={acc} />}
                  />
                  <Action.Push
                    title="View Active Campaigns"
                    icon={Icon.List}
                    target={<RunningCampaignList account={acc} />}
                  />
                   <Action.OpenInBrowser
                    title="Open Account in Realize"
                    icon={Icon.Globe}
                    url={`https://ads.realizeperformance.com/campaigns?accountId=${acc.id}`}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
