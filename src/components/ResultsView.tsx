/** Simulation results (port of results_display.py). */
import { useMemo } from 'react';
import {
  cagr, conditionalVaR, mean, percentileStats, probabilityBelow, valueAtRisk, type PercentileStats,
} from '../engine/stats';
import type { SimulationParams, SimulationResults } from '../engine/types';
import { useI18n } from '../i18n';
import { ComparisonCharts, CorrelationCharts, DistributionCharts, LossProbabilityChart, PhaseComparisonChart, VarDistributionChart } from './ResultsCharts';
import { Alert, Card, Collapsible, DataTable, Stat, StatGrid, Tabs, type Tone } from './ui';

export interface ResultsBundle {
  results: SimulationResults;
  params: SimulationParams;
  totalDeposited: number;
}

export interface PhaseRisk { key: 'acc_nominal' | 'acc_real' | 'final'; var5: number; cvar5: number; mean: number }

export function ResultsView({ bundle }: { bundle: ResultsBundle }) {
  const { results: r, params: p } = bundle;
  const { t } = useI18n();

  const derived = useMemo(() => {
    const inflation = p.inflation / 100;
    const factor = (1 + inflation) ** (p.yearsToRetirement + p.yearsRetired);
    const finalReal = r.final.map((v) => v / factor);
    let successes = 0;
    for (const v of r.final) if (v > 0) successes++;
    const phases: PhaseRisk[] = [
      { key: 'acc_nominal', var5: valueAtRisk(r.accumulationNominal), cvar5: conditionalVaR(r.accumulationNominal), mean: mean(r.accumulationNominal) },
      { key: 'acc_real', var5: valueAtRisk(r.accumulation), cvar5: conditionalVaR(r.accumulation), mean: mean(r.accumulation) },
      { key: 'final', var5: valueAtRisk(r.final), cvar5: conditionalVaR(r.final), mean: mean(r.final) },
    ];
    return {
      finalReal,
      successRate: (successes / r.final.length) * 100,
      stats: {
        accumulation: percentileStats(r.accumulation),
        accumulationNominal: percentileStats(r.accumulationNominal),
        final: percentileStats(r.final),
        finalReal: percentileStats(finalReal),
      },
      avgNetWithdrawal: mean(r.realWithdrawal),
      phases,
    };
  }, [r, p]);

  const { stats, successRate } = derived;

  return (
    <div className="stack results">
      <h2 className="section-title">{t('simulation_results')}</h2>
      <KeyMetrics bundle={bundle} successRate={successRate} medianAcc={stats.accumulationNominal.median} medianFinal={stats.final.median} />
      <WithdrawalAnalysis params={p} avgNet={derived.avgNetWithdrawal} />
      <TaxAnalysis bundle={bundle} />
      <DetailedStatistics bundle={bundle} stats={stats} successRate={successRate} />

      <Card title={t('distribution_charts_title')}>
        <Tabs
          tabs={[
            { id: 'dist', label: t('distributions_tab'), content: () => <DistributionCharts results={r} finalReal={derived.finalReal} /> },
            { id: 'corr', label: t('correlations_tab'), content: () => <CorrelationCharts results={r} /> },
            { id: 'cmp', label: t('comparison_tab'), content: () => <ComparisonCharts results={r} finalReal={derived.finalReal} /> },
          ]}
        />
      </Card>

      <RiskAnalysis bundle={bundle} phases={derived.phases} />
      <SuccessMessage rate={successRate} />
    </div>
  );
}

