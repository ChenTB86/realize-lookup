// src/quick-launch.tsx
import { Action, ActionPanel, List } from "@raycast/api";
import { useState } from "react";
import { useAccounts, EmptyView, Account } from "./lib/useAccounts";

type Props = {
  arguments: {
    query?: string;
  };
};

export default function Command(props: Props) {
  // Initialize from the optional 'query' argument
  const [searchText, setSearchText] = useState(props.arguments.query ?? "");

  const { accounts, metadata, isLoading, isEmpty } = useAccounts(searchText);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarPlaceholder="Type account name or numeric ID…"
      throttle
      searchBarAccessory={
        metadata ? (
          <List.Dropdown tooltip={`${metadata.count} of ${metadata.total} matches`}>
            <List.Dropdown.Item title={`Showing ${metadata.count} of ${metadata.total}`} value="info" />
          </List.Dropdown>
        ) : undefined
      }
    >
      {/^\d+$/.test(searchText.trim()) && (
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

      {accounts.map((account: Account) => (
        <List.Item
          key={account.id}
          title={account.name}
          subtitle={`ID: ${account.id}`}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open in Realize"
                url={`https://ads.realizeperformance.com/campaigns?locale=en&accountId=${account.id}`}
              />
            </ActionPanel>
          }
        />
      ))}

      {isEmpty && <EmptyView />}
    </List>
  );
}
