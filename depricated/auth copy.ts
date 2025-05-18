// src/lib/auth.ts

import { getPreferenceValues, showToast, Toast, LocalStorage } from "@raycast/api";

const TOKEN_URL = "https://backstage.taboola.com/backstage/oauth/token";
const DEBUG_TOKEN = "";
//  "CRBPAAAAAAAAEfDLAQAAAAAAGAEgACn_OY26lgEAADooY2RmN2UxODczMWI3MWU2NzkyNDQ2OWYzMzliZDdiM2NlNTFmYzg1N0AC::ecbc29::3c9969";

//*****************************************************//
const TOKEN_KEY = "access_token_json"; // LocalStorage key
const SAFETY_MS = 60_000; // 1-minute buffer

let inMemory: { value: string; expires: number } | null = null;

//*****************************************************//

export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const cached = await LocalStorage.getItem<string>(TOKEN_KEY);
    if (cached) {
      const obj = JSON.parse(cached) as { value: string; expires: number };
      if (Date.now() < obj.expires) {
        inMemory = obj; // promote to memory
        return { Authorization: `Bearer ${obj.value}` };
      }
    }
  } catch {
    /* ignore parse errors */
  }
  if (DEBUG_TOKEN) {
    // short-circuit using the debug token
    console.log("🔑 used DEBUG_TOKEN  "); // debug line

    return { Authorization: `Bearer ${DEBUG_TOKEN}` };
  }

  const token = await getValidToken();
  return { Authorization: `Bearer ${token}` };
}

//*****************************************************//

//** Internal: calls the OAuth endpoint to get a fresh token */
async function getValidToken(): Promise<string> {
  const { client_id, client_secret } = getPreferenceValues<{
    client_id: string;
    client_secret: string;
  }>();

  if (!client_id || !client_secret) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Missing credentials",
      message: "Set Client ID and Secret in Extension Preferences",
    });
    throw new Error("Missing clientId or clientSecret");
  }

  try {
    console.log("Attempting to get new token");
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: client_id,
        client_secret: client_secret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const { access_token, expires_in = 3600 } = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };

    const expiryEpoch = Date.now() + expires_in * 1000 - SAFETY_MS;

    inMemory = { value: access_token, expires: expiryEpoch };
    await LocalStorage.setItem(TOKEN_KEY, JSON.stringify(inMemory));

    return access_token;
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Authentication Error",
      message: String(error),
    });
    throw error;
  }
}
