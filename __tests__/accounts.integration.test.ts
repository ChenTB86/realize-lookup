// __tests__/accounts.integration.test.ts
import fetch from "node-fetch";

const BASE = "https://backstage.taboola.com/backstage";
const TOKEN = process.env.TEST_TOKEN!; // set this in your shell before running

describe("Backstage Advertisers endpoint", () => {
  it("should return 200 and at least one result with metadata", async () => {
    const url = `${BASE}/api/1.0/taboola-network/advertisers?search_text=wonderskin&page_size=5&page=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      results: Array<unknown>;
      metadata: { total: number; count: number };
    };

    expect(Array.isArray(json.results)).toBe(true);
    expect(json.results.length).toBeGreaterThan(0);
    expect(json.metadata).toHaveProperty("total");
    expect(json.metadata.total).toBeGreaterThanOrEqual(json.metadata.count);
  });
});