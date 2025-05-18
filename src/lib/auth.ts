// src/lib/auth.ts
import { getPreferenceValues, showToast, Toast, LocalStorage } from "@raycast/api";

const TOKEN_URL = "https://backstage.taboola.com/backstage/oauth/token";
const DEBUG_TOKEN = "";

const TOKEN_KEY = "access_token_json"; // LocalStorage key
const SAFETY_MS = 60_000; // 1-minute buffer

let inMemory: { value: string; expires: number } | null = null;

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
  } catch (parseError) {
    console.warn("[Auth] Failed to parse cached token:", parseError);
    // Fall through to get a new token
  }

  if (DEBUG_TOKEN) {
    console.log("🔑 used DEBUG_TOKEN");
    return { Authorization: `Bearer ${DEBUG_TOKEN}` };
  }

  // This function can throw, so the caller (services) should handle it
  // or we ensure it always returns something (even if it means erroring out earlier)
  const token = await getValidToken(); // This might throw
  return { Authorization: `Bearer ${token}` };
}

async function getValidToken(): Promise<string> {
  const { client_id, client_secret } = getPreferenceValues<{
    client_id: string;
    client_secret: string;
  }>();

  if (!client_id || !client_secret) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Missing Credentials",
      message: "Set Client ID and Secret in Extension Preferences.",
    });
    throw new Error("Missing clientId or clientSecret in preferences");
  }

  try {
    console.log("[Auth] Attempting to get new token from:", TOKEN_URL);
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
      // Attempt to get more details from the error response body
      let errorDetails = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json(); // Or response.text() if not JSON
        errorDetails += ` - ${JSON.stringify(errorBody)}`;
      } catch (e) {
        // Ignore if parsing error body fails
      }
      console.error("[Auth] Token request failed:", errorDetails);
      await showToast({
        style: Toast.Style.Failure,
        title: "Authentication Failed",
        message: `Could not get token: ${response.statusText || response.status}. Check credentials.`,
      });
      throw new Error(`Token request failed: ${errorDetails}`);
    }

    const { access_token, expires_in = 3600 } = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };

    if (!access_token) {
        console.error("[Auth] Token response missing access_token.");
        await showToast({
            style: Toast.Style.Failure,
            title: "Authentication Error",
            message: "Received invalid token response from server.",
        });
        throw new Error("Token response missing access_token");
    }

    const expiryEpoch = Date.now() + expires_in * 1000 - SAFETY_MS;
    inMemory = { value: access_token, expires: expiryEpoch };
    await LocalStorage.setItem(TOKEN_KEY, JSON.stringify(inMemory));
    console.log("[Auth] New token obtained and cached.");
    return access_token;

  } catch (error: any) {
    // This catch block now handles both fetch failures (network errors) and HTTP errors thrown above
    console.error("[Auth] Error in getValidToken:", error);
    let toastMessage = "An unexpected error occurred during authentication.";
    if (error.message && error.message.includes("fetch failed")) { // More specific for network issues
        toastMessage = "Network error: Could not connect to authentication server. Check internet connection.";
        if (error.cause && (error.cause as any).code === 'ENOTFOUND') {
            toastMessage = `Network error: Host ${ (error.cause as any).hostname } not found. Check internet/VPN.`;
        }
    } else if (error.message && error.message.startsWith("Token request failed:")) {
        toastMessage = error.message; // Use the specific message from HTTP error
    } else if (error.message) {
        toastMessage = error.message;
    }
    
    await showToast({
      style: Toast.Style.Failure,
      title: "Authentication Error",
      message: toastMessage.substring(0, 200), // Limit message length for toast
    });
    // Re-throw the error so that calling services know authentication failed
    // and can stop further API calls.
    throw error; 
  }
}
