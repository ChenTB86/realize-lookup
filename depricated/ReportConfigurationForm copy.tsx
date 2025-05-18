// src/components/ReportConfigurationForm.tsx
import {
  ActionPanel,
  Action,
  Form,
  Detail,
  showToast,
  Toast,
  useNavigation,
  Icon
} from "@raycast/api";
import { useEffect, useState, useCallback } from "react";
import { fetchReport, FetchReportResult } from "../lib/reportService";
import { buildMarkdown, MarkdownConfig, PRETTY_DIMENSION } from "../lib/reportFormatter";
import { loadPrimaryRule, savePrimaryRule, clearPrimaryRule, ConversionRule } from "../lib/conversionRulesService";
import RunningCampaignList from "./RunningCampaignList";
import ConversionRuleList from "./ConversionRuleList";
import { Account } from "../lib/useAccounts";

interface ReportConfigurationViewProps {
  account: Account;
}

const breakdownOptions = [
  { title: "Day", value: "day" },
  { title: "Week", value: "week" },
  { title: "Month", value: "month" },
  { title: "Campaign", value: "campaign_breakdown" },
  { title: "Ad (Item)", value: "item_breakdown" },
  { title: "Site", value: "site_breakdown" },
  { title: "Country", value: "country_breakdown" },
  { title: "Platform", value: "platform_breakdown" },
];

const getStartOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

