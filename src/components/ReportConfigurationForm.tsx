// src/components/ReportConfigurationForm.tsx
import {
  ActionPanel,
  Action,
  Form,
  Detail,
  Icon
} from "@raycast/api";
import RunningCampaignList from "./RunningCampaignList";
import ConversionRuleList from "./ConversionRuleList";
import { Account } from "../lib/useAccounts";
import { loadPrimaryRule, ConversionRule } from "../lib/conversionRulesService";
import { showToast, Toast } from "@raycast/api";
import {
  useReportConfigurationForm,
  breakdownOptions,
} from "./useReportConfigurationForm";

interface ReportConfigurationViewProps {
  account: Account;
}

import { useEffect, useState } from "react";

export function ReportConfigurationView({ account }: ReportConfigurationViewProps) {
  const {
    form,
    setForm,
    handleConversionRuleSelected,
    handleClearPrimaryRule,
    handleManualSubmit,
    reportResult,
  } = useReportConfigurationForm({ account });

  const [primaryRule, setPrimaryRule] = useState<ConversionRule | null>(null);
  const [loadingPrimaryRule, setLoadingPrimaryRule] = useState<boolean>(true);
  // Load primary rule from local storage on mount and after selection
  useEffect(() => {
    let mounted = true;
    setLoadingPrimaryRule(true);
    loadPrimaryRule(account.account_id)
      .then((rule) => {
        if (mounted) setPrimaryRule(rule);
      })
      .finally(() => {
        if (mounted) setLoadingPrimaryRule(false);
      });
    return () => {
      mounted = false;
    };
  }, [account.account_id, form.activeConversionRule?.id]);

  // Handler for dropdown change
  const handlePrimaryConversionChange = (ruleId: string) => {
    if (!primaryRule && ruleId === "no-rules") {
      showToast(Toast.Style.Animated, "Select Primary Conversion", "Use the action panel to select a primary conversion rule.");
      return;
    }
    // If a rule is present, update the form state
    if (primaryRule && ruleId === primaryRule.id) {
      setForm((f) => ({
        ...f,
        activeConversionRule: primaryRule,
        includeConversionData: true,
        cpaGoalInput: primaryRule.cpaGoal?.toString() ?? "",
        cpaError: "",
      }));
    }
  };

  if (!account) {
    return <Detail markdown="# Error: Account data is missing." />;
  }

  if (reportResult) {
    return (
      <Detail
        markdown={reportResult.markdown}
        navigationTitle={`${reportResult.breakdown.charAt(0).toUpperCase() + reportResult.breakdown.slice(1)} Report`}
        actions={
          <ActionPanel>
            <ActionPanel.Section>
              <Action.OpenInBrowser title="Open in Realize Gui" url={reportResult.guiLink} />
              <Action.CopyToClipboard title="Copy Report Markdown" content={reportResult.markdown} />
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
              title={primaryRule ? "Change Conversion Rule" : "Select Conversion Rule"}
              icon={Icon.BullsEye}
              target={
                <ConversionRuleList
                  listTitle={`Rules for ${account.name}`}
                  accountIdToFetch={account.account_id}
                  onRuleSelected={handleConversionRuleSelected}
                  currentPrimaryRuleId={primaryRule?.id}
                  onCancel={() => {
                    setForm(f => ({ ...f, includeConversionData: false }));
                  }}
                />
              }
              shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            />
          )}
          {primaryRule && (
            <Action
              title="Clear Selected Rule"
              icon={Icon.XMarkCircle}
              onAction={handleClearPrimaryRule}
              style={Action.Style.Destructive}
              shortcut={{ modifiers: ["cmd", "opt"], key: "backspace" }}
            />
          )}
          {/* Sub-account drilldown actions */}
          {form.subAccounts && form.subAccounts.length > 0 && (
            <ActionPanel.Section title="Drill Down to Sub-Account">
              {form.subAccounts.map((acc) => (
                <Action.Push
                  key={acc.account_id}
                  title={`Drill Down: ${acc.name}`}
                  icon={Icon.ArrowRight}
                  target={<ReportConfigurationView account={acc} />}
                />
              ))}
            </ActionPanel.Section>
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
      {/* Primary Conversion Dropdown */}
      <Form.Dropdown
        id="primaryConversion"
        title="Primary Conversion"
        value={primaryRule ? primaryRule.id : "no-rules"}
        onChange={handlePrimaryConversionChange}
        isLoading={loadingPrimaryRule}
        storeValue={false}
      >
        {!primaryRule && (
          <Form.Dropdown.Item value="no-rules" title="No rules available yet" />
        )}
        {primaryRule && (
          <Form.Dropdown.Item value={primaryRule.id} title={primaryRule.display_name} />
        )}
      </Form.Dropdown>
    </Form>
  );
}
