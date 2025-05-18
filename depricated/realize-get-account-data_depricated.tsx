// src/realize-get-account-data.tsx

// At top of src/realize-get-account-data.tsx
const dimensionDisplayMap: Record<string, string> = {
  day:                 "Day",
  week:                "Week",
  month:               "Month",
  // API actually expects "by_hour_of_day", not "hour_of_day"
  by_hour_of_day:      "Hour of Day",   
  campaign_breakdown:  "Campaign",
  site_breakdown:      "Site",
  country_breakdown:   "Country",
  platform_breakdown:  "Platform",
  item_breakdown:      "By Ad",
};

const reportIdMap: Record<string, string> = {
  day:                "campaigns",
  week:               "campaigns",
  month:              "campaigns",
  by_hour_of_day:     "campaigns",
  campaign_breakdown: "campaigns",
  site_breakdown:     "campaigns",
  country_breakdown:  "campaigns",
  platform_breakdown: "campaigns",
  item_breakdown:     "creative",
};

import {
  Action,
  ActionPanel,
  Detail,
  Form,
  List,
  
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useState } from "react";
import { useForm } from "@raycast/utils";
import { useAccounts, EmptyView, Account, Metadata } from "./lib/useAccounts";
import { getAuthHeader } from "./lib/auth";
import { BASE_URL } from "./lib/config";

type Props = {
  arguments: { query?: string };
};

interface ReportValues {
  from: Date;           // MUST be a Date for DatePicker
  to: Date;
  breakdown: string;
}

interface ReportRow {
  date: string;
  spent: number;
}

export default function Command(props: Props) {
  const initialQuery = props.arguments.query ?? "";
  const [searchText, setSearchText] = useState(initialQuery);
  const { accounts, metadata, isLoading, isEmpty } = useAccounts(searchText);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchText={searchText}
      searchBarPlaceholder="Search account name…"
      throttle
    >
      {metadata && (
        <List.Section title={`Showing ${metadata.count} of ${metadata.total} results`}>
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </List.Section>
      )}
      {!metadata && !isLoading && <EmptyView />}
    </List>
  );
}

function AccountRow({ account }: { account: Account }) {
  return (
    <List.Item
      title={account.name}
      subtitle={`ID: ${account.id}`}
      actions={
        <ActionPanel>
          <Action.Push title="Get Report Data" target={<ReportForm account={account} />} />
        </ActionPanel>
      }
    />
  );
}

