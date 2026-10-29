/** Simulation parameters (port of UIComponents.render_general_parameters + correlation sidebar). */
import { useState } from 'react';
import { SCENARIO_KEYS, type ScenarioKey } from '../config';
import type { SimulationParams } from '../engine/types';
import { useI18n, type TranslationKey } from '../i18n';
import type { Action, AppState } from '../state/store';
import { CorrelationDialog } from './CorrelationDialog';
import { Alert, Card, NumberField, Select, Switch } from './ui';

export function ParametersPanel({ state, dispatch }: { state: AppState; dispatch: (a: Action) => void }) {
  const { t } = useI18n();
  const p = state.params;
  const [showCorr, setShowCorr] = useState(false);
  const set = (key: keyof SimulationParams) => (value: number | boolean) => dispatch({ type: 'param', key, value });

  return (
    <div className="stack">
      <Card title={t('general_parameters')}>
        <div className="form-grid">
          <NumberField label={t('initial_amount')} value={p.initialAmount} min={0} step={500} onChange={set('initialAmount')} />
          <NumberField label={t('annual_contribution')} value={p.annualContribution} min={0} step={500} onChange={set('annualContribution')} />
          <NumberField label={t('years_to_retirement')} value={p.yearsToRetirement} min={0} max={99} step={1} onChange={(v) => set('yearsToRetirement')(Math.round(v))} />
          <NumberField label={t('years_retired')} value={p.yearsRetired} min={0} max={99} step={1} onChange={(v) => set('yearsRetired')(Math.round(v))} />
          <NumberField label={t('inflation')} value={p.inflation} min={0} max={10} step={0.1} decimals={2} onChange={set('inflation')} />
        </div>
        <Switch
          label={t('adjust_contribution_inflation')}
          help={t('adjust_contribution_inflation_help')}
          checked={p.adjustContributionInflation}
          onChange={set('adjustContributionInflation')}
        />
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
