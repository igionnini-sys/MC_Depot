/** Port of config_manager.py / enhanced_config_manager.py: profiles, asset characteristics, correlation scenarios. */
import raw from './enhanced_config.json';
import type { Asset } from '../engine/types';

interface Characteristics { return: number; volatility: number; min_return: number; max_return: number }
interface ProfileEntry { name: string; allocation: number; ter: number }

const characteristics = raw.asset_characteristics as Record<string, Characteristics>;
const profiles = raw.asset_profiles as Record<string, ProfileEntry[]>;

export const PROFILE_KEYS = Object.keys(profiles);
export const DEFAULT_ACCUMULATION_PROFILE = 'Moderate';
export const DEFAULT_RETIREMENT_PROFILE = 'Conservative';

/** Asset order of the correlation matrices in the config. */
export const CORRELATION_ASSETS: string[] = raw.correlation_matrix.assets;

export const SCENARIO_KEYS = ['normal_times', 'crisis_times', 'independent', 'defensive', 'high_inflation'] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export function scenarioMatrix(key: ScenarioKey): number[][] {
  return (raw.correlation_scenarios as Record<string, { matrix: number[][] }>)[key].matrix;
}

/** Asset list of a profile, combining allocation/TER with the asset characteristics. */
export function getProfileData(profile: string): Asset[] {
  return (profiles[profile] ?? [])
    .filter((p) => p.name in characteristics)
    .map((p) => ({ name: p.name, allocation: p.allocation, ter: p.ter, ...characteristics[p.name] }));
}
