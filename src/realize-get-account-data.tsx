// src/realize-get-account-data.tsx
import { useState, useEffect } from "react";
import { Action, ActionPanel, List, Icon, LocalStorage, open } from "@raycast/api";
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

  const [recentAccounts, setRecentAccounts] = useState<Account[]>([]);
  const RECENT_KEY = "recent_accounts";
  const RECENT_LIMIT = 5;

  // Load recent accounts from LocalStorage when searchText is empty
  useEffect(() => {
    if (searchText.trim().length === 0) {
      (async () => {
        const stored = await LocalStorage.getItem<string>(RECENT_KEY);
        if (stored) {
          try {
            setRecentAccounts(JSON.parse(stored));
          } catch {
            setRecentAccounts([]);
          }
        } else {
          setRecentAccounts([]);
        }
      })();
    }
  }, [searchText]);

  // Helper to add an account to recent list
  const addToRecent = async (account: Account) => {
    let updated = [account, ...recentAccounts.filter(a => a.id !== account.id)];
    if (updated.length > RECENT_LIMIT) updated = updated.slice(0, RECENT_LIMIT);
    setRecentAccounts(updated);
    await LocalStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  };

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

  const showRecent = searchText.trim().length === 0;

  return (
    <List
      isLoading={isLoadingAccounts && !showRecent}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarPlaceholder="Search account name or ID..."
      throttle
    >
      {/* Show recent accounts when search is empty */}
      {showRecent && recentAccounts.length > 0 && (
        <List.Section title="Recently Selected Accounts">
          {recentAccounts.map((acc: Account) => (
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
                    onPush={async () => await addToRecent(acc)}
                  />
                  <Action.Push
                    title="View Active Campaigns"
                    icon={Icon.List}
                    target={<RunningCampaignList account={acc} />}
                    onPush={async () => await addToRecent(acc)}
                  />
                  <Action
                    title="Open Account in Realize"
                    icon={Icon.Globe}
                    onAction={async () => {
                      await addToRecent(acc);
                      await open(`https://ads.realizeperformance.com/campaigns?accountId=${acc.id}`);
                    }}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {/* Conditional rendering for the empty view to ensure only one is rendered */}
      {showCustomEmptyView && accounts.length === 0 && !isLoadingAccounts && recentAccounts.length === 0 ? (
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
                    onPush={async () => await addToRecent(acc)}
                  />
                  <Action.Push
                    title="View Active Campaigns"
                    icon={Icon.List}
                    target={<RunningCampaignList account={acc} />}
                    onPush={async () => await addToRecent(acc)}
                  />
                  <Action
                    title="Open Account in Realize"
                    icon={Icon.Globe}
                    onAction={async () => {
                      await addToRecent(acc);
                      await open(`https://ads.realizeperformance.com/campaigns?accountId=${acc.id}`);
                    }}
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
