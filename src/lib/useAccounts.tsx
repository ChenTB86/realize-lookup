// src/lib/useAccounts.tsx
import { List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getAuthHeader } from "./auth";
import { BASE_URL } from "./config";

export interface Account {
  id: number;
  name: string;
  account_id: string;
  currency?: string;
  type?: 'NETWORK' | 'PARTNER' | 'ADVERTISER' | string;
  is_network?: boolean;
  network_account_id?: string;
}

export interface Metadata {
  total: number;
  count: number;
}

type CacheEntry = {
  results: Account[];
  metadata: Metadata;
  fetchedAt: number;
};

const cache = new Map<string, CacheEntry>();
const TTL = 1000 * 60 * 60 * 8; // 8 hours

export function useAccounts(searchText: string) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const term = searchText.trim();
    if (term.length === 0) {
      setAccounts([]);
      setMetadata(null);
      setIsLoading(false);
      return;
    }
    if (term.length < 2) {
      setIsLoading(false);
      return;
    }

    const cached = cache.get(term);
    if (cached && Date.now() - cached.fetchedAt < TTL) {
      console.log(`[useAccounts] CACHE HIT for: "${term}"`);
      setAccounts(cached.results);
      setMetadata(cached.metadata);
      setIsLoading(false);
      return;
    }
    // console.log(`[useAccounts] CACHE MISS for: "${term}". Fetching API.`); // Less verbose

    let cancelled = false;
    setIsLoading(true);
    showToast({ style: Toast.Style.Animated, title: `Searching: "${term}"...` });

    (async () => {
      try {
        const headers = await getAuthHeader();
        const url = `${BASE_URL}/api/1.0/taboola-network/advertisers?search_text=${encodeURIComponent(term)}&page_size=10&page=1`;
        const res = await fetch(url, { headers });

        if (!res.ok) {
          if (res.status === 400 || res.status === 404) {
             if (!cancelled) { setAccounts([]); setMetadata({ total: 0, count: 0 }); }
             showToast({ style: Toast.Style.Success, title: "No Accounts Found" });
             return;
          }
          throw new Error(`API Error ${res.status}`);
        }

        const json = (await res.json()) as { results: Account[]; metadata: Metadata; };
        if (!cancelled) {
          const processedResults = json.results.map(acc => ({ ...acc, is_network: acc.type === "NETWORK" }));
          setAccounts(processedResults);
          setMetadata(json.metadata);
          cache.set(term, { results: processedResults, metadata: json.metadata, fetchedAt: Date.now() });
          showToast({ style: Toast.Style.Success, title: "Accounts Loaded" });
        }
      } catch (error) {
        console.error("[useAccounts] Search ERROR:", error);
        if (!cancelled) {
            showToast({ style: Toast.Style.Failure, title: "Account Lookup Failed", message: String(error).substring(0,100) });
            setAccounts([]); setMetadata(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchText]);

  return { accounts, metadata, isLoading, isEmpty: !isLoading && accounts.length === 0 && searchText.trim().length >= 2 };
}

export function EmptyView() {
  return <List.EmptyView title="No Matches" description="Try a different keyword (min 2 chars)." />;
}

/**
 * Fetch all accounts that are children of a given network.
 * @param networkAccountId The account_id of the network.
 * @returns Promise<Account[]>
 */
export async function getSubAccountsForNetwork(networkAccountId: string): Promise<Account[]> {
  try {
    const headers = await getAuthHeader();
    const url = `${BASE_URL}/api/1.0/taboola-network/advertisers?network_account_id=${encodeURIComponent(networkAccountId)}&page_size=100&page=1`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        return [];
      }
      throw new Error(`API Error ${res.status}`);
    }

    const json = (await res.json()) as { results: Account[]; metadata: Metadata; };
    return json.results.map(acc => ({ ...acc, is_network: acc.type === "NETWORK" }));
  } catch (error) {
    console.error("[getSubAccountsForNetwork] ERROR:", error);
    return [];
  }
}
