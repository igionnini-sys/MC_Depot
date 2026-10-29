/** Result charts (port of the Plotly charts in results_display.py). */
import { useMemo } from 'react';
import { boxStats, corrcoef, histogram, histogram2d, max, mean, min, type HistogramBin } from '../engine/stats';
import type { SimulationResults } from '../engine/types';
import { useI18n } from '../i18n';
import { baseOption, Chart, compactEur, useChartTheme, type ChartTheme, type EChartsOption } from './Chart';
import type { PhaseRisk } from './ResultsView';
import { Stat, StatGrid } from './ui';

type Num = ArrayLike<number>;

/** Histogram as an outlined step area, so overlaid distributions stay readable. */
function histogramLine(bins: HistogramBin[]): [number, number][] {
  const pts: [number, number][] = [[bins[0].x0, 0]];
  for (const b of bins) pts.push([b.x0, b.count], [b.x1, b.count]);
  pts.push([bins[bins.length - 1].x1, 0]);
  return pts;
}

function histSeries(th: ChartTheme, name: string, color: string, bins: HistogramBin[]) {
  return {
    type: 'line', name, data: histogramLine(bins), showSymbol: false, smooth: false,
    lineStyle: { width: 2, color }, itemStyle: { color }, areaStyle: { color, opacity: th.dark ? 0.22 : 0.18 },
  };
}

function eurAxis(th: ChartTheme, name?: string) {
  const b = baseOption(th).xAxis as object;
  return { ...b, type: 'value', name, nameLocation: 'middle', nameGap: 28, scale: true, axisLabel: { color: th.muted, fontSize: 11, formatter: compactEur } };
}

function countAxis(th: ChartTheme, name: string) {
  const b = baseOption(th).yAxis as object;
  return { ...b, type: 'value', name, nameTextStyle: { color: th.muted, fontSize: 11, align: 'left' } };
}

function OverlayHistogram({ title, a, b, labels }: { title: string; a: Num; b: Num; labels: [string, string] }) {
  const { t, eur } = useI18n();
  const th = useChartTheme();
  const option = useMemo<EChartsOption>(() => {
    const lo = Math.min(min(a), min(b)), hi = Math.max(max(a), max(b));
    const base = baseOption(th);
    return {
      ...base,
      grid: { left: 8, right: 16, top: 40, bottom: 32, containLabel: true },
      tooltip: { ...(base.tooltip as object), trigger: 'axis', axisPointer: { type: 'line' },
        formatter: (ps: { seriesName: string; value: [number, number]; color: string }[]) =>
          `${eur(ps[0]?.value[0] ?? 0)}<br/>` + ps.map((p) => `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value[1]}</b>`).join('<br/>') },
      xAxis: eurAxis(th, t('value_euro')),
      yAxis: countAxis(th, t('frequency')),
      series: [
        histSeries(th, labels[0], th.series[0], histogram(a, 30, lo, hi)),
        histSeries(th, labels[1], th.series[1], histogram(b, 30, lo, hi)),
      ],
    };
  }, [a, b, th, labels, t, eur]);
  return (
    <figure className="figure">
      <figcaption>{title}</figcaption>
      <Chart option={option} ariaLabel={title} />
    </figure>
  );
}

export function DistributionCharts({ results, finalReal }: { results: SimulationResults; finalReal: Num }) {
  const { t } = useI18n();
  const labels: [string, string] = [t('nominal'), t('real')];
  return (
    <div className="chart-grid">
      <OverlayHistogram title={t('distribution_accumulation')} a={results.accumulationNominal} b={results.accumulation} labels={labels} />
      <OverlayHistogram title={t('distribution_final')} a={results.final} b={finalReal} labels={labels} />
    </div>
  );
}