function KeyMetrics({ bundle, successRate, medianAcc, medianFinal }: { bundle: ResultsBundle; successRate: number; medianAcc: number; medianFinal: number }) {
  const { t, eur, num } = useI18n();
  const p = bundle.params;
  const i = p.inflation / 100;
  const tone: Tone = successRate >= 85 ? 'success' : successRate >= 65 ? 'warning' : 'danger';
  return (
    <Card>
      <StatGrid>
        <Stat label={t('total_deposited')} value={eur(bundle.totalDeposited)} />
        <Stat label={t('median_accumulation')} value={eur(medianAcc)} />
        <Stat label={t('median_final')} value={eur(medianFinal)} />
        <Stat label={t('success_rate')} value={`${num(successRate, 1)}%`} tone={tone} />
      </StatGrid>
      {p.useRealWithdrawal ? (
        <>
          <Alert tone="info" title={`${t('real_withdrawal_amount_result')}: ${eur(p.withdrawal)}`}>{t('todays_purchasing_power')}</Alert>
          <StatGrid>
            <Stat label={t('first_withdrawal')} help={t('first_withdrawal_help')} value={eur(p.withdrawal * (1 + i) ** p.yearsToRetirement)} />
            <Stat label={t('final_withdrawal')} help={t('final_withdrawal_help')} value={eur(p.withdrawal * (1 + i) ** (p.yearsToRetirement + p.yearsRetired - 1))} />
          </StatGrid>
        </>
      ) : (
        <Alert tone="warning" title={`${t('nominal_withdrawal_label')}: ${eur(p.withdrawal)}`}>{t('nominal_withdrawal_note')}</Alert>
      )}
    </Card>
  );
}

function WithdrawalAnalysis({ params: p, avgNet }: { params: SimulationParams; avgNet: number }) {
  const { t, eur, num } = useI18n();
  const i = p.inflation / 100;
  const years = Array.from(new Set([0, 5, 10, 15, 20, Math.min(25, Math.trunc(p.yearsRetired))])).filter((y) => y < p.yearsRetired);
  return (
    <Card title={t('withdrawal_analysis')}>
      <StatGrid>
        <Stat label={t('avg_effective_withdrawal')} help={t('avg_effective_withdrawal_help')} value={eur(avgNet)} />
        {p.useRealWithdrawal && (
          <Stat
            label={t('withdrawal_effectiveness')}
            help={t('withdrawal_effectiveness_help')}
            value={`${num(p.withdrawal > 0 ? (avgNet / p.withdrawal) * 100 : 0, 1)}%`}
          />
        )}
      </StatGrid>
      {p.useRealWithdrawal ? (
        years.length > 0 && (
          <>
            <h3>{t('withdrawal_progression')}</h3>
            <DataTable
              columns={[t('retirement_year'), t('nominal_withdrawal_col'), t('purchasing_power_col')]}
              numeric={[true, true, true]}
              rows={years.map((y) => [y + 1, eur(p.withdrawal * (1 + i) ** (p.yearsToRetirement + y)), eur(p.withdrawal)])}
            />
          </>
        )
      ) : (
        <Alert tone="info">{t('nominal_withdrawal_info', eur(p.withdrawal), num(p.inflation, 1))}</Alert>
      )}
    </Card>
  );
}

function TaxAnalysis({ bundle }: { bundle: ResultsBundle }) {
  const { t, eur, num } = useI18n();
  const rate = bundle.params.capitalGainsTaxRate;
  const ta = bundle.results.taxAnalysis;
  return (
    <Card title={t('tax_analysis')}>
      <StatGrid>
        <Stat label={t('cg_tax_rate')} value={`${num(rate, 1)}%`} />
        <Stat label={t('avg_effective_tax_rate')} help={t('avg_effective_tax_rate_help')} value={`${num(ta.effectiveTaxRate.mean, 2)}%`} />
        <Stat label={t('avg_total_taxes')} value={eur(ta.totalTaxes.mean)} />
      </StatGrid>
      <Collapsible title={t('how_taxation_works')}>
        <ol className="plain-list">
          <li>{t('tax_mech_1', num(rate, 1))}</li>
          <li>{t('tax_mech_2')}</li>
          <li>{t('tax_mech_3')}</li>
          <li>{t('tax_mech_4')}</li>
        </ol>
        <p>{t('tax_example', num(rate, 1), eur(10000 * (1 - (rate / 100) * 0.5)))}</p>
      </Collapsible>
    </Card>
  );
}

