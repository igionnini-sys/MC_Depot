/** App shell (port of STRM.py main()). */
import { useCallback, useEffect, useState } from 'react';
import { CORRELATION_ASSETS, scenarioMatrix } from './config';
import { totalDeposited } from './engine/stats';
import type { SimulationRequest, SimulationResults } from './engine/types';
import { ChartThemeContext, chartTheme } from './components/Chart';
import { ParametersPanel } from './components/ParametersPanel';
import { PortfolioPanel } from './components/PortfolioPanel';
import { ResultsView, type ResultsBundle } from './components/ResultsView';
import { Alert, Collapsible, Segmented } from './components/ui';
import { I18nProvider, makeI18n, useI18n, type Lang, type TranslationKey } from './i18n';
import { isAllocationValid, useAppState, type Action, type AppState, type Theme } from './state/store';
import { useSimulation } from './state/useSimulation';

type View = 'parameters' | 'portfolio' | 'results';

function useResolvedDark(theme: Theme) {
  const query = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [systemDark, setSystemDark] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', fn);
    return () => query.removeEventListener('change', fn);
  }, [query]);
  return theme === 'dark' || (theme === 'system' && systemDark);
}

export default function App() {
  const [state, dispatch] = useAppState();
  const dark = useResolvedDark(state.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', state.theme);
    root.lang = state.lang;
    document.title = `FinRet · ${makeI18n(state.lang).t('page_title')}`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1a19' : '#fcfcfb');
  }, [state.theme, state.lang, dark]);

  return (
    <I18nProvider lang={state.lang}>
      <ChartThemeContext.Provider value={chartTheme(dark)}>
        <Shell state={state} dispatch={dispatch} />
      </ChartThemeContext.Provider>
    </I18nProvider>
  );
}

/** Port of PortfolioManager.validate_simulation_inputs. Returns an error key or the active assets. */
function validate(state: AppState): { error: TranslationKey } | { acc: AppState['assets']['accumulation']; ret: AppState['assets']['retirement'] } {
  const acc = state.assets.accumulation.filter((a) => a.allocation > 0);
  const ret = state.assets.retirement.filter((a) => a.allocation > 0);
  if (!acc.length) return { error: 'select_accumulation_assets_error' };
  if (!ret.length) return { error: 'select_retirement_assets_error' };
  if (!isAllocationValid(acc)) return { error: 'fix_accumulation_allocations_error' };
  if (!isAllocationValid(ret)) return { error: 'fix_retirement_allocations_error' };
  return { acc, ret };
}