function scatterOption(th: ChartTheme, x: Num, y: Num, xName: string, yName: string, eur: (v: number) => string, extra: object[] = []): EChartsOption {
  const data: [number, number][] = new Array(x.length);
  for (let i = 0; i < x.length; i++) data[i] = [x[i], y[i]];
  const base = baseOption(th);
  return {
    ...base,
    grid: { left: 8, right: 16, top: 24, bottom: 32, containLabel: true },
    tooltip: { ...(base.tooltip as object), trigger: 'item', formatter: (p: { value: [number, number] }) => `${xName}: <b>${eur(p.value[0])}</b><br/>${yName}: <b>${eur(p.value[1])}</b>` },
    xAxis: eurAxis(th, xName),
    yAxis: { ...eurAxis(th), name: yName, nameLocation: 'end', nameGap: 12, nameTextStyle: { color: th.muted, fontSize: 11, align: 'left' } },
    series: [
      { type: 'scatter', data, symbolSize: 4, large: true, largeThreshold: 2000, itemStyle: { color: th.series[0], opacity: 0.45 } },
      ...extra,
    ],
  };
}

export function CorrelationCharts({ results }: { results: SimulationResults }) {
  const { t, eur, num } = useI18n();
  const th = useChartTheme();
  const x = results.accumulationNominal, y = results.final;
  const r = useMemo(() => corrcoef(x, y), [x, y]);
  const scatter = useMemo(() => scatterOption(th, x, y, t('accumulation_axis'), t('final_axis'), eur), [th, x, y, t, eur]);

  const heat = useMemo<EChartsOption>(() => {
    const bins = 30;
    const h = histogram2d(x, y, bins);
    const xs = Array.from({ length: bins }, (_, i) => h.x0 + (i + 0.5) * h.wx);
    const ys = Array.from({ length: bins }, (_, i) => h.y0 + (i + 0.5) * h.wy);
    const base = baseOption(th);
    const maxCount = Math.max(1, ...h.cells.map((c) => c[2]));
    return {
      ...base,
      grid: { left: 8, right: 16, top: 24, bottom: 56, containLabel: true },
      tooltip: { ...(base.tooltip as object), formatter: (p: { value: [number, number, number] }) => `${t('accumulation_axis')}: ${eur(xs[p.value[0]])}<br/>${t('final_axis')}: ${eur(ys[p.value[1]])}<br/>${t('scenarios_count')}: <b>${p.value[2]}</b>` },
      xAxis: { ...(base.xAxis as object), type: 'category', data: xs.map(compactEur), splitLine: { show: false } },
      yAxis: { ...(base.yAxis as object), type: 'category', data: ys.map(compactEur), splitLine: { show: false } },
      visualMap: { min: 1, max: maxCount, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 160, itemWidth: 10, inRange: { color: th.sequential }, textStyle: { color: th.muted } },
      series: [{ type: 'heatmap', data: h.cells, itemStyle: { borderColor: th.surface, borderWidth: 1 } }],
    };
  }, [th, x, y, t, eur]);

  return (
    <div className="chart-grid">
      <figure className="figure">
        <figcaption>{t('accumulation_final_correlation')} <span className="badge">{t('correlation_label')}: {num(r, 3)}</span></figcaption>
        <Chart option={scatter} ariaLabel={t('accumulation_final_correlation')} />
      </figure>
      <figure className="figure">
        <figcaption>{t('accumulation_final_heatmap')}</figcaption>
        <Chart option={heat} ariaLabel={t('accumulation_final_heatmap')} />
      </figure>
    </div>
  );
}

