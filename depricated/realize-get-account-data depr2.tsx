// src/realize-get-account-data.tsx
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
import { useAccounts, EmptyView, Account } from "./lib/useAccounts";
import { fetchReport, ReportRow } from "./lib/reportService";
import { BASE_URL } from "./lib/config";

type Props = { arguments: { query?: string } };
interface ReportValues { from: Date; to: Date; breakdown: string; }

// Display labels
const dimensionDisplayMap: Record<string, string> = {
  day:                "Day",
  week:               "Week",
  month:              "Month",
  by_hour_of_day:     "Hour of Day",
  campaign_breakdown: "Campaign",
  site_breakdown:     "Site",
  country_breakdown:  "Country",
  platform_breakdown: "Platform",
  item_breakdown:     "By Ad",
};

const reportIdMap: Record<string, string> = {
  day:               "campaigns",
  week:              "campaigns",
  month:             "campaigns",
  by_hour_of_day:    "campaigns",
  campaign_breakdown:"campaigns",
  site_breakdown:    "campaigns",
  country_breakdown: "campaigns",
  platform_breakdown:"campaigns",
  item_breakdown:    "creative",
};

export default function Command(props: Props) {
  const initial = props.arguments.query ?? "";
  const [searchText, setSearchText] = useState(initial);
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
          {accounts.map((acc) => (
            <List.Item
              key={acc.id}
              title={acc.name}
              subtitle={`ID: ${acc.id}`}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Get Report Data"
                    target={<ReportForm account={acc} />}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
      {!metadata && !isLoading && <EmptyView />}
    </List>
  );
}

function ReportForm({ account }: { account: Account }) {
  const { push } = useNavigation();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const { handleSubmit, itemProps } = useForm<ReportValues>({
    onSubmit: async ({ from, to, breakdown }) => {
      const startDate = from.toISOString().slice(0, 10);
      const endDate   = to.toISOString().slice(0, 10);

      let results: ReportRow[];
      try 
      {
        results = await fetchReport(account.account_id, breakdown, startDate, endDate);
      } catch (err) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Fetch failed",
          message: String(err),
        });
        return;
      }

      // Currency formatter
      const currency = results[0]?.currency || "USD";
      const fmt = new Intl.NumberFormat(undefined, {
        style:           "currency",
        currency,
        maximumFractionDigits: 0,
      });

      // Build table header + rows
      let header: string;
      let rows: string[];
      if (breakdown === "item_breakdown") {
       // By Ad: Item ID / Item Name / URL / Spent
        // 1) Header + underline
        header =
          "| Item ID    | Item Name                 | URL                                | Spent |" +
          "\n|------------|---------------------------|------------------------------------|------:|";

        // 2) Rows (escape any pipes in names)
        rows = results.slice(0, 5).map((r) => {
          const id   = r.item ?? r.creative ?? "—";
          // escape any '|' in the name
          const rawName = (r as any).item_name || (r as any).campaign_name || "—";
          const name = rawName.replace(/\|/g, "\\|");
          const link = (r as any).url || (r as any).thumbnail_url || "";
          const urlCell = link ? `[↗](${link})` : "—";
          return `| ${id} | ${name} | ${urlCell} | ${fmt.format(r.spent)} |`;
        });
      } else if (breakdown === "campaign_breakdown") {
        header = "| Campaign ID        | Spent |";
        rows = results.slice(0, 5).map((r) => `| ${r.campaign} | ${fmt.format(r.spent)} |`);
      } else if (breakdown === "site_breakdown") {
        header = "| Site               | Spent |";
        rows = results.slice(0, 5).map((r) => `| ${r.site || "—"} | ${fmt.format(r.spent)} |`);
      } else if (breakdown === "country_breakdown") {
        header = "| Country            | Spent |";
        rows = results.slice(0, 5).map((r) => `| ${r.country || "—"} | ${fmt.format(r.spent)} |`);
      } else if (breakdown === "platform_breakdown") {
        header = "| Platform           | Spent |";
        rows = results.slice(0, 5).map((r) => `| ${r.platform || "—"} | ${fmt.format(r.spent)} |`);
      } else {
        header = "| Date       | Spent |";
        rows = results.slice(0, 5).map((r) => {
          const dateOnly = r.date!.split(" ")[0];
          return `| ${dateOnly} | ${fmt.format(r.spent)} |`;
        });
      }

      // Total row
      const total = results.reduce((sum, r) => sum + r.spent, 0);
      const totalRow = `| **Total** | **${fmt.format(total)}** |`;

      // GUI link
      const reportId = reportIdMap[breakdown] || "campaigns";
      const guiLink  =
        `https://ads.realizeperformance.com/campaigns?` +
        `accountId=${account.id}&reportId=${reportId}` +
        `&startDate=${startDate}&endDate=${endDate}`;

      // Render Detail with “Change Filters”
      const markdown = `
# Report for ${account.name}

**Date range:** ${startDate} → ${endDate}  
**Breakdown:** ${dimensionDisplayMap[breakdown]}

| Item ID    | Item Name                 | URL                                | Spent |
|------------|---------------------------|------------------------------------|------:|
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
              <Action.Push title="Change Filters" target={<ReportForm account={account} />} />
            </ActionPanel>
          }
        />
      );
    },

    validation: {
      from: (v) => (v > yesterday ? "From must be on or before yesterday" : undefined),
      to:   (v) => (v > yesterday ? "To must be on or before yesterday" : undefined),
      breakdown: (v) => (v ? undefined : "Breakdown is required"),
    },

    initialValues: {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      to:   yesterday,
      breakdown: "",
    },
  });

  return (
    <Form actions={<ActionPanel><Action.SubmitForm title="Fetch Report" onSubmit={handleSubmit} /></ActionPanel>}>
      <Form.DatePicker title="From" type="date" max={yesterday} {...itemProps.from} />
      <Form.DatePicker title="To"   type="date" max={yesterday} {...itemProps.to} />
      <Form.Dropdown title="Breakdown" {...itemProps.breakdown}>
        {Object.entries(dimensionDisplayMap).map(([value, label]) => (
          <Form.Dropdown.Item key={value} value={value} title={label} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}