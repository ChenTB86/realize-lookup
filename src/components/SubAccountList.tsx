import { List, showToast, Toast, ActionPanel, Action } from "@raycast/api";
import { useEffect, useState } from "react";
import { Account } from "../lib/useAccounts";
import { addToRecent } from "../lib/recents";

interface SubAccountListProps {
  listTitle: string;
  fetchSubAccounts: () => Promise<Account[]>;
  onSubAccountSelected: (account: Account) => void;
}

export default function SubAccountList({ listTitle, fetchSubAccounts, onSubAccountSelected }: SubAccountListProps) {
  const [subAccounts, setSubAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchSubAccounts()
      .then((accounts) => {
        setSubAccounts(accounts);
        setIsLoading(false);
      })
      .catch((err) => {
        setError("Failed to fetch sub-accounts");
        showToast({ style: Toast.Style.Failure, title: "Error", message: String(err) });
        console.error("[SubAccountList] Error fetching sub-accounts:", err);
        setIsLoading(false);
      });
  }, [fetchSubAccounts]);

  const filteredAccounts = subAccounts.filter((acc) =>
    acc.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search sub-accounts..."
      onSearchTextChange={setSearchText}
      searchText={searchText}
      navigationTitle={listTitle}
    >
      {error && <List.EmptyView title={error} />}
      {filteredAccounts.map((acc) => (
        <List.Item
          key={acc.account_id}
          title={acc.name}
          subtitle={String(acc.account_id)}
          actions={
            <ActionPanel>
              <Action
                title="Select"
                onAction={async () => {
                  await addToRecent(acc);
                  onSubAccountSelected(acc);
                }}
              />
            </ActionPanel>
          }
        />
      ))}
      {!isLoading && filteredAccounts.length === 0 && !error && (
        <List.EmptyView title="No sub-accounts found" />
      )}
    </List>
  );
}