function PhaseTable({ s, years, deposited }: { s: PercentileStats; years: number; deposited: number }) {
  const { t, eur, num } = useI18n();
  const rows: [string, number][] = [
    ['10%', s.p10], ['25%', s.p25], ['50%', s.median], [t('average'), s.mean], ['75%', s.p75], ['90%', s.p90],
  ];
  return (
    <DataTable
      columns={[t('percentile'), t('value_euro'), t('cagr_percent')]}
      numeric={[false, true, true]}
      rows={rows.map(([label, v]) => [label, eur(v), `${num(years > 0 ? cagr(v, deposited, years) : 0, 2)}%`])}
    />
  );
}

function DetailedStatistics({ bundle, stats, successRate }: {
  bundle: ResultsBundle;
  stats: { accumulation: PercentileStats; accumulationNominal: PercentileStats; final: PercentileStats; finalReal: PercentileStats };
  successRate: number;
}) {
  const { t, num } = useI18n();
  const p = bundle.params;
  const dep = bundle.totalDeposited;
  const totalYears = p.yearsToRetirement + p.yearsRetired;
  const inflImpact = stats.accumulationNominal.median > 0 ? (stats.accumulation.median / stats.accumulationNominal.median) * 100 : 0;
  const accCagr = cagr(stats.accumulation.median, dep, p.yearsToRetirement);
  const totCagr = cagr(stats.final.median, dep, totalYears);
  const s = num(successRate, 1);

  return (
    <Card title={t('detailed_statistics')}>
      <Tabs
        tabs={[
          {
            id: 'acc', label: t('accumulation_phase_real'), content: () => (
              <>
                <h3>{t('acc_nominal_title')}</h3>
                <p className="muted small">{t('acc_nominal_note')}</p>
                <PhaseTable s={stats.accumulationNominal} years={p.yearsToRetirement} deposited={dep} />
                <h3>{t('acc_real_title')}</h3>
                <p className="muted small">{t('acc_real_note')}</p>
                <PhaseTable s={stats.accumulation} years={p.yearsToRetirement} deposited={dep} />
                <Alert tone="info">{t('nominal_vs_real_explained')}</Alert>
                <StatGrid>
                  <Stat label={t('inflation_impact_accumulation')} help={t('inflation_impact_accumulation_help')} value={`${num(100 - inflImpact, 1)}%`} />
                </StatGrid>
              </>
            ),
          },
          {
            id: 'final', label: t('final_values'), content: () => (
              <>
                <PhaseTable s={stats.final} years={totalYears} deposited={dep} />
                {successRate < 50 ? <Alert tone="danger">{t('low_success', s)}</Alert>
                  : successRate < 80 ? <Alert tone="warning">{t('moderate_success', s)}</Alert>
                    : <Alert tone="success">{t('good_success', s)}</Alert>}
                <h3>{t('final_real_title')}</h3>
                <PhaseTable s={stats.finalReal} years={totalYears} deposited={dep} />
              </>
            ),
          },
          {
            id: 'perf', label: t('cagr_performance'), content: () => (
              <>
                <StatGrid>
                  <Stat label={t('acc_cagr')} help={t('acc_cagr_help')} value={`${num(accCagr, 2)}%`} />
                  <Stat label={t('total_cagr')} help={t('total_cagr_help')} value={`${num(totCagr, 2)}%`} />
                  <Stat label={t('multiplier')} help={t('multiplier_help')} value={`${num(dep > 0 ? stats.final.median / dep : 0, 1)}x`} />
                </StatGrid>
                {accCagr > 7 ? <Alert tone="success">{t('growth_excellent')}</Alert>
                  : accCagr > 5 ? <Alert tone="info">{t('growth_good')}</Alert>
                    : accCagr > 3 ? <Alert tone="warning">{t('growth_moderate')}</Alert>
                      : <Alert tone="danger">{t('growth_low')}</Alert>}
              </>
            ),
          },
        ]}
      />
    </Card>
  );
}

