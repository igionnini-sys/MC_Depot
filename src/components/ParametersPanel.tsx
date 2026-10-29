/** Simulation parameters (port of UIComponents.render_general_parameters + correlation sidebar). */
import { useState } from 'react';
import { SCENARIO_KEYS, type ScenarioKey } from '../config';
import type { SimulationParams } from '../engine/types';
import { useI18n, type TranslationKey } from '../i18n';
import type { Action, AppState } from '../state/store';
import { TAX_REGIMES } from '../tax/registry';
import type { ContributionSplitMode, CountryCode, FilingStatus, KirchensteuerRate } from '../tax/types';
import { CorrelationDialog } from './CorrelationDialog';
import { Alert, Card, Collapsible, NumberField, Select, Switch } from './ui';

export function ParametersPanel({ state, dispatch }: { state: AppState; dispatch: (a: Action) => void }) {
  const { t } = useI18n();
  const p = state.params;
  const [showCorr, setShowCorr] = useState(false);
  const set = (key: keyof SimulationParams) => (value: number | boolean | string) => dispatch({ type: 'param', key, value });

  return (
    <div className="stack">
      <Card title={t('general_parameters')}>
        <div className="form-grid">
          <NumberField label={t('initial_amount')} value={p.initialAmount} min={0} step={500} onChange={set('initialAmount')} />
          <NumberField label={t('annual_contribution')} value={p.annualContribution} min={0} step={500} onChange={set('annualContribution')} />
          <NumberField label={t('years_to_retirement')} value={p.yearsToRetirement} min={0} max={99} step={1} onChange={(v) => set('yearsToRetirement')(Math.round(v))} />
          <NumberField label={t('years_retired')} value={p.yearsRetired} min={0} max={99} step={1} onChange={(v) => set('yearsRetired')(Math.round(v))} />
          <NumberField label={t('current_age')} help={t('current_age_help')} value={p.currentAge ?? 30} min={18} max={90} step={1} onChange={(v) => set('currentAge')(Math.round(v))} />
          <NumberField label={t('start_year')} help={t('start_year_help')} value={p.startYear ?? 2027} min={2020} max={2100} step={1} onChange={(v) => set('startYear')(Math.round(v))} />
          <NumberField label={t('inflation')} value={p.inflation} min={0} max={10} step={0.1} decimals={2} onChange={set('inflation')} />
        </div>
        <Switch
          label={t('adjust_contribution_inflation')}
          help={t('adjust_contribution_inflation_help')}
          checked={p.adjustContributionInflation}
          onChange={set('adjustContributionInflation')}
        />
      </Card>

      <Card title={t('tax_section_title')}>
        <Select<CountryCode>
          label={t('tax_country')}
          help={t('tax_country_help')}
          value={p.taxCountry ?? 'simplified'}
          options={TAX_REGIMES.map((r) => ({
            value: r.code,
            label: t(`tax_country_${r.code}` as TranslationKey),
            disabled: !r.implemented,
          }))}
          onChange={set('taxCountry')}
        />
        {(p.taxCountry === 'de' || p.taxCountry === 'nl') && (
          <Alert tone="warning" title={t('tax_unverified_warning_title')}>
            {p.taxCountry === 'de' ? t('tax_unverified_warning_de') : t('tax_unverified_warning_nl')}
          </Alert>
        )}
        <Switch
          label={t('index_tax_limits')}
          help={t('index_tax_limits_help')}
          checked={!!p.indexTaxLimitsToInflation}
          onChange={set('indexTaxLimitsToInflation')}
        />
        {p.indexTaxLimitsToInflation && (
          <NumberField
            label={t('tax_limits_inflation_rate')}
            help={t('tax_limits_inflation_rate_help')}
            value={p.taxLimitsInflationRate ?? p.inflation}
            min={0}
            max={15}
            step={0.1}
            decimals={2}
            onChange={set('taxLimitsInflationRate')}
          />
        )}
        <Collapsible key={p.taxCountry ?? 'simplified'} title={t('personal_and_contribution_settings')} defaultOpen={p.taxCountry === 'de'}>
          <div className="form-grid">
            <Select<FilingStatus>
              label={t('filing_status')}
              value={p.filingStatus ?? 'single'}
              options={[
                { value: 'single', label: t('filing_status_single') },
                { value: 'couple', label: t('filing_status_couple') },
              ]}
              onChange={set('filingStatus')}
            />
            <Select<KirchensteuerRate>
              label={t('kirchensteuer')}
              value={p.kirchensteuer ?? 'none'}
              options={[
                { value: 'none', label: t('kirchensteuer_none') },
                { value: '8', label: t('kirchensteuer_8') },
                { value: '9', label: t('kirchensteuer_9') },
              ]}
              onChange={set('kirchensteuer')}
            />
            <NumberField
              label={t('children_count')}
              help={t('children_count_help')}
              value={p.childrenCount ?? 0}
              min={0}
              max={15}
              step={1}
              onChange={(v) => set('childrenCount')(Math.round(v))}
            />
            <NumberField
              label={t('acc_marginal_tax_rate')}
              help={t('acc_marginal_tax_rate_help')}
              value={p.accumulationMarginalTaxRate ?? 35}
              min={0}
              max={60}
              step={0.5}
              decimals={1}
              onChange={set('accumulationMarginalTaxRate')}
            />
            <NumberField
              label={t('other_retirement_income')}
              help={t('other_retirement_income_help')}
              value={p.otherRetirementIncome ?? 0}
              min={0}
              step={500}
              onChange={set('otherRetirementIncome')}
            />
            <Select<ContributionSplitMode>
              label={t('contribution_split_mode')}
              help={t('contribution_split_mode_help')}
              value={p.contributionSplitMode ?? 'auto'}
              options={[
                { value: 'auto', label: t('contribution_split_auto') },
                { value: 'manual', label: t('contribution_split_manual') },
              ]}
              onChange={set('contributionSplitMode')}
            />
            {p.contributionSplitMode === 'manual' && (
              <NumberField
                label={t('manual_avd_contribution')}
                help={t('manual_avd_contribution_help')}
                value={p.manualAvdContribution ?? 1800}
                min={0}
                max={p.annualContribution}
                step={100}
                onChange={set('manualAvdContribution')}
              />
            )}
          </div>
        </Collapsible>
      </Card>

      <Card title={t('withdrawal_section_title')}>
        <Switch label={t('use_real_withdrawal')} help={t('use_real_withdrawal_help')} checked={p.useRealWithdrawal} onChange={set('useRealWithdrawal')} />
        <NumberField
          label={p.useRealWithdrawal ? t('real_withdrawal_amount') : t('nominal_withdrawal_amount')}
          help={p.useRealWithdrawal ? t('real_withdrawal_help') : t('nominal_withdrawal_help')}
          value={p.withdrawal}
          min={0}
          step={500}
          onChange={set('withdrawal')}
        />
        <Alert tone={p.useRealWithdrawal ? 'info' : 'warning'}>
          {p.useRealWithdrawal ? t('real_withdrawal_explanation') : t('nominal_withdrawal_explanation')}
        </Alert>
        <div className="form-grid">
          {(p.taxCountry ?? 'simplified') === 'simplified' && (
            <NumberField
              label={t('capital_gains_tax_rate')}
              help={t('capital_gains_tax_help')}
              value={p.capitalGainsTaxRate}
              min={0}
              max={100}
              step={0.1}
              decimals={1}
              onChange={set('capitalGainsTaxRate')}
            />
          )}
          <Select
            label={t('n_simulations')}
            value={p.nSimulations}
            options={[1000, 5000, 10000].map((n) => ({ value: n, label: n.toLocaleString() }))}
            onChange={(v) => set('nSimulations')(v)}
          />
        </div>
      </Card>

      <Card title={t('asset_correlation')}>
        <Switch
          label={t('enable_correlation')}
          help={t('enable_correlation_help')}
          checked={state.correlation.enabled}
          onChange={(enabled) => dispatch({ type: 'correlation', enabled })}
        />
        {state.correlation.enabled ? (
          <>
            <Select<ScenarioKey>
              label={t('scenario')}
              value={state.correlation.scenario}
              options={SCENARIO_KEYS.map((k) => ({ value: k, label: t(`scenario_${k}` as TranslationKey) }))}
              onChange={(scenario) => dispatch({ type: 'correlation', scenario })}
            />
            <p className="muted small">{t(`scenario_desc_${state.correlation.scenario}` as TranslationKey)}</p>
            <button type="button" className="btn secondary" onClick={() => setShowCorr(true)}>
              {t('advanced_settings')}
            </button>
          </>
        ) : (
          <p className="muted small">{t('correlation_off')}</p>
        )}
      </Card>

      <CorrelationDialog open={showCorr} onClose={() => setShowCorr(false)} state={state} dispatch={dispatch} />
    </div>
  );
}