export function ComparisonCharts({ results, finalReal }: { results: SimulationResults; finalReal: Num }) {
  const { t, eur, num } = useI18n();
  const th = useChartTheme();
  const nominal = results.final;
  const r = useMemo(() => corrcoef(finalReal, nominal), [finalReal, nominal]);
  const avgNom = mean(nominal);
  const impact = avgNom > 0 ? (mean(finalReal) / avgNom) * 100 : 0;

  const scatter = useMemo(() => {
    const lo = Math.min(min(finalReal), min(nominal)), hi = Math.max(max(finalReal), max(nominal));
    return scatterOption(th, finalReal, nominal, t('real'), t('nominal'), eur, [{
      type: 'line', name: t('one_to_one_line'), data: [[lo, lo], [hi, hi]], showSymbol: false, silent: true,
      lineStyle: { color: th.muted, width: 2, type: 'dashed' },
    }]);
  }, [th, finalReal, nominal, t, eur]);

  const box = useMemo<EChartsOption>(() => {
    const a = boxStats(nominal), b = boxStats(finalReal);
    const base = baseOption(th);
    const cap = (o: number[]) => o.slice(0, 1500);
    return {
      ...base,
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: { ...(base.tooltip as object), trigger: 'item', formatter: (p: { seriesType: string; value: number[]; name: string }) =>
        p.seriesType === 'boxplot'
          ? `${p.name}<br/>max: ${eur(p.value[5])}<br/>Q3: ${eur(p.value[4])}<br/>median: <b>${eur(p.value[3])}</b><br/>Q1: ${eur(p.value[2])}<br/>min: ${eur(p.value[1])}`
          : eur(p.value[1]) },
      xAxis: { ...(base.xAxis as object), type: 'category', data: [t('nominal'), t('real')], splitLine: { show: false } },
      yAxis: { ...(base.yAxis as object), type: 'value', axisLabel: { color: th.muted, fontSize: 11, formatter: compactEur } },
      series: [
        { type: 'boxplot', data: [
          { value: a.box, itemStyle: { color: th.dark ? '#184f95' : '#cde2fb', borderColor: th.series[0], borderWidth: 2 } },
          { value: b.box, itemStyle: { color: th.dark ? '#7a3417' : '#fbd9c9', borderColor: th.series[1], borderWidth: 2 } },
        ] },
        { type: 'scatter', symbolSize: 4, large: true, data: [...cap(a.outliers).map((v) => [0, v]), ...cap(b.outliers).map((v) => [1, v])], itemStyle: { color: th.muted, opacity: 0.5 } },
      ],
    };
  }, [th, nominal, finalReal, t, eur]);

  return (
    <div className="chart-grid">
      <figure className="figure">
        <figcaption>{t('final_values_comparison')} <span className="badge">{t('correlation_label')}: {num(r, 3)}</span></figcaption>
        <Chart option={scatter} ariaLabel={t('final_values_comparison')} />
      </figure>
      <figure className="figure">
        <StatGrid>
          <Stat label={t('inflation_impact_label')} help={t('inflation_impact_text', num(impact, 1))} value={`${num(impact, 1)}%`} />
        </StatGrid>
        <figcaption>{t('final_values_box')}</figcaption>
        <Chart option={box} height={280} ariaLabel={t('final_values_box')} />
      </figure>
    </div>
  );
}

export function VarDistributionChart({ values, risk }: { values: Num; risk: PhaseRisk }) {
  const { t, eur } = useI18n();
  const th = useChartTheme();
  const option = useMemo<EChartsOption>(() => {
    const base = baseOption(th);
    // Each marker is its own (empty) series so the legend names it; VaR and CVaR are
    // usually too close for on-line labels.
    const marker = (name: string, x: number, color: string, type: string) => ({
      type: 'line', name: `${name}: ${eur(x)}`, data: [], itemStyle: { color }, lineStyle: { color, type, width: 2 },
      markLine: { symbol: 'none', silent: true, label: { show: false }, lineStyle: { color, width: 2, type }, data: [{ xAxis: x }] },
    });
    const hist = histSeries(th, t('frequency'), th.series[0], histogram(values, 50));
    const markers = [
      marker('VaR 5%', risk.var5, th.critical, 'dashed'),
      marker('CVaR 5%', risk.cvar5, th.critical, 'solid'),
      marker(t('mean'), risk.mean, th.good, 'dotted'),
    ];
    return {
      ...base,
      grid: { left: 8, right: 24, top: 48, bottom: 32, containLabel: true },
      legend: { ...(base.legend as object), data: markers.map((m) => ({ name: m.name, icon: 'path://M0,4h24v2h-24z' })), itemWidth: 24 },
      tooltip: { ...(base.tooltip as object), trigger: 'axis', formatter: (ps: { value: [number, number] }[]) => `${eur(ps[0]?.value[0] ?? 0)}<br/>${t('frequency')}: <b>${ps[0]?.value[1]}</b>` },
      xAxis: eurAxis(th, t('portfolio_value')),
      yAxis: countAxis(th, t('frequency')),
      series: [hist, ...markers],
    };
  }, [values, risk, th, t, eur]);
  return (
    <figure className="figure">
      <figcaption>{t('dist_var_title')}</figcaption>
      <Chart option={option} height={380} ariaLabel={t('dist_var_title')} />
    </figure>
  );
}

