// src/components/ReportConfigurationForm.tsx
import {
  ActionPanel,
  Action,
  Form,
  Detail,
  Icon,
  useNavigation
} from "@raycast/api";
import RunningCampaignList from "./RunningCampaignList";
import ConversionRuleList from "./ConversionRuleList";
import { Account } from "../lib/useAccounts";
import SubAccountList from "./SubAccountList";
/* import { loadPrimaryRule, ConversionRule } from "../lib/conversionRulesService"; */
import { showToast, Toast } from "@raycast/api";
import {
  useReportConfigurationForm,
  breakdownOptions,
} from "./useReportConfigurationForm";

interface ReportConfigurationViewProps {
  account: Account;
}

/* import { useEffect, useState } from "react"; */

import { useState } from "react";

export function ReportConfigurationView({ account }: ReportConfigurationViewProps) {
  const [currentAccount, setCurrentAccount] = useState(account);
  // Enables pushing a completely new view when drilling into a sub-account
  const { push } = useNavigation();

  const {
    form,
    setForm,
    handleConversionRuleSelected,
    handleClearPrimaryRule,
    handleManualSubmit,
    reportResult,
  } = useReportConfigurationForm({ account: currentAccount, onAccountChange: setCurrentAccount });


  // Handler for dropdown change
  const handlePrimaryConversionChange = (ruleId: string) => {
    if (!form.activeConversionRule && ruleId === "no-rules") {
      showToast(Toast.Style.Animated, "Select Primary Conversion", "Use the action panel to select a primary conversion rule.");
      return;
    }
    // If a rule is present, update the form state
    if (form.activeConversionRule && ruleId === form.activeConversionRule.id) {
      setForm((f) => ({
        ...f,
        activeConversionRule: f.activeConversionRule,
        includeConversionData: true,
        cpaGoalInput: f.activeConversionRule?.cpaGoal?.toString() ?? "",
        cpaError: "",
      }));
    }
  };

  if (!account) {
    return <Detail markdown="# Error: Account data is missing." />;
  }

  if (reportResult) {
    // XLSX Export Handler
    const handleDownloadXlsx = async () => {
      console.log("🚩 XLSX-DIAG:", Date.now());
      const { getTableColumns } = await import("../lib/reportFormatter");
      const { buildWorkbookSingle, mapRowsForXlsx } = await import("../lib/xlsxExporter");
      // These would need to be passed through reportResult or form for full accuracy
      const columns = getTableColumns(reportResult.breakdown, {
        // TODO: Pass conversionCountCaption, cpaCaption, clicksMetricId, impressionsMetricId if available
      });
      const mappedRows = mapRowsForXlsx(reportResult.rows || [], reportResult.breakdown, {
        // TODO: Pass conversionCountMetricId, cpaMetricId, clicksMetricId, impressionsMetricId if available
      });
      let filePath: string | undefined;
      try {
        filePath = await buildWorkbookSingle(
          mappedRows,
          reportResult.breakdown,
          columns,
          {
            accountName: account.name,
            startDate: form.startDate?.toISOString().split("T")[0],
            endDate: form.endDate?.toISOString().split("T")[0],
            cpaGoal: form.activeConversionRule?.cpaGoal
          }
        );
        console.log("[XLSX] created at", filePath);
      } catch (err) {
        console.error("[XLSX] write failed", err);
        filePath = undefined;
      }
      if (typeof filePath !== "string" || !filePath) {
        await showToast({ style: Toast.Style.Failure, title: "Export failed", message: "Could not create XLSX file – check download directory preference & permissions." });
        return;
      }
      await showToast({ style: Toast.Style.Success, title: "XLSX saved", message: filePath });
      // Use Raycast's Action.OpenInFinder instead of open(filePath)
      const { showInFinder } = await import("@raycast/api");
      await showInFinder(filePath);
    };

    return (
      <Detail
        markdown={reportResult.markdown}
        navigationTitle={`${reportResult.breakdown.charAt(0).toUpperCase() + reportResult.breakdown.slice(1)} Report`}
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              <Action.OpenInBrowser title="Open in Realize Gui" url={reportResult.guiLink} />
              <Action.CopyToClipboard title="Copy Report Markdown" content={reportResult.markdown} />
              <Action
                title="Download Xlsx"
                icon={Icon.Download}
                onAction={handleDownloadXlsx}
              />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Form
      isLoading={form.isLoading}
      navigationTitle={`Report for ${account.name}`}
      actions={
        <ActionPanel>
          <Action title="Fetch Report" icon={Icon.Download} onAction={handleManualSubmit} />
          <Action
            title="Download Full Xlsx"
            icon={Icon.Download}
            onAction={async () => {
              const { getTableColumns } = await import("../lib/reportFormatter");
              const { buildWorkbookMulti, mapRowsForXlsx } = await import("../lib/xlsxExporter");
              const { fetchReport, fetchSiteBreakdownPaged } = await import("../lib/reportService");
              await showToast({ style: Toast.Style.Animated, title: "Preparing XLSX..." });

              // Determine date range and conversion rule
              const startDateStr = form.startDate.toISOString().split("T")[0];
              const endDateStr = form.endDate.toISOString().split("T")[0];
              const ruleToUse = form.activeConversionRule;
              const includeConversionData = form.includeConversionData;

              // List of breakdowns to fetch
              const breakdowns = ["day", "campaign_breakdown", "platform_breakdown", "country_breakdown", "site_breakdown", "item_breakdown"];
              const breakdownMap: Record<string, Record<string, string | number | undefined>[]> = {};
              const columnsMap: Record<string, { header: string; key: string; width?: number; style?: object }[]> = {};

              const conversionCountCaption = "Conversions (Clicks)";
              const cpaCaption = "CPA (Clicks)";

              for (const breakdown of breakdowns) {
                // Resolve metric IDs/captions from the current form state for each breakdown
                const conversionCountMetricId = form.activeConversionRule?.id
                  ? (breakdown === "item_breakdown" ? "actions_num_from_clicks" : "cpa_actions_num_from_clicks")
                  : undefined;
                const cpaMetricId = form.activeConversionRule?.id ? "cpa_clicks" : undefined;
                const clicksMetricId = "clicks";
                const impressionsMetricId = "impressions";
                let rows: import("../lib/reportService").ReportRow[] = [];
                if (breakdown === "site_breakdown") {
                  // Fetch at least 50 sites (aggregate pages if needed)
                  let allRows: import("../lib/reportService").ReportRow[] = [];
                  let page = 1;
                  while (allRows.length < 50) {
                    const paged = await fetchSiteBreakdownPaged(
                      account.account_id,
                      startDateStr,
                      endDateStr,
                      includeConversionData && ruleToUse ? ruleToUse.id : undefined,
                      includeConversionData,
                      page
                    );
                    allRows = allRows.concat(paged.rows || []);
                    if (!paged.rows || paged.rows.length === 0) break;
                    if (allRows.length >= 50) break;
                    page++;
                  }
                  rows = allRows.slice(0, 50);
                } else {
                  const report = await fetchReport(
                    account.account_id,
                    breakdown,
                    startDateStr,
                    endDateStr,
                    includeConversionData && ruleToUse ? ruleToUse.id : undefined,
                    includeConversionData
                  );
                  rows = report.rows;
                }
                // Filter out records with less than 1 spend
                const filteredRows = rows.filter(r => typeof r.spent === "number" && r.spent >= 1);

                // Diagnostic: log first row for this breakdown
                if (filteredRows.length > 0) {
                   
                  console.log("RAW-ROW", breakdown, JSON.stringify(filteredRows[0], null, 2));
                }

                // Set options for columns and row mapping
                const isItem = breakdown === "item_breakdown";
                columnsMap[breakdown] = getTableColumns(breakdown, {
                  conversionCountCaption,
                  cpaCaption,
                  clicksMetricId,
                  impressionsMetricId,
                  includeClicks: true,
                  includeCTR: true,
                  includeUrl: isItem,
                  includeThumbnail: isItem,
                  accountCurrency: account.currency || "USD",
                });
                breakdownMap[breakdown] = mapRowsForXlsx(filteredRows, breakdown, {
                  conversionCountMetricId,
                  cpaMetricId,
                  clicksMetricId,
                  impressionsMetricId,
                  includeClicks: true,
                  includeCTR: true,
                  includeUrl: isItem,
                  includeThumbnail: isItem,
                });
              }

              console.log("🚩 XLSX-DIAG:", Date.now());
              let filePath: string | undefined;
              try {
                filePath = await buildWorkbookMulti(
                  breakdownMap,
                  columnsMap,
                  {
                    accountName: account.name,
                    startDate: form.startDate?.toISOString().split("T")[0],
                    endDate: form.endDate?.toISOString().split("T")[0],
                    cpaGoal: form.activeConversionRule?.cpaGoal
                  }
                );
                console.log("[XLSX] created at", filePath);
              } catch (err) {
                console.error("[XLSX] write failed", err);
                filePath = undefined;
              }
              if (typeof filePath !== "string" || !filePath) {
                await showToast({ style: Toast.Style.Failure, title: "Export failed", message: "Could not create XLSX file – check download directory preference & permissions." });
                return;
              }
              await showToast({ style: Toast.Style.Success, title: "Full XLSX saved", message: filePath });
              // Use Raycast's Action.OpenInFinder instead of open(filePath)
              const { showInFinder } = await import("@raycast/api");
              await showInFinder(filePath);
            }}
          />
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
              title={form.activeConversionRule ? "Change Conversion Rule" : "Select Conversion Rule"}
              icon={Icon.BullsEye}
              target={
                <ConversionRuleList
                  listTitle={`Rules for ${account.name}`}
                  accountIdToFetch={account.account_id}
                  onRuleSelected={(rule) => {
                    // If the rule is for a sub-account, push a new ReportConfigurationView for that sub-account
                    if (rule.advertiser_id && String(rule.advertiser_id) !== String(account.account_id) && form.subAccounts && form.subAccounts.length > 0) {
                      const subAccount = form.subAccounts.find(acc => String(acc.account_id) === String(rule.advertiser_id));
                      if (subAccount) {
                        // Launch a new ReportConfigurationView for the sub-account
                        push(<ReportConfigurationView account={subAccount} />);
                        return;
                      }
                    }
                    handleConversionRuleSelected(rule);
                  }}
                  currentPrimaryRuleId={form.activeConversionRule?.id}
                  onCancel={() => {
                    setForm(f => ({ ...f, includeConversionData: false }));
                  }}
                />
              }
              shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            />
          )}
          {form.activeConversionRule && (
            <Action
              title="Clear Selected Rule"
              icon={Icon.XMarkCircle}
              onAction={handleClearPrimaryRule}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "opt"], key: "backspace" }}
            />
          )}
          {/* Drill Down action for Network accounts */}
          {currentAccount.name.includes("Network") && (
            <Action.Push
              title="Drill Down"
              icon={Icon.ArrowRight}
              target={
                <SubAccountList
                  listTitle={`Accounts under ${currentAccount.name}`}
                  fetchSubAccounts={() => import("../lib/subAccountService").then(m => m.fetchSubAccounts(currentAccount))}
                  onSubAccountSelected={(acc: Account) => push(<ReportConfigurationView account={acc} />)}
                />
              }
              shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
            />
          )}
        </ActionPanel>
      }
    >
      <Form.Description
        title="Selected Account"
        text={account.name}
      />
      <Form.DatePicker
        id="startDate"
        title="Start Date"
        value={form.startDate}
        onChange={date => setForm(f => ({ ...f, startDate: date ?? f.startDate }))}
        type={Form.DatePicker.Type.Date}
      />
      <Form.DatePicker
        id="endDate"
        title="End Date"
        value={form.endDate}
        onChange={date => setForm(f => ({ ...f, endDate: date ?? f.endDate }))}
        type={Form.DatePicker.Type.Date}
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
      {/* Primary Conversion Dropdown */}
      <Form.Dropdown
        id="primaryConversion"
        title="Primary Conversion"
        value={form.activeConversionRule ? form.activeConversionRule.id : "no-rules"}
        onChange={handlePrimaryConversionChange}
        isLoading={form.isLoading}
        storeValue={false}
      >
        {!form.activeConversionRule && (
          <Form.Dropdown.Item value="no-rules" title="No rules available yet" />
        )}
        {form.activeConversionRule && (
          <Form.Dropdown.Item value={form.activeConversionRule.id} title={form.activeConversionRule.display_name} />
        )}
      </Form.Dropdown>

      {/* CPA Goal Field */}
      {form.activeConversionRule && (
        <Form.TextField
          id="cpaGoalInput"
          title={`CPA Goal (${account.currency || "Account Currency"})`}
          placeholder="Enter CPA goal"
          value={form.cpaGoalInput}
          onChange={val => setForm(f => ({ ...f, cpaGoalInput: val }))}
          error={form.cpaError}
        />
      )}
    </Form>
  );
}
