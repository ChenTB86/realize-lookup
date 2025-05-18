// src/realize-get-account-data.tsx dimensionToLinkId
import { useEffect, useState, useCallback } from "react";
import { Action, ActionPanel, Detail, Form, List, showToast, Toast, useNavigation, Icon, Color } from "@raycast/api";
import { useForm } from "@raycast/utils";

import { buildMarkdown, PRETTY_DIMENSION as dimensionToLabel } from "./lib/reportFormatter";
import { useAccounts, EmptyView, Account } from "./lib/useAccounts";
import { fetchReport, ReportRow } from "./lib/reportService";

import ConversionRuleList from "./components/ConversionRuleList";
import {
  ConversionRule,
  loadPrimaryRule,
  savePrimaryRule,
  clearPrimaryRule,
} from "./lib/conversionRulesService";

/* inside the component that runs after the user picks an account */

const [rule, setRule] = useState<ConversionRule | null>(null);
const [step, setStep] = useState<"rules" | "form">("rules");   // wizard state
const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
const [activeConversionRule, setActiveConversionRule] = useState<ConversionRule | null>(null);
const [useAsPrimary, setUseAsPrimary] = useState(false); // For the checkbox
const [isLoadingRule, setIsLoadingRule] = useState(true); // For loading initial rule
const [showRuleSelection, setShowRuleSelection] = useState(false); // To push ConversionRuleList
const [ruleListParams, setRuleListParams] = useState<{ accountId: string; title: string; isNetwork: boolean } | null>(null);


// try to auto-load last used rule
useEffect(() => {
  loadPrimaryRule(account.account_id).then((ruleId) => {
    if (ruleId) setStep("form"); // skip list if already saved
  });
}, [account.account_id]);

if (step === "rules") {
  return (
    <ConversionRuleList
      accountId={account.account_id}
      accountName={account.name}
      onRuleChosen={(r) => {
        setRule(r);
        setStep("form");
      }}
    />
  );
}

/* then render the existing ReportForm, passing rule?.id if you need it */
return <ReportForm account={account} primaryRuleId={rule?.id} />;

type Props = { arguments: { query?: string } };
interface ReportValues {
  from: Date;
  to: Date;
  breakdown: string;
  usePrimaryRuleCheckbox: boolean;
}

export default function Command(props: Props) {
  const initial = props.arguments.query ?? "";
  const [searchText, setSearchText] = useState(initial);
  const { accounts, metadata, isLoading } = useAccounts(searchText);

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
                  <Action.Push title="Get Report Data" target={<ReportForm account={acc} />} />
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
    initialValues: {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      to: yesterday,
      breakdown: "day",
    },

    onSubmit: async ({ from, to, breakdown }) => {
      const startDate = from.toISOString().slice(0, 10);
      const endDate = to.toISOString().slice(0, 10);
      let rawReportData: any;
      let results: ReportRow[];

      try {
        rawReportData = await fetchReport(account.account_id, breakdown, startDate, endDate);
      } catch (err) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Fetch failed",
          message: String(err),
        });
        return;
      }

      if (Array.isArray(rawReportData)) {
        results = rawReportData;
      } else if (rawReportData && typeof rawReportData === "object") {
        // If your API might return a single object for a single result, wrap it.
        // Ensure the single object is compatible with ReportRow type.
        results = [rawReportData as ReportRow];
      } else {
        results = [];
        if (
          rawReportData != null &&
          !Array.isArray(rawReportData) &&
          !(typeof rawReportData === "object" && Object.keys(rawReportData).length > 0)
        ) {
          console.warn("Unexpected data format from API, treating as no results:", rawReportData);
          // You could show a less severe toast here if needed, or just proceed with empty results.
        }
      }

      if (results.length === 0) {
        await showToast({
          style: Toast.Style.Failure,
          title: "No data",
          message: `No data for ${startDate} → ${endDate}.`,
        });
        return;
      }

      const { markdown, guiLink } = buildMarkdown({
        accountName: account.name,
        accountId: account.id,
        breakdown,
        startDate,
        endDate,
        rows: results,
      });

      push(
        <Detail
          markdown={markdown}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Full Report in Realize" url={guiLink} />
              <Action.Push title="Change Filters" target={<ReportForm account={account} />} />
            </ActionPanel>
          }
        />,
      );
    },

    validation: {
      from: (v) => (v && v > yesterday ? "From must be on or before yesterday" : undefined),
      to: (v) => (v && v > yesterday ? "To must be on or before yesterday" : undefined),
      breakdown: (v) => (v ? undefined : "Breakdown is required"),
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
      <Form.DatePicker
        title="From"
        max={yesterday}
        type={Form.DatePicker.Type.Date}
        {...(itemProps.from as Form.ItemProps<Date | null>)}
      />
      <Form.DatePicker
        title="To"
        max={yesterday}
        type={Form.DatePicker.Type.Date}
        {...(itemProps.to as Form.ItemProps<Date | null>)}
      />
      <Form.Dropdown title="Breakdown" {...itemProps.breakdown}>
        {Object.entries(dimensionToLabel).map(([value, label]) => (
          <Form.Dropdown.Item key={value} value={value} title={label} />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
