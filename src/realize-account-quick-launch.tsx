// src/quick-launch.tsx
import { Action, ActionPanel, List, LocalStorage, open } from "@raycast/api";
import { useState, useEffect } from "react";
import { useAccounts, EmptyView, Account } from "./lib/useAccounts";
import { getAuthHeader } from "./lib/auth";

type Props = {
  arguments: {
    query?: string;
  };
};

export default function Command(props: Props) {
  // Initialize from the optional 'query' argument
  const [searchText, setSearchText] = useState(props.arguments.query ?? "");
  const { accounts, metadata, isLoading, isEmpty } = useAccounts(searchText);

  const [recentAccounts, setRecentAccounts] = useState<Account[]>([]);
  const RECENT_KEY = "recent_accounts";
  const RECENT_LIMIT = 5;

  // Prefetch auth token on mount for faster first search
  useEffect(() => {
    getAuthHeader().catch(() => {
      // Ignore errors here; will be handled on actual search
    });
  }, []);

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

  // Render either recent accounts or search results
  const showRecent = searchText.trim().length === 0;

  return (
    <List
      isLoading={isLoading && !showRecent}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarPlaceholder="Type account name or numeric ID…"
      throttle
      searchBarAccessory={
        metadata && !showRecent ? (
          <List.Dropdown tooltip={`${metadata.count} of ${metadata.total} matches`}>
            <List.Dropdown.Item title={`Showing ${metadata.count} of ${metadata.total}`} value="info" />
          </List.Dropdown>
        ) : undefined
      }
    >
      {/^\d+$/.test(searchText.trim()) && !showRecent && (
        <List.Item
          key={searchText}
          title={`Open Account ID ${searchText}`}
          subtitle="Launch directly in Realize"
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open in Realize"
                url={`https://ads.realizeperformance.com/campaigns?locale=en&accountId=${searchText}`}
              />
            </ActionPanel>
          }
        />
      )}

      {showRecent
        ? recentAccounts.length > 0
          ? recentAccounts.map((account: Account) => (
              <List.Item
                key={account.id}
                title={account.name}
                subtitle={`ID: ${account.id}`}
                actions={
                  <ActionPanel>
                    <Action
                      title="Open in Realize"
                      onAction={async () => {
                        await addToRecent(account);
                        await open(`https://ads.realizeperformance.com/campaigns?locale=en&accountId=${account.id}`);
                      }}
                    />
                  </ActionPanel>
                }
              />
            ))
          : <List.EmptyView title="No Recent Accounts" description="You haven't opened any accounts yet." />
        : accounts.map((account: Account) => (
            <List.Item
              key={account.id}
              title={account.name}
              subtitle={`ID: ${account.id}`}
              actions={
                <ActionPanel>
                  <Action
                    title="Open in Realize"
                    onAction={async () => {
                      await addToRecent(account);
                      await open(`https://ads.realizeperformance.com/campaigns?locale=en&accountId=${account.id}`);
                    }}
                  />
                </ActionPanel>
              }
            />
          ))
      }

      {isEmpty && !showRecent && <EmptyView />}
    </List>
  );
}
