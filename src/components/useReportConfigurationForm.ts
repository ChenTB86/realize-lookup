import { useEffect, useState, useCallback } from "react";
import { showToast, Toast } from "@raycast/api";
import { fetchReport, FetchReportResult } from "../lib/reportService";
import { buildMarkdown, MarkdownConfig } from "../lib/reportFormatter";
import { loadPrimaryRule, savePrimaryRule, clearPrimaryRule, ConversionRule } from "../lib/conversionRulesService";
import { Account } from "../lib/useAccounts";

export const breakdownOptions = [
  { title: "Day", value: "day" },
  { title: "Week", value: "week" },
  { title: "Month", value: "month" },
  { title: "Campaign", value: "campaign_breakdown" },
  { title: "Ad (Item)", value: "item_breakdown" },
  { title: "Site", value: "site_breakdown" },
  { title: "Country", value: "country_breakdown" },
  { title: "Platform", value: "platform_breakdown" },
];

export const getStartOfDay = (date: Date): Date => {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

interface UseReportConfigurationFormProps {
  account: Account;
  onAccountChange?: (account: Account) => void;
}

interface ReportResult {
  markdown: string;
  guiLink: string;
  breakdown: string;
  rows: import("../lib/reportService").ReportRow[];
}

export function useReportConfigurationForm({ account, onAccountChange }: UseReportConfigurationFormProps) {
  const [form, setForm] = useState(() => ({
    startDate: getStartOfDay(new Date(new Date().setDate(new Date().getDate() - 7))),
    endDate: getStartOfDay(new Date(new Date().setDate(new Date().getDate() - 1))),
    breakdown: "day",
    includeConversionData: false,
    cpaGoalInput: "",
    activeConversionRule: null as ConversionRule | null,
    cpaError: "",
    isLoading: false,
    noConversionRuleGuidance: null as string | null,
    subAccounts: [] as Account[],
  }));

  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [validConversionRules, setValidConversionRules] = useState<ConversionRule[]>([]);

  useEffect(() => {
    let mounted = true;
    async function loadRule() {
      if (!account || !account.account_id) return;
      // Fetch valid conversion rules for this account
      let rules = await (await import("../lib/conversionRulesService")).fetchConversionRules(account.account_id);
      const logFirstN = (arr: ConversionRule[], n: number) => arr.length > n ? [...arr.slice(0, n), `...and ${arr.length - n} more`] : arr;
      console.log(`[ReportConfigForm][DEBUG] Raw conversion rules for account ${account.account_id} (count: ${rules.length}):`, logFirstN(rules, 3));

      // Filter to only rules with include_in_total_conversions === true for all accounts
      const filteredRules = rules.filter(r => r.include_in_total_conversions === true);
      console.log(`[ReportConfigForm][DEBUG] Filtered rules with include_in_total_conversions=true for account ${account.account_id} (count: ${filteredRules.length}):`, logFirstN(filteredRules, 3));
      rules = filteredRules;

      setValidConversionRules(rules);

      const loadedRule = await loadPrimaryRule(account.account_id);

      // Only allow a loaded rule if it is in the list of valid rules for this account
      const validRule = loadedRule && rules.find(r => r.id === loadedRule.id) ? loadedRule : null;

      if (mounted) {
        let subAccounts: Account[] = [];
        if (account.is_network) {
          const { getSubAccountsForNetwork } = await import("../lib/useAccounts");
          console.log(`[ReportConfigForm][DEBUG] Fetching subaccounts for account_id: ${account.account_id}`);
          subAccounts = await getSubAccountsForNetwork(account.account_id);
        }
        if (validRule || !validRule) {
          setForm(f => ({
            ...f,
            activeConversionRule: validRule || null,
            cpaGoalInput: validRule?.cpaGoal?.toString() ?? "",
            includeConversionData: !!validRule,
            noConversionRuleGuidance: validRule ? null : (
              account.is_network
                ? (subAccounts.length > 0
                  ? "No conversion rules found for this network. Please drill down to a sub-account to check for available rules."
                  : "No conversion rules or sub-accounts found for this network.")
                : (account.network_account_id
                  ? "No conversion rules found for this account. Please check the parent network for available rules."
                  : "No conversion rules found for this account.")
            ),
            subAccounts,
          }));
        }
      }
    }
    loadRule();
    return () => { mounted = false; };
  }, [account?.account_id]);

  const handleConversionRuleSelected = useCallback(
    async (rule: ConversionRule) => {
      // Only allow selection if rule is in validConversionRules for this account
      if (!validConversionRules.find(r => r.id === rule.id)) {
        setForm(f => ({
          ...f,
          activeConversionRule: null,
          includeConversionData: false,
          cpaGoalInput: "",
          cpaError: "",
          noConversionRuleGuidance: "Selected rule is not valid for this account. Please select a valid conversion rule or choose a sub-account."
        }));
        showToast(Toast.Style.Failure, "Invalid Rule", "This rule is not valid for the current account. Please select a valid rule.");
        return;
      }

      // If advertiser_id is present and does not match the current account, inform the user and switch to subaccount reporting
      if (rule.advertiser_id && String(rule.advertiser_id) !== String(account.account_id)) {
        showToast(Toast.Style.Animated, "Rule is for a subaccount", `Rule advertiser_id: ${rule.advertiser_id} (current account: ${account.account_id}). Switching to subaccount for reporting. If you prefer spend-only reporting, please navigate back.`);
        // Try to find the subaccount by advertiser_id
        let subAccount = null;
        if (form.subAccounts && form.subAccounts.length > 0) {
          subAccount = form.subAccounts.find(acc => String(acc.account_id) === String(rule.advertiser_id));
        }
        if (subAccount) {
          // Switch the account context in the parent
          if (typeof onAccountChange === "function") {
            onAccountChange(subAccount);
            showToast(Toast.Style.Success, "Switched to Subaccount", `Now reporting for: ${subAccount.name} (${subAccount.account_id})`);
            return;
          }
          // Fallback: update form state only
          setForm(f => ({
            ...f,
            activeConversionRule: null,
            includeConversionData: false,
            cpaGoalInput: "",
            cpaError: "",
            noConversionRuleGuidance: `Switched to subaccount: ${subAccount.name} (${subAccount.account_id}) for reporting.`
          }));
          showToast(Toast.Style.Success, "Switched to Subaccount", `Now reporting for: ${subAccount.name} (${subAccount.account_id})`);
        } else {
          setForm(f => ({
            ...f,
            activeConversionRule: rule,
            includeConversionData: true,
            cpaGoalInput: rule.cpaGoal?.toString() ?? "",
            cpaError: "",
            noConversionRuleGuidance: `Rule is for advertiser_id ${rule.advertiser_id}, not the current account. Switched to subaccount reporting.`
          }));
        }
        return;
      }

      setForm(f => ({
        ...f,
        activeConversionRule: rule,
        includeConversionData: true,
        cpaGoalInput: rule.cpaGoal?.toString() ?? "",
        cpaError: "",
        noConversionRuleGuidance: null
      }));
      if (account && account.account_id) {
        await savePrimaryRule(account.account_id, rule);
        showToast(Toast.Style.Success, "Rule Selected", `Using "${rule.display_name}" as primary.`);
      }
    },
    [account, validConversionRules]
  );

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

  const handleManualSubmit = async () => {
    if (form.cpaError) return;
    setForm(f => ({ ...f, isLoading: true }));
    setReportResult(null);
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

      let reportResultData: FetchReportResult;
      if (form.breakdown === "site_breakdown") {
        // Use streaming paged fetch for site_breakdown
        const { fetchSiteBreakdownPaged } = await import("../lib/reportService");
        // TODO: Allow user to select page; default to 1 for now
        const paged = await fetchSiteBreakdownPaged(
          account.account_id,
          startDateStr,
          endDateStr,
          form.includeConversionData && ruleToUse ? ruleToUse.id : undefined,
          form.includeConversionData,
          1 // page 1 by default
        );
        reportResultData = { rows: paged.rows, dynamicFieldCaptions: {} };
        if (paged.rows && paged.rows.length > 0) {
          console.log("[ReportConfigForm][DEBUG] First site_breakdown row:", paged.rows[0]);
        } else {
          console.log("[ReportConfigForm][DEBUG] No rows returned for site_breakdown.");
        }
      } else {
        reportResultData = await fetchReport(
          account.account_id,
          form.breakdown,
          startDateStr,
          endDateStr,
          form.includeConversionData && ruleToUse ? ruleToUse.id : undefined,
          form.includeConversionData
        );
      }

      let conversionMetricKey: string | undefined = undefined;
      let conversionMetricCaption: string | undefined = undefined;
      let cpaMetricKey: string | undefined = undefined;
      let cpaMetricCaption: string | undefined = undefined;
      let conversionWarning = "";
      let cpaWarning = "";

      if (form.includeConversionData && ruleToUse) {
        // Try dynamicFieldCaptions mapping first
        if (reportResultData.dynamicFieldCaptions && Object.keys(reportResultData.dynamicFieldCaptions).length > 0) {
          for (const [key, caption] of Object.entries(reportResultData.dynamicFieldCaptions)) {
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
          for (const [key, caption] of Object.entries(reportResultData.dynamicFieldCaptions)) {
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
        }

        // Fallback: If no dynamic fields, check for standard fields in the first row
        if (!conversionMetricKey && reportResultData.rows && reportResultData.rows.length > 0) {
          const firstRow = reportResultData.rows[0];
          // Try to use cpa_actions_num_from_clicks or cpa_actions_num as conversions
          if (typeof firstRow.cpa_actions_num_from_clicks === "number") {
            conversionMetricKey = "cpa_actions_num_from_clicks";
            conversionMetricCaption = "Conversions (Clicks)";
          } else if (typeof firstRow.cpa_actions_num === "number") {
            conversionMetricKey = "cpa_actions_num";
            conversionMetricCaption = "Conversions";
          } else if (typeof firstRow.actions_num_from_clicks === "number") {
            conversionMetricKey = "actions_num_from_clicks";
            conversionMetricCaption = "Actions (Clicks)";
          } else if (typeof firstRow.actions === "number") {
            conversionMetricKey = "actions";
            conversionMetricCaption = "Actions";
          }
          // CPA
          if (typeof firstRow.cpa_clicks === "number") {
            cpaMetricKey = "cpa_clicks";
            cpaMetricCaption = "CPA (Clicks)";
          } else if (typeof firstRow.cpa === "number") {
            cpaMetricKey = "cpa";
            cpaMetricCaption = "CPA";
          }
        }

        if (!conversionMetricKey) {
          conversionWarning = `⚠️ No "Conversions (Clicks)" metric found for "${ruleToUse.display_name}". Please check API mapping.`;
        }
        if (!cpaMetricKey) {
          cpaWarning = `⚠️ No "CPA" metric found for "${ruleToUse.display_name}". Please check API mapping.`;
        }
        // Add log for troubleshooting conversion mapping
        console.log("[ReportConfigForm][DEBUG] Conversion mapping:", {
          ruleToUse,
          conversionMetricKey,
          conversionMetricCaption,
          cpaMetricKey,
          cpaMetricCaption,
          conversionWarning,
          cpaWarning,
          dynamicFieldCaptions: reportResultData.dynamicFieldCaptions,
        });
      }

      const config: MarkdownConfig = {
        accountName: account.name,
        accountId: account.id,
        accountCurrency: account.currency || "USD",
        breakdown: form.breakdown,
        startDate: startDateStr,
        endDate: endDateStr,
        rows: reportResultData.rows,
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
      setReportResult({
        markdown,
        guiLink,
        breakdown: form.breakdown,
        rows: reportResultData.rows,
      });
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
      setReportResult(null);
    } finally {
      setForm(f => ({ ...f, isLoading: false }));
    }
  };

  return {
    form,
    setForm,
    handleConversionRuleSelected,
    handleClearPrimaryRule,
    handleManualSubmit,
    reportResult,
  };
}