function ReportForm({ account }: { account: Account }) {
  const { push } = useNavigation();
    // yesterday at 00:00
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { handleSubmit, itemProps } = useForm<ReportValues>({
    onSubmit: async ({ from, to, breakdown }) => {
      // Build rows and header based on the dimension type
     

       if (breakdown === "item_breakdown") {
         // By Ad: show r.creative (or r.item)
         header = "| Creative           | Spent |";
         rows = json.results.slice(0, 5).map((r) => {
           const name = (r as any).creative || (r as any).item || "—";
           return `| ${name} | ${fmt.format(r.spent)} |`;
         });

       } else if (breakdown === "campaign_breakdown") {
         // Campaign Breakdown: show r.campaign
         header = "| Campaign ID        | Spent |";
         rows = json.results.slice(0, 5).map((r) => {
           return `| ${r.campaign} | ${fmt.format(r.spent)} |`;
         });

       } else if (breakdown === "site_breakdown") {
         // Site Breakdown: show r.site
         header = "| Site               | Spent |";
         rows = json.results.slice(0, 5).map((r) => {
           return `| ${(r as any).site || "—"} | ${fmt.format(r.spent)} |`;
         });

       } else if (breakdown === "country_breakdown") {
         header = "| Country            | Spent |";
         rows = json.results.slice(0, 5).map((r) => {
           return `| ${(r as any).country || "—"} | ${fmt.format(r.spent)} |`;
         });

       } else if (breakdown === "platform_breakdown") {
         header = "| Platform           | Spent |";
         rows = json.results.slice(0, 5).map((r) => {
           return `| ${(r as any).platform || "—"} | ${fmt.format(r.spent)} |`;
         });

       } else {
         // Date‐based: day, week, month, by_hour_of_day
         header = "| Date       | Spent |";
         rows = json.results.slice(0, 5).map((r) => {
           const dateOnly = r.date.split(" ")[0];
           return `| ${dateOnly} | ${fmt.format(r.spent)} |`;
         });
       }
     
    

      // Format from/to as YYYY-MM-DD
      const startDate = from.toISOString().slice(0, 10);
      const endDate = to.toISOString().slice(0, 10);


       const qs = `?start_date=${startDate}&end_date=${endDate}` + (isByAd ? `&dimensions=${breakdown}` : "");
       const url = `${BASE_URL}/api/1.0/${account.account_id}` + `/reports/${endpoint}/dimensions/${breakdown}${qs}`;


      // ─── FULL API REQUEST DEBUG ───────────────────────────────────
     
      console.group("🔍 [API DEBUG] Request Details");
      console.log("URL:      ", url);
      console.log("Method:   GET");
      console.log("Headers:  ", headers);
      console.groupEnd();
      // Also show in a toast (trimmed if too long)
      const toastMsg = url.length > 80 ? url.slice(0, 80) + "…" : url;
      showToast({ style: Toast.Style.Animated, title: "Fetching Report", message: toastMsg });
      // ─────────────────────────────────────────────────────────────────
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
         // Grab the raw response body for full insight
          let body: string;
          try {
            body = await res.text();
          } catch {
            body = res.statusText;
          }
         await showToast({
           style: Toast.Style.Failure,
           title: `API ${res.status} ${res.statusText}`,
           message: body,
         });
         return;
       }
          const json = (await res.json()) as { results: ReportRow[] };
        

        // 1) compute a currency formatter based on first row (fallback USD)
        const currencyCode = json.results[0]?.currency ?? "USD";
        const fmt = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: currencyCode,
          maximumFractionDigits: 0,
        });

        // 2) build table rows (max 5), rounding spent
        const rows = json.results.slice(0, 5).map((r) => {
          const dateOnly = r.date.split(" ")[0];
          return `| ${dateOnly} | ${fmt.format(r.spent)} |`;
        });

        // 3) compute total spend
        const totalSpend = json.results.reduce((sum, r) => sum + r.spent, 0);
        const totalRow = `| **Total** | **${fmt.format(totalSpend)}** |`;

        // 4) map reportId for GUI link
        const reportIdParam = breakdown === "item_breakdown" ? "creative" : "campaigns";
        const reportId = reportIdMap[breakdown] || "campaigns";
        const guiLink =
                    `https://ads.realizeperformance.com/campaigns?accountId=${account.id}` +
                    `&reportId=${reportId}` +
                    `&startDate=${startDate}&endDate=${endDate}`;

        // Limit to 5 rows
        const rowsMd = json.results.slice(0, 5)
          .map((r) => {
            const dateOnly = r.date.split(" ")[0];
            return `| ${dateOnly} | ${r.spent.toFixed(2)} |`;
          })
          .join("\n");

        const markdown = `
# Report for ${account.name}

**Date range:** ${startDate} → ${endDate}  
**Breakdown:** ${breakdown.replace(/_/g, " ")}

| Date       | Spent |
|------------|------:|
${rows.join("\n")}
${totalRow}

[See more in Realize](${guiLink})
        `;
        push(
          <Detail
            markdown={markdown}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open Full Report in Realize" url={guiLink} />
                <Action.Push
                  title="Change Filters"
                  target={<ReportForm account={account} />}

                />
              </ActionPanel>
            }
          />
        );
      }
        catch (err) {
        showToast({
          style: Toast.Style.Failure,
          title: "Report fetch failed",
          message: String(err),
        });
      }
    },
    validation: {
      from: (v) => (new Date(v) > yesterday ? "From must be on or before yesterday" : undefined),
      to:   (v) => (new Date(v) > yesterday ? "To must be on or before yesterday" : undefined),
      breakdown: (v) => (v ? undefined : "Breakdown is required"),
    },
     initialValues: {
         from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
         to:   yesterday,                                     // yesterday
         breakdown: "",
       },
  });

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Fetch Report" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.DatePicker title="From" type="date" max={yesterday} {...itemProps.from} />
      <Form.DatePicker title="To" type="date" max={yesterday} {...itemProps.to} />
      <Form.Dropdown title="Breakdown" {...itemProps.breakdown}>
        {Object.entries(dimensionDisplayMap).map(([value, label]) => (
          <Form.Dropdown.Item key={value} value={value} title={label} />
        ))}
      </Form.Dropdown>

    </Form>
  );
}