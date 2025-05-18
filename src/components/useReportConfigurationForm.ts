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
}

interface ReportResult {
  markdown: string;
  guiLink: string;
  breakdown: string;
}

export function useReportConfigurationForm({ account }: UseReportConfigurationFormProps) {
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

  useEffect(() => {
    let mounted = true;
    async function loadRule() {
      if (!account || !account.account_id) return;
      const loadedRule = await loadPrimaryRule(account.account_id);
      if (mounted) {
        if (loadedRule) {
          setForm(f => ({
            ...f,
            activeConversionRule: loadedRule,
            cpaGoalInput: loadedRule?.cpaGoal?.toString() ?? "",
            includeConversionData: !!loadedRule,
            noConversionRuleGuidance: null,
            subAccounts: [],
          }));
        } else {
          // No conversion rule found
          if (account.is_network) {
            // In network context, guide to drill down to sub-accounts
            const { getSubAccountsForNetwork } = await import("../lib/useAccounts");
            const subAccounts = await getSubAccountsForNetwork(account.account_id);
            setForm(f => ({
              ...f,
              activeConversionRule: null,
              cpaGoalInput: "",
              includeConversionData: false,
              noConversionRuleGuidance: subAccounts.length > 0
                ? "No conversion rules found for this network. Please drill down to a sub-account to check for available rules."
                : "No conversion rules or sub-accounts found for this network.",
              subAccounts,
            }));
          } else if (account.network_account_id) {
            // In account context, guide to look up the network
            setForm(f => ({
              ...f,
              activeConversionRule: null,
              cpaGoalInput: "",
              includeConversionData: false,
              noConversionRuleGuidance: "No conversion rules found for this account. Please check the parent network for available rules.",
              subAccounts: [],
            }));
          } else {
            // Standalone account, no network
            setForm(f => ({
              ...f,
              activeConversionRule: null,
              cpaGoalInput: "",
              includeConversionData: false,
              noConversionRuleGuidance: "No conversion rules found for this account.",
              subAccounts: [],
            }));
          }
        }
      }
    }
    loadRule();
    return () => { mounted = false; };
  }, [account?.account_id]);

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

      const reportResultData: FetchReportResult = await fetchReport(
        account.account_id,
        form.breakdown,
        startDateStr,
        endDateStr,
        form.includeConversionData && ruleToUse ? ruleToUse.id : undefined,
        form.includeConversionData
      );

      let conversionMetricKey: string | undefined = undefined;
      let conversionMetricCaption: string | undefined = undefined;
      let cpaMetricKey: string | undefined = undefined;
      let cpaMetricCaption: string | undefined = undefined;
      let conversionWarning = "";
      let cpaWarning = "";

      if (form.includeConversionData && ruleToUse && reportResultData.dynamicFieldCaptions) {
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