export function ReportConfigurationView({ account }: ReportConfigurationViewProps) {
  const navigation = useNavigation();

  // Use a single state object for the form
  const [form, setForm] = useState(() => ({
    startDate: getStartOfDay(new Date(new Date().setDate(new Date().getDate() - 7))),
    endDate: getStartOfDay(new Date(new Date().setDate(new Date().getDate() - 1))),
    breakdown: "day",
    includeConversionData: false,
    cpaGoalInput: "",
    activeConversionRule: null as ConversionRule | null,
    cpaError: "",
    isLoading: false,
  }));

  // Load primary rule on mount or account change
  useEffect(() => {
    let mounted = true;
    async function loadRule() {
      if (!account || !account.account_id) return;
      const loadedRule = await loadPrimaryRule(account.account_id);
      if (mounted) {
        setForm(f => ({
          ...f,
          activeConversionRule: loadedRule,
          cpaGoalInput: loadedRule?.cpaGoal?.toString() ?? "",
          includeConversionData: !!loadedRule,
        }));
      }
    }
    loadRule();
    return () => { mounted = false; };
  }, [account?.account_id]);

  // (Removed unused handleCpaInputChange)

  // Handle conversion rule selection
  const handleConversionRuleSelected = useCallback(
    async (rule: ConversionRule) => {
      setForm(f => ({
        ...f,
        activeConversionRule: rule,
        includeConversionData: true,
        cpaGoalInput: rule.cpaGoal?.toString() ?? "",
        cpaError: "",
      }));
      if (account && account.account_id) {
        await savePrimaryRule(account.account_id, rule);
        showToast(Toast.Style.Success, "Rule Selected", `Using "${rule.display_name}" as primary.`);
      }
    },
    [account]
  );

  // Handle clear primary rule
  const handleClearPrimaryRule = useCallback(async () => {
    if (account && account.account_id) {
      await clearPrimaryRule(account.account_id);
      setForm(f => ({
        ...f,
        activeConversionRule: null,
        cpaGoalInput: "",
        includeConversionData: false,
        cpaError: "",
      }));
      showToast(Toast.Style.Success, "Primary Rule Cleared");
    }
  }, [account]);

  // Handle form submit
  const handleManualSubmit = async () => {
    if (form.cpaError) return;
    setForm(f => ({ ...f, isLoading: true }));
    await showToast({ style: Toast.Style.Animated, title: "Fetching Report..." });

    try {
      if (!form.startDate || !form.endDate) {
        await showToast({ style: Toast.Style.Failure, title: "Missing Dates", message: "Please select start and end dates." });
        setForm(f => ({ ...f, isLoading: false }));
        return;
      }
      if (form.endDate > getStartOfDay(new Date(new Date().setDate(new Date().getDate() - 1)))) {
        await showToast({ style: Toast.Style.Failure, title: "Invalid End Date", message: "End date cannot be later than yesterday." });
        setForm(f => ({ ...f, isLoading: false }));
        return;
      }
      if (form.startDate > form.endDate) {
        await showToast({ style: Toast.Style.Failure, title: "Invalid Date Range", message: "Start date cannot be after end date." });
        setForm(f => ({ ...f, isLoading: false }));
        return;
      }
      if (form.cpaGoalInput && (!/^\d+$/.test(form.cpaGoalInput) || Number(form.cpaGoalInput) < 10 || Number(form.cpaGoalInput) >= 1000)) {
        await showToast({ style: Toast.Style.Failure, title: "Invalid CPA Goal", message: "CPA Goal must be a positive integer between 10 and 1000" });
        setForm(f => ({ ...f, isLoading: false }));
        return;
      }

      const startDateStr = form.startDate.toISOString().split("T")[0];
      const endDateStr = form.endDate.toISOString().split("T")[0];
      const ruleToUse = form.activeConversionRule;
      const cpaGoalFromInputVal = form.cpaGoalInput ? parseFloat(form.cpaGoalInput) : undefined;

      if (form.includeConversionData && ruleToUse && account.account_id) {
        if (ruleToUse.cpaGoal !== cpaGoalFromInputVal) {
          await savePrimaryRule(account.account_id, { ...ruleToUse, cpaGoal: cpaGoalFromInputVal });
        }
      }

      const reportResult: FetchReportResult = await fetchReport(
        account.account_id,
        form.breakdown,
        startDateStr,
        endDateStr,
        form.includeConversionData && ruleToUse ? ruleToUse.id : undefined,
        form.includeConversionData
      );

      // Find conversion and CPA metric keys
      let conversionMetricKey: string | undefined = undefined;
      let conversionMetricCaption: string | undefined = undefined;
      let cpaMetricKey: string | undefined = undefined;
      let cpaMetricCaption: string | undefined = undefined;
      let conversionWarning = "";
      let cpaWarning = "";

      if (form.includeConversionData && ruleToUse && reportResult.dynamicFieldCaptions) {
        for (const [key, caption] of Object.entries(reportResult.dynamicFieldCaptions)) {
          if (
            caption &&
            ruleToUse.display_name &&
            caption.toLowerCase().includes(ruleToUse.display_name.toLowerCase()) &&
            caption.toLowerCase().includes(": conversions (clicks)")
          ) {
            conversionMetricKey = key;
            conversionMetricCaption = caption;
            break;
          }
        }
        for (const [key, caption] of Object.entries(reportResult.dynamicFieldCaptions)) {
          if (
            caption &&
            ruleToUse.display_name &&
            caption.toLowerCase().includes(ruleToUse.display_name.toLowerCase()) &&
            caption.toLowerCase().includes(": cpa (clicks)")
          ) {
            cpaMetricKey = key;
            cpaMetricCaption = caption;
            break;
          }
        }
        if (!conversionMetricKey) {
          conversionWarning = `⚠️ No "Conversions (Clicks)" metric found for "${ruleToUse.display_name}". Please check API mapping.`;
        }
        if (!cpaMetricKey) {
          cpaWarning = `⚠️ No "CPA" metric found for "${ruleToUse.display_name}". Please check API mapping.`;
        }
      }

      const config: MarkdownConfig = {
        accountName: account.name,
        accountId: account.id,
        accountCurrency: account.currency || "USD",
        breakdown: form.breakdown,
        startDate: startDateStr,
        endDate: endDateStr,
        rows: reportResult.rows,
        conversionRuleName: form.includeConversionData && ruleToUse ? ruleToUse.display_name : undefined,
        conversionCountMetricId: conversionMetricKey,
        conversionCountCaption: conversionMetricCaption,
        cpaMetricId: cpaMetricKey,
        cpaCaption: cpaMetricCaption,
        cpaGoalValue: form.includeConversionData ? (ruleToUse?.cpaGoal ?? cpaGoalFromInputVal) : undefined,
      };

      if (conversionWarning || cpaWarning) {
        config.conversionCountCaption = (conversionWarning ? conversionWarning + " " : "") + (cpaWarning ? cpaWarning : "");
      }

      if (form.breakdown === "item_breakdown") {
        config.clicksMetricId = "clicks";
        config.impressionsMetricId = "impressions";
      }

      const { markdown, guiLink } = buildMarkdown(config);
      await showToast({ style: Toast.Style.Success, title: "Report Ready" });
      navigation.push(
        <Detail
          markdown={markdown}
          navigationTitle={`${PRETTY_DIMENSION[form.breakdown] || form.breakdown} Report`}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action.OpenInBrowser title="Open in Realize Gui" url={guiLink} />
                <Action.CopyToClipboard title="Copy Report Markdown" content={markdown} />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      );
    } catch (error) {
      console.error("[ReportForm] Submit Error:", error);
      let message = "An unexpected error occurred.";
      if (typeof error === "object" && error && "message" in error && typeof (error as { message?: unknown }).message === "string") {
        message = (error as { message: string }).message;
        if (message.toLowerCase().includes("fetch failed")) {
          message = "Network error: Could not connect. Please check your internet connection.";
          if (
            "cause" in error &&
            typeof (error as { cause?: unknown }).cause === "object" &&
            (error as { cause?: { code?: unknown } }).cause &&
            "code" in (error as { cause?: { code?: unknown } }).cause! &&
            (error as { cause?: { code?: unknown } }).cause!.code === "ENOTFOUND"
          ) {
            message = `Network error: Host not found. Please check internet/VPN.`;
          }
        }
      }
      await showToast({ style: Toast.Style.Failure, title: "Error Fetching Report", message: message.substring(0, 150) });
    } finally {
      setForm(f => ({ ...f, isLoading: false }));
    }
  };

  if (!account) {
    return <Detail markdown="# Error: Account data is missing." />;
  }

  return (
    <Form
      isLoading={form.isLoading}
      navigationTitle={`Report for ${account.name}`}
      actions={
        <ActionPanel>
          <Action title="Fetch Report" icon={Icon.Download} onAction={handleManualSubmit} />
          {RunningCampaignList && (
            <Action.Push
              title="View Active Campaigns"
              icon={Icon.List}
              target={<RunningCampaignList account={account} />}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          )}
          {ConversionRuleList && (
            <Action.Push
              title={form.activeConversionRule && form.includeConversionData ? "Change Conversion Rule" : "Select Conversion Rule"}
              icon={Icon.BullsEye}
              target={
                <ConversionRuleList
                  listTitle={`Rules for ${account.name}`}
                  accountIdToFetch={account.account_id}
                  onRuleSelected={handleConversionRuleSelected}
                  currentPrimaryRuleId={form.activeConversionRule?.id}
                  onCancel={() => {
                    setForm(f => ({ ...f, includeConversionData: false }));
                  }}
                />
              }
              shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            />
          )}
          {form.activeConversionRule && form.includeConversionData && (
            <Action
              title="Clear Selected Rule"
              icon={Icon.XMarkCircle}
              onAction={handleClearPrimaryRule}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "opt"], key: "backspace" }}
            />
          )}
        </ActionPanel>
      }
    >
      <Form.DatePicker
        id="startDate"
        title="Start Date"
        value={form.startDate}
        onChange={date => setForm(f => ({ ...f, startDate: date ?? f.startDate }))}
      />
      <Form.DatePicker
        id="endDate"
        title="End Date"
        value={form.endDate}
        onChange={date => setForm(f => ({ ...f, endDate: date ?? f.endDate }))}
      />
      <Form.Dropdown
        id="breakdown"
        title="Breakdown"
        value={form.breakdown}
        onChange={val => setForm(f => ({ ...f, breakdown: val }))}
      >
        {breakdownOptions.map(opt => (
          <Form.Dropdown.Item key={opt.value} value={opt.value} title={opt.title} />
        ))}
      </Form.Dropdown>
      <Form.Separator />
      <Form.Separator />
      <Form.Description
        title="Primary Conversion"
        text={
          form.activeConversionRule && form.activeConversionRule.display_name
            ? form.activeConversionRule.display_name
            : "Only Spend - select Primary conversion to enable the report to present"
        }
      />
    </Form>
  );
}
