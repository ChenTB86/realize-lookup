import { Account } from "./useAccounts";

const cache: Record<string, Account[]> = {};

import { getAuthHeader } from "./auth";

export async function fetchSubAccounts(account: { account_id: string | number }): Promise<Account[]> {
  const id = String(account.account_id);
  if (cache[id]) {
    console.debug(`[fetchSubAccounts] Cache hit for accountId=${id}`);
    return cache[id];
  }
  const url = `https://backstage.taboola.com/backstage/api/1.0/${id}/advertisers`;
  const headers = await getAuthHeader();
  console.debug(`[fetchSubAccounts] Fetching sub-accounts from: ${url} with headers:`, headers);
  try {
    const response = await fetch(url, { headers });
    console.debug(`[fetchSubAccounts] Response status: ${response.status}`);
    if (!response.ok) {
      const text = await response.text();
      console.error(`[fetchSubAccounts] Error response: ${text}`);
      throw new Error(`Failed to fetch sub-accounts for account ${id}: ${response.status} ${response.statusText}`);
    }
    interface SubAccountsApiResponse {
      results: Account[];
      [key: string]: unknown;
    }
    const data = (await response.json()) as SubAccountsApiResponse;
    if (!data || !Array.isArray(data.results)) {
      console.error(`[fetchSubAccounts] API did not return a results array. Data:`, data);
      throw new Error("API did not return a results array");
    }
    cache[id] = data.results;
    return cache[id];
  } catch (err) {
    console.error(`[fetchSubAccounts] Exception for accountId=${id}:`, err);
    throw err;
  }
}
