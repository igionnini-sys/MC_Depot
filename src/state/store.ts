/** App state (replaces st.session_state + PortfolioManager), persisted in localStorage. */
import { useEffect, useReducer } from 'react';
import { DEFAULT_ACCUMULATION_PROFILE, DEFAULT_RETIREMENT_PROFILE, getProfileData, type ScenarioKey } from '../config';
import type { Asset, SimulationParams } from '../engine/types';
import type { Lang } from '../i18n';

export type Phase = 'accumulation' | 'retirement';
export type Theme = 'system' | 'light' | 'dark';

export interface AppState {
  lang: Lang;
  theme: Theme;
  params: SimulationParams;
  useSamePortfolio: boolean;
  selectedProfile: Record<Phase, string>;
  assets: Record<Phase, Asset[]>;
  correlation: { enabled: boolean; scenario: ScenarioKey };
}

export const DEFAULT_PARAMS: SimulationParams = {
  initialAmount: 0,
  yearsToRetirement: 40,
  yearsRetired: 25,
  annualContribution: 6000,
  adjustContributionInflation: true,
  inflation: 2.5,
  useRealWithdrawal: true,
  withdrawal: 12000,
  capitalGainsTaxRate: 26,
  nSimulations: 10000,
};

export type Action =
  | { type: 'lang'; lang: Lang }
  | { type: 'theme'; theme: Theme }
  | { type: 'param'; key: keyof SimulationParams; value: number | boolean }
  | { type: 'samePortfolio'; value: boolean }
  | { type: 'selectProfile'; phase: Phase; profile: string }
  | { type: 'loadProfile'; phase: Phase }
  | { type: 'updateAsset'; phase: Phase; index: number; patch: Partial<Asset> }
  | { type: 'resetAllocations'; phase: Phase }
  | { type: 'balanceAllocations'; phase: Phase }
  | { type: 'correlation'; enabled?: boolean; scenario?: ScenarioKey }
  | { type: 'resetAll' };

const STORAGE_KEY = 'finret.state.v1';

function initialState(): AppState {
  const acc = getProfileData(DEFAULT_ACCUMULATION_PROFILE);
  const navLang = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('it') ? 'it' : 'en';
  return {
    lang: navLang,
    theme: 'system',
    params: { ...DEFAULT_PARAMS },
    useSamePortfolio: true,
    selectedProfile: { accumulation: DEFAULT_ACCUMULATION_PROFILE, retirement: DEFAULT_RETIREMENT_PROFILE },
    assets: { accumulation: acc, retirement: acc.map((a) => ({ ...a })) },
    correlation: { enabled: false, scenario: 'normal_times' },
  };
}

function load(): AppState {
  const init = initialState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AppState> | null;
    if (!saved) return init;
    return {
      ...init,
      ...saved,
      params: { ...init.params, ...saved.params },
      selectedProfile: { ...init.selectedProfile, ...saved.selectedProfile },
      assets: saved.assets?.accumulation?.length ? saved.assets : init.assets,
      correlation: { ...init.correlation, ...saved.correlation },
    };
  } catch {
    return init;
  }
}

const copy = (assets: Asset[]) => assets.map((a) => ({ ...a }));

/** When the same portfolio is used for both phases, retirement mirrors accumulation. */
function withAssets(s: AppState, phase: Phase, assets: Asset[]): AppState {
  const next = { ...s.assets, [phase]: assets };
  if (s.useSamePortfolio && phase === 'accumulation') next.retirement = copy(assets);
  return { ...s, assets: next };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'lang':
      return { ...s, lang: a.lang };
    case 'theme':
      return { ...s, theme: a.theme };
    case 'param':
      return { ...s, params: { ...s.params, [a.key]: a.value } };
    case 'samePortfolio': {
      const next = { ...s, useSamePortfolio: a.value };
      return a.value ? withAssets(next, 'accumulation', s.assets.accumulation) : next;
    }
    case 'selectProfile':
      return { ...s, selectedProfile: { ...s.selectedProfile, [a.phase]: a.profile } };
    case 'loadProfile': {
      const data = getProfileData(s.selectedProfile[a.phase]);
      if (!data.length) return s;
      const next = withAssets(s, a.phase, data);
      if (s.useSamePortfolio && a.phase === 'accumulation') {
        next.selectedProfile = { ...next.selectedProfile, retirement: s.selectedProfile.accumulation };
      }
      return next;
    }
    case 'updateAsset':
      return withAssets(s, a.phase, s.assets[a.phase].map((x, i) => (i === a.index ? { ...x, ...a.patch } : x)));
    case 'resetAllocations':
      return withAssets(s, a.phase, s.assets[a.phase].map((x) => ({ ...x, allocation: 0 })));
    case 'balanceAllocations': {
      const active = s.assets[a.phase].filter((x) => x.allocation > 0).length;
      if (!active) return s;
      const eq = 100 / active;
      return withAssets(s, a.phase, s.assets[a.phase].map((x) => ({ ...x, allocation: x.allocation > 0 ? eq : 0 })));
    }
    case 'correlation':
      return {
        ...s,
        correlation: { enabled: a.enabled ?? s.correlation.enabled, scenario: a.scenario ?? s.correlation.scenario },
      };
    case 'resetAll':
      return { ...initialState(), lang: s.lang, theme: s.theme };
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable (private mode): state simply isn't persisted */
    }
  }, [state]);
  return [state, dispatch] as const;
}

export const totalAllocation = (assets: Asset[]) => assets.reduce((s, a) => s + a.allocation, 0);
export const isAllocationValid = (assets: Asset[]) => Math.abs(totalAllocation(assets) - 100) <= 0.01;
