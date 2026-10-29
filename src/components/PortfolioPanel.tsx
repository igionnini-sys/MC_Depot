/** Portfolio configuration (port of profile selector, asset editor, allocation controls, pie & summary). */
import { useMemo, useState } from 'react';
import { CORRELATION_ASSETS, PROFILE_KEYS } from '../config';
import type { Asset } from '../engine/types';
import { useI18n } from '../i18n';
import { isAllocationValid, totalAllocation, type Action, type AppState, type Phase } from '../state/store';
import { baseOption, Chart, useChartTheme, type ChartTheme } from './Chart';
import { Alert, Card, NumberField, Select, Switch } from './ui';

/** Colour follows the asset (fixed slot), never its rank in the current list. */
export function assetColor(th: ChartTheme, name: string): string {
  const i = CORRELATION_ASSETS.indexOf(name);
  return th.series[(i < 0 ? 0 : i) % th.series.length];
}

export function PortfolioPanel({ state, dispatch }: { state: AppState; dispatch: (a: Action) => void }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('accumulation');

  return (
    <div className="stack">
      <Card title={t('portfolio_config')}>
        <Switch
          label={t('use_same_portfolio')}
          help={t('use_same_portfolio_help')}
          checked={state.useSamePortfolio}
          onChange={(value) => dispatch({ type: 'samePortfolio', value })}
        />
        {!state.useSamePortfolio && (
          <div className="segmented wide" role="tablist">
            {(['accumulation', 'retirement'] as Phase[]).map((ph) => (
              <button key={ph} type="button" role="tab" aria-selected={phase === ph} className={phase === ph ? 'on' : ''} onClick={() => setPhase(ph)}>
                {t(ph === 'accumulation' ? 'accumulation_short' : 'retirement_short')}
                <span className={`dot ${isAllocationValid(state.assets[ph]) ? 'ok' : 'bad'}`} aria-hidden />
              </button>
            ))}
          </div>
        )}
      </Card>
      <PhaseEditor key={state.useSamePortfolio ? 'accumulation' : phase} phase={state.useSamePortfolio ? 'accumulation' : phase} state={state} dispatch={dispatch} />
    </div>
  );
}

function PhaseEditor({ phase, state, dispatch }: { phase: Phase; state: AppState; dispatch: (a: Action) => void }) {
  const { t, profileName, num } = useI18n();
  const assets = state.assets[phase];
  const total = totalAllocation(assets);
  const valid = isAllocationValid(assets);
  const title = state.useSamePortfolio || phase === 'accumulation' ? t('accumulation_portfolio') : t('retirement_portfolio');

  return (
    <div className="portfolio-grid">
      <Card title={title}>
        <div className="profile-row">
          <Select
            label={phase === 'accumulation' ? t('accumulation_profile') : t('retirement_profile')}
            value={state.selectedProfile[phase]}
            options={PROFILE_KEYS.map((k) => ({ value: k, label: profileName(k) }))}
            onChange={(profile) => dispatch({ type: 'selectProfile', phase, profile })}
          />
          <button type="button" className="btn secondary" onClick={() => dispatch({ type: 'loadProfile', phase })}>
            {t('load_profile')}
          </button>
        </div>

        <div className="alloc-status">
          <div className="alloc-bar" aria-hidden>
            <span style={{ width: `${Math.min(total, 100)}%` }} className={valid ? 'ok' : total > 100 ? 'over' : 'under'} />
          </div>
          <Alert tone={valid ? 'success' : 'danger'}>
            {valid ? t('correct_allocation', num(total, 1)) : t('total_allocation_error', num(total, 1))}
          </Alert>
        </div>

        <p className="muted">{t('historical_calibration_note')}</p>
        <ul className="asset-list">
          {assets.map((a, i) => (
            <AssetRow key={a.name} asset={a} onChange={(patch) => dispatch({ type: 'updateAsset', phase, index: i, patch })} />
          ))}
        </ul>

        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'resetAllocations', phase })}>{t('reset_allocations')}</button>
          <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'balanceAllocations', phase })}>{t('balance_allocations')}</button>
        </div>
      </Card>

      <Card title={t('portfolio_distribution')} className="sticky-card">
        <AllocationChart assets={assets} valid={valid} />
      </Card>
    </div>
  );
}

function AssetRow({ asset, onChange }: { asset: Asset; onChange: (patch: Partial<Asset>) => void }) {
  const { t, assetName } = useI18n();
  const th = useChartTheme();
  const [open, setOpen] = useState(false);
  return (
    <li className={`asset-row ${asset.allocation > 0 ? 'active' : ''}`}>
      <div className="asset-main">
        <span className="swatch" style={{ background: assetColor(th, asset.name) }} aria-hidden />
        <span className="asset-name">{assetName(asset.name)}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={asset.allocation}
          aria-label={`${assetName(asset.name)} ${t('allocation_percent')}`}
          onChange={(e) => onChange({ allocation: Number(e.target.value) })}
        />
        <NumberField compact label={t('allocation_percent')} value={asset.allocation} min={0} max={100} step={1} decimals={2} onChange={(v) => onChange({ allocation: v })} />
        <button type="button" className="icon-btn" aria-expanded={open} aria-label={t('advanced_parameters')} onClick={() => setOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }}>
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="asset-advanced">
          <NumberField label={t('ter_percent')} value={asset.ter} min={0} max={5} step={0.01} decimals={3} onChange={(v) => onChange({ ter: v })} />
          <NumberField label={t('return_percent')} value={asset.return} step={0.1} decimals={2} onChange={(v) => onChange({ return: v })} />
          <NumberField label={t('volatility_percent')} value={asset.volatility} min={0} step={0.1} decimals={2} onChange={(v) => onChange({ volatility: v })} />
          <NumberField label={t('min_return_percent')} value={asset.min_return} step={1} decimals={2} onChange={(v) => onChange({ min_return: v })} />
          <NumberField label={t('max_return_percent')} value={asset.max_return} step={1} decimals={2} onChange={(v) => onChange({ max_return: v })} />
        </div>
      )}
    </li>
  );
}

function AllocationChart({ assets, valid }: { assets: Asset[]; valid: boolean }) {
  const { t, assetName, num } = useI18n();
  const th = useChartTheme();
  const active = assets.filter((a) => a.allocation > 0);

  const option = useMemo(() => ({
    ...baseOption(th),
    legend: { show: false },
    xAxis: { show: false },
    yAxis: { show: false },
    tooltip: { ...(baseOption(th).tooltip as object), trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}: <b>${num(p.value, 1)}%</b>` },
    series: [{
      type: 'pie',
      radius: ['55%', '85%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: th.surface, borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      data: active.map((a) => ({ name: assetName(a.name), value: a.allocation, itemStyle: { color: assetColor(th, a.name) } })),
    }],
  }), [active, th, assetName, num]);

  if (!valid || !active.length) return <p className="muted">{t('no_asset_selected')}</p>;

  return (
    <>
      <Chart option={option} height={220} ariaLabel={t('portfolio_distribution')} />
      <ul className="legend-list">
        {active.map((a) => (
          <li key={a.name}>
            <span className="swatch" style={{ background: assetColor(th, a.name) }} aria-hidden />
            <span>{assetName(a.name)}</span>
            <span className="num">{num(a.allocation, 1)}%</span>
          </li>
        ))}
      </ul>
    </>
  );
}