function RiskAnalysis({ bundle, phases }: { bundle: ResultsBundle; phases: PhaseRisk[] }) {
  const { t, eur, num } = useI18n();
  const acc = phases[0];
  const dep = bundle.totalDeposited;
  const values = bundle.results.accumulationNominal;

  const level =
    acc.var5 <= 0 ? { tone: 'danger' as Tone, title: t('high_risk'), msg: t('significant_probability_lose_all') }
      : acc.var5 < acc.mean * 0.3 ? { tone: 'warning' as Tone, title: t('moderate_high_risk'), msg: t('worst_scenarios_very_negative') }
        : acc.var5 < acc.mean * 0.7 ? { tone: 'info' as Tone, title: t('moderate_risk'), msg: t('manageable_risk_monitor') }
          : { tone: 'success' as Tone, title: t('low_risk'), msg: t('worst_scenarios_contained') };

  const thresholds = [0.1, 0.2, 0.3, 0.5];
  const lossRows = thresholds.map((th) => ({ th, value: dep * (1 - th), prob: probabilityBelow(values, dep * (1 - th)) }));
  const lossValues = Array.from(values).filter((v) => v < dep);
  const phaseName = (k: PhaseRisk['key']) => t(k === 'acc_nominal' ? 'phase_acc_nominal' : k === 'acc_real' ? 'phase_acc_real' : 'phase_final');

  return (
    <Card title={t('risk_analysis_title')}>
      <Collapsible title={t('var_explanation_title')}>
        <ul className="plain-list">
          <li>{t('var_expl_1')}</li>
          <li>{t('var_expl_2')}</li>
          <li>{t('var_expl_3')}</li>
        </ul>
      </Collapsible>

      <h3>{t('key_risk_metrics_title')}</h3>
      <StatGrid>
        <Stat label="VaR 5%" help={t('var_help')} value={eur(acc.var5)} />
        <Stat label="CVaR 5%" help={t('cvar_help')} value={eur(acc.cvar5)} />
        <Stat label={t('mean')} help={t('mean_help')} value={eur(acc.mean)} />
        <Stat label={t('risk_gap')} help={t('risk_gap_help')} value={eur(acc.cvar5 < acc.mean ? acc.mean - acc.cvar5 : 0)} />
      </StatGrid>
      <Alert tone={level.tone} title={`${level.title}:`}>{level.msg}</Alert>

      <h3>{t('var_cvar_table_by_phase')}</h3>
      <DataTable
        columns={[t('phase'), t('mean'), 'VaR 5%', 'CVaR 5%', t('risk_percent')]}
        numeric={[false, true, true, true, true]}
        rows={phases.map((ph) => [
          phaseName(ph.key), eur(ph.mean), eur(ph.var5), eur(ph.cvar5),
          ph.mean > 0 ? `${num((1 - ph.var5 / ph.mean) * 100, 1)}%` : 'N/A',
        ])}
      />

      <h3>{t('risk_visualizations_title')}</h3>
      <Tabs
        tabs={[
          { id: 'dist', label: t('distribution_with_var_cvar'), content: () => <><VarDistributionChart values={values} risk={acc} /><p className="muted small">{t('how_to_read')}</p></> },
          { id: 'cmp', label: t('phase_comparison'), content: () => <PhaseComparisonChart phases={phases.map((ph) => ({ ...ph, name: phaseName(ph.key) }))} /> },
        ]}
      />

      <h3>{t('loss_probability_analysis')}</h3>
      <StatGrid>
        <Stat label={t('total_loss_probability')} help={t('prob_less_deposited')} value={`${num(probabilityBelow(values, dep), 1)}%`} />
        <Stat label={t('average_value_when_loss')} help={t('average_value_when_loss_help')} value={eur(lossValues.length ? mean(lossValues) : dep)} />
      </StatGrid>
      <DataTable
        columns={[t('loss_threshold'), t('threshold_value'), t('probability')]}
        numeric={[false, true, true]}
        rows={lossRows.map((x) => [`${x.th * 100}%`, eur(x.value), `${num(x.prob, 1)}%`])}
      />
      <LossProbabilityChart rows={lossRows.map((x) => ({ label: `${x.th * 100}%`, prob: x.prob }))} />
    </Card>
  );
}

function SuccessMessage({ rate }: { rate: number }) {
  const { t, num } = useI18n();
  const s = num(rate, 1);
  if (rate >= 85) return <Alert tone="success">{t('excellent_success', s)}</Alert>;
  if (rate >= 65) return <Alert tone="warning">{t('fair_success', s)}</Alert>;
  return <Alert tone="danger">{t('warning_success', s)}</Alert>;
}
