// src/lib/reportFormatter.ts

import type { ReportRow } from "./reportService";

// Map API dimension keys → human labels
export const dimensionDisplayMap: Record<string, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  by_hour_of_day: "Hour of Day",
  campaign_breakdown: "Campaign",
  site_breakdown: "Site",
  country_breakdown: "Country",
  platform_breakdown: "Platform",
  item_breakdown: "By Ad",
};

// Map dimension keys → Realize GUI reportId
export const reportIdMap: Record<string, string> = {
  day: "day",
  week: "week",
  month: "month",
  by_hour_of_day: "hour-of-day",
  campaign_breakdown: "campaigns",
  site_breakdown: "site",
  country_breakdown: "country",
  platform_breakdown: "platform",
  item_breakdown: "creative",
};

interface FormatterOptions {
  accountName: string;
  accountId: number;
  breakdown: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  rows: ReportRow[];
}

export function buildMarkdown({ accountName, accountId, breakdown, startDate, endDate, rows }: FormatterOptions): {
  markdown: string;
  guiLink: string;
} {
  // 1) Currency formatter
  const currency = rows[0]?.currency || "USD";
  const fmt = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });

  // 2) Active count for campaigns
  let activeLine = "";
  if (breakdown === "campaign_breakdown") {
    const activeCount = rows.filter((r) => r.spent > 0).length;
    activeLine = `**Active campaigns with spend**: ${activeCount}\n\n`;
  }

  // 3) Build header & rows
  let header = "";
  let bodyRows: string[] = [];

  if (breakdown === "item_breakdown") {
    header = `| Item ID | Item Name | URL | Spent |
|---------|-----------|-----|-------|`;
    bodyRows = rows.slice(0, 5).map((r) => {
      const id = r.item ?? "–";
      const name = (r as any).item_name ?? "–";
      const link = (r as any).url ?? (r as any).thumbnail_url ?? "";
      const urlCell = link ? `[↗](${link})` : "–";
      return `| ${id} | ${name.replace(/\|/g, "\\|")} | ${urlCell} | ${fmt.format(r.spent)} |`;
    });
  } else if (breakdown === "campaign_breakdown") {
    header = `| Campaign ID | Campaign Name                           | Spent |
|-------------|------------------------------------------|------:|`;
    bodyRows = rows.slice(0, 5).map((r) => {
      const name = (r as any).campaign_name ?? "–";
      return `| ${r.campaign} | ${name.replace(/\|/g, "\\|")} | ${fmt.format(r.spent)} |`;
    });
  } else if (breakdown === "site_breakdown") {
    header = `| Site | Spent |
|------|------:|`;
    bodyRows = rows.slice(0, 5).map((r) => `| ${(r as any).site ?? "–"} | ${fmt.format(r.spent)} |`);
  } else if (breakdown === "country_breakdown") {
    header = `| Country | Spent |
|---------|------:|`;
    bodyRows = rows.slice(0, 5).map((r) => `| ${(r as any).country ?? "–"} | ${fmt.format(r.spent)} |`);
  } else if (breakdown === "platform_breakdown") {
    header = `| Platform | Spent |
|----------|------:|`;
    bodyRows = rows.slice(0, 5).map((r) => `| ${(r as any).platform ?? "–"} | ${fmt.format(r.spent)} |`);
  } else if (breakdown === "by_hour_of_day") {
    header = `| Hour of Day | Spent |
|-------------|------:|`;
    bodyRows = rows.slice(0, 5).map((r) => {
      const hour = (r as any).hour_of_day ?? "–";
      return `| ${hour} | ${fmt.format(r.spent)} |`;
    });
  } else {
    // date‐based (day, week, month)
    header = `| Date       | Spent |
|------------|------:|`;
    bodyRows = rows.slice(0, 5).map((r) => {
      const dateOnly = r.date!.split(" ")[0];
      return `| ${dateOnly} | ${fmt.format(r.spent)} |`;
    });
  }

  // 4) Total row
  const total = rows.reduce((sum, r) => sum + r.spent, 0);
  const totalRow = `| **Total** | **${fmt.format(total)}** |`;

  // 5) GUI link
  const reportId = reportIdMap[breakdown] || "campaigns";
  const guiLink =
    `https://ads.realizeperformance.com/campaigns?accountId=${accountId}` +
    `&reportId=${reportId}&startDate=${startDate}&endDate=${endDate}`;

  // 6) Assemble markdown
  const markdown = `# Report for ${accountName}

${activeLine}**Date range:** ${startDate} → ${endDate}  
**Breakdown:** ${dimensionDisplayMap[breakdown]}

${header}
${bodyRows.join("\n")}
${totalRow}

[See more in Realize](${guiLink})`;

  return { markdown, guiLink };
}