export function PhaseComparisonChart({ phases }: { phases: (PhaseRisk & { name: string })[] }) {
  const { t, eur } = useI18n();
  const th = useChartTheme();
  const option = useMemo<EChartsOption>(() => {
    const base = baseOption(th);
    const bar = (name: string, color: string, data: number[]) => ({
      type: 'bar', name, data, barMaxWidth: 36, itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    });
    return {
      ...base,
      grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
      tooltip: { ...(base.tooltip as object), trigger: 'axis', valueFormatter: (v: number) => eur(v) },
      xAxis: { ...(base.xAxis as object), type: 'category', data: phases.map((p) => p.name), splitLine: { show: false } },
      yAxis: { ...(base.yAxis as object), type: 'value', axisLabel: { color: th.muted, fontSize: 11, formatter: compactEur } },
      series: [
        bar('VaR 5%', th.series[0], phases.map((p) => p.var5)),
        bar('CVaR 5%', th.series[1], phases.map((p) => p.cvar5)),
        { type: 'line', name: t('mean'), data: phases.map((p) => p.mean), symbolSize: 8, lineStyle: { width: 2, color: th.series[2] }, itemStyle: { color: th.series[2], borderColor: th.surface, borderWidth: 2 } },
      ],
    };
  }, [phases, th, t, eur]);
  return (
    <figure className="figure">
      <figcaption>{t('var_cvar_comparison_phases')}</figcaption>
      <Chart option={option} height={360} ariaLabel={t('var_cvar_comparison_phases')} />
    </figure>
  );
}

export function LossProbabilityChart({ rows }: { rows: { label: string; prob: number }[] }) {
  const { t, num } = useI18n();
  const th = useChartTheme();
  const option = useMemo<EChartsOption>(() => {
    const base = baseOption(th);
    return {
      ...base,
      grid: { left: 8, right: 16, top: 28, bottom: 28, containLabel: true },
      legend: { show: false },
      tooltip: { ...(base.tooltip as object), trigger: 'axis', valueFormatter: (v: number) => `${num(v, 1)}%` },
      xAxis: { ...(base.xAxis as object), type: 'category', name: t('loss_threshold'), nameLocation: 'middle', nameGap: 24, data: rows.map((r) => r.label), splitLine: { show: false } },
      yAxis: { ...(base.yAxis as object), type: 'value', axisLabel: { color: th.muted, fontSize: 11, formatter: '{value}%' } },
      series: [{
        type: 'bar', name: t('probability'), data: rows.map((r) => r.prob), barMaxWidth: 48,
        itemStyle: { color: th.series[0], borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: 'top', color: th.text, formatter: (p: { value: number }) => `${num(p.value, 1)}%` },
      }],
    };
  }, [rows, th, t, num]);
  return (
    <figure className="figure">
      <figcaption>{t('loss_probability_by_threshold')}</figcaption>
      <Chart option={option} height={300} ariaLabel={t('loss_probability_by_threshold')} />
    </figure>
  );
}
