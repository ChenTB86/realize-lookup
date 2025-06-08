import { LocalStorage } from "@raycast/api";
import { Account } from "./useAccounts";

const RECENT_KEY = "recent_accounts";
const RECENT_LIMIT = 5;

export async function getRecentAccounts(): Promise<Account[]> {
  const stored = await LocalStorage.getItem<string>(RECENT_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }
  return [];
}

export async function addToRecent(account: Account): Promise<void> {
  const recents = await getRecentAccounts();
  let updated = [account, ...recents.filter(a => a.id !== account.id)];
  if (updated.length > RECENT_LIMIT) updated = updated.slice(0, RECENT_LIMIT);
  await LocalStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}