function Shell({ state, dispatch }: { state: AppState; dispatch: (a: Action) => void }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState<View>('parameters');
  const [bundle, setBundle] = useState<ResultsBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDone = useCallback((results: SimulationResults, req: SimulationRequest) => {
    const p = req.params;
    setBundle({
      results,
      params: p,
      totalDeposited: totalDeposited(p.initialAmount, p.annualContribution, p.yearsToRetirement, p.adjustContributionInflation, p.inflation),
    });
    setView('results');
    requestAnimationFrame(() => document.querySelector('.pane-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);
  const sim = useSimulation(onDone);

  const run = () => {
    setError(null);
    const v = validate(state);
    if ('error' in v) {
      setError(t(v.error));
      setView('portfolio');
      return;
    }
    sim.run({
      params: state.params,
      accumulationAssets: v.acc,
      retirementAssets: v.ret,
      correlation: state.correlation.enabled
        ? { enabled: true, assets: CORRELATION_ASSETS, matrix: scenarioMatrix(state.correlation.scenario) }
        : null,
    });
  };

  const running = sim.status.kind === 'running';
  const progress = running && sim.status.kind === 'running' ? sim.status.done / Math.max(1, sim.status.total) : 0;
  const runState = (
    <div className="run-box">
      {running ? (
        <>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="run-row">
            <span className="muted small">
              {sim.status.kind === 'running' && t('simulation_step', sim.status.done.toLocaleString(lang), sim.status.total.toLocaleString(lang))}
            </span>
            <button type="button" className="btn ghost" onClick={sim.cancel}>{t('cancel')}</button>
          </div>
        </>
      ) : (
        <button type="button" className="btn primary block" onClick={run}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
          {t('run_simulation')}
        </button>
      )}
    </div>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="icons/icon.svg" alt="" width="28" height="28" />
          <div>
            <div className="brand-name">FinRet</div>
            <div className="brand-sub">{t('main_title')}</div>
          </div>
        </div>
        <div className="topbar-actions">
          <Segmented<Lang> ariaLabel={t('language_selector')} value={state.lang} onChange={(l) => dispatch({ type: 'lang', lang: l })}
            options={[{ value: 'it', label: 'IT' }, { value: 'en', label: 'EN' }]} />
          <Segmented<Theme> ariaLabel={t('theme')} value={state.theme} onChange={(th) => dispatch({ type: 'theme', theme: th })}
            options={[
              { value: 'light', label: <span title={t('theme_light')}>☀</span> },
              { value: 'system', label: <span title={t('theme_system')}>A</span> },
              { value: 'dark', label: <span title={t('theme_dark')}>☾</span> },
            ]} />
        </div>
      </header>

      <div className="layout" data-view={view}>
        <aside className="pane pane-parameters">
          <h2 className="section-title">{t('simulation_parameters')}</h2>
          <ParametersPanel state={state} dispatch={dispatch} />
          <div className="sticky-run">{runState}</div>
        </aside>

        <main className="pane pane-main">
          <Collapsible title={t('disclaimers_header')}>
            <Disclaimers />
          </Collapsible>

          <div className="pane-portfolio">
            {error && <Alert tone="danger">{error}</Alert>}
            <PortfolioPanel state={state} dispatch={dispatch} />
          </div>

          <div className="pane-results">
            {sim.status.kind === 'error' && <Alert tone="danger">{t('simulation_error', sim.status.message)}</Alert>}
            {bundle ? (
              <>
                <div className="result-badges">
                  <Alert tone="success">{t('simulation_completed')} · {bundle.params.nSimulations.toLocaleString(lang)}</Alert>
                  <Alert tone={bundle.params.useRealWithdrawal ? 'success' : 'info'}>
                    {bundle.params.useRealWithdrawal ? t('used_real_withdrawal') : t('used_nominal_withdrawal')}
                  </Alert>
                  {bundle.results.correlationUsed && (
                    <Alert tone="info">{t('used_correlation', t(`scenario_${state.correlation.scenario}` as TranslationKey))}</Alert>
                  )}
                </div>
                <ResultsView bundle={bundle} />
              </>
            ) : (
              <div className="empty">
                <p className="muted">{t('no_results')}</p>
              </div>
            )}
          </div>

          <footer className="footer">{t('footer')}</footer>
        </main>
      </div>

      <div className="mobile-run">{runState}</div>
      <nav className="bottom-nav" aria-label="Sezioni">
        {(['parameters', 'portfolio', 'results'] as View[]).map((v) => (
          <button key={v} type="button" aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
            <NavIcon view={v} />
            <span>{t(v === 'parameters' ? 'nav_parameters' : v === 'portfolio' ? 'nav_portfolio' : 'nav_results')}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function NavIcon({ view }: { view: View }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, 'aria-hidden': true };
  if (view === 'parameters') return <svg {...common}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
  if (view === 'portfolio') return <svg {...common}><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></svg>;
  return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
}

function Disclaimers() {
  const { t } = useI18n();
  const items: [TranslationKey, TranslationKey][] = [
    ['educational_disclaimer', 'educational_text'],
    ['app_explanation_title', 'app_explanation'],
    ['long_term_disclaimer', 'long_term_text'],
    ['returns_disclaimer', 'returns_text'],
    ['correlation_disclaimer', 'correlation_text'],
    ['real_withdrawal_disclaimer', 'real_withdrawal_text'],
    ['tax_disclaimer', 'tax_disclaimer_text'],
    ['data_info', 'data_text'],
  ];
  return (
    <div className="disclaimers">
      {items.map(([h, b]) => (
        <div key={h}>
          <h3>{t(h)}</h3>
          <p>{t(b)}</p>
        </div>
      ))}
    </div>
  );
}
