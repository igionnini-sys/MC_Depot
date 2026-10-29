/** Correlation settings dialog (port of correlation_ui.py: scenario, matrix heatmap, statistics, explanation). */
import { useMemo } from 'react';
import { CORRELATION_ASSETS, SCENARIO_KEYS, scenarioMatrix, type ScenarioKey } from '../config';
import { mean } from '../engine/stats';
import { useI18n, type TranslationKey } from '../i18n';
import type { Action, AppState } from '../state/store';
import { baseOption, Chart, useChartTheme } from './Chart';
import { Modal, Select, Stat, StatGrid } from './ui';

export function CorrelationDialog({ open, onClose, state, dispatch }: { open: boolean; onClose: () => void; state: AppState; dispatch: (a: Action) => void }) {
  const { t, assetName, num } = useI18n();
  const th = useChartTheme();
  const scenario = state.correlation.scenario;
  const matrix = scenarioMatrix(scenario);
  const names = CORRELATION_ASSETS.map(assetName);

  const offDiagonal = useMemo(() => {
    const v: number[] = [];
    for (let i = 0; i < matrix.length; i++) for (let j = i + 1; j < matrix.length; j++) v.push(matrix[i][j]);
    return v;
  }, [matrix]);

  const option = useMemo(() => {
    const data: [number, number, number][] = [];
    matrix.forEach((row, i) => row.forEach((v, j) => data.push([j, i, v])));
    const base = baseOption(th);
    return {
      ...base,
      grid: { left: 8, right: 8, top: 8, bottom: 56, containLabel: true },
      tooltip: { ...(base.tooltip as object), formatter: (p: { value: [number, number, number] }) => `${names[p.value[1]]} × ${names[p.value[0]]}: <b>${p.value[2].toFixed(2)}</b>` },
      xAxis: { ...(base.xAxis as object), type: 'category', data: names, axisLabel: { color: th.muted, rotate: 40, fontSize: 10 }, splitLine: { show: false } },
      yAxis: { ...(base.yAxis as object), type: 'category', data: names, inverse: true, axisLabel: { color: th.muted, fontSize: 10 }, splitLine: { show: false } },
      visualMap: {
        min: -1, max: 1, orient: 'horizontal', left: 'center', bottom: 0, itemHeight: 160, itemWidth: 10,
        calculable: false, inRange: { color: th.diverging }, textStyle: { color: th.muted },
      },
      series: [{
        type: 'heatmap', data,
        label: { show: true, color: th.text, fontSize: 10, formatter: (p: { value: number[] }) => p.value[2].toFixed(2) },
        itemStyle: { borderColor: th.surface, borderWidth: 2 },
      }],
    };
  }, [matrix, th, names]);

  return (
    <Modal title={t('correlation_settings_title')} open={open} onClose={onClose} closeLabel={t('close')}>
      <Select<ScenarioKey>
        label={t('scenario')}
        value={scenario}
        options={SCENARIO_KEYS.map((k) => ({ value: k, label: t(`scenario_${k}` as TranslationKey) }))}
        onChange={(s) => dispatch({ type: 'correlation', scenario: s })}
      />
      <p className="muted small">{t(`scenario_desc_${scenario}` as TranslationKey)}</p>
      <h3>{t('correlation_matrix_title')}</h3>
      <Chart option={option} height={420} ariaLabel={t('correlation_matrix_title')} />
      <h3>{t('correlation_statistics')}</h3>
      <StatGrid>
        <Stat label={t('average')} value={num(mean(offDiagonal), 3)} />
        <Stat label={t('minimum')} value={num(Math.min(...offDiagonal), 3)} />
        <Stat label={t('maximum')} value={num(Math.max(...offDiagonal), 3)} />
      </StatGrid>
      <h3>{t('correlation_impact_title')}</h3>
      <ul className="plain-list">
        <li><strong>{t('corr_positive_title')}</strong> — {t('corr_positive_text')}</li>
        <li><strong>{t('corr_negative_title')}</strong> — {t('corr_negative_text')}</li>
        <li><strong>{t('corr_zero_title')}</strong> — {t('corr_zero_text')}</li>
      </ul>
    </Modal>
  );
}
