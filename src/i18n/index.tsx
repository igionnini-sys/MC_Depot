import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ASSET_NAMES, PROFILE_NAMES, TRANSLATIONS, type Lang, type TranslationKey } from './translations';

export type { Lang, TranslationKey };

export interface I18n {
  lang: Lang;
  /** Translate; `{0}`, `{1}`… are replaced by args. */
  t: (key: TranslationKey, ...args: (string | number)[]) => string;
  assetName: (name: string) => string;
  profileName: (name: string) => string;
  eur: (v: number) => string;
  /** Number with fixed decimals in the current locale. */
  num: (v: number, decimals?: number) => string;
}

const locales: Record<Lang, string> = { en: 'en-IE', it: 'it-IT' };

export function makeI18n(lang: Lang): I18n {
  const dict = TRANSLATIONS[lang];
  const eurFmt = new Intl.NumberFormat(locales[lang], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const numFmts = new Map<number, Intl.NumberFormat>();
  return {
    lang,
    t: (key, ...args) => {
      const s = dict[key] ?? TRANSLATIONS.en[key] ?? `[MISSING: ${key}]`;
      return args.length ? s.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : s;
    },
    assetName: (n) => ASSET_NAMES[lang][n] ?? n,
    profileName: (n) => PROFILE_NAMES[lang][n] ?? n,
    eur: (v) => (Number.isFinite(v) ? eurFmt.format(v) : 'N/A'),
    num: (v, d = 1) => {
      if (!Number.isFinite(v)) return 'N/A';
      let f = numFmts.get(d);
      if (!f) {
        f = new Intl.NumberFormat(locales[lang], { minimumFractionDigits: d, maximumFractionDigits: d });
        numFmts.set(d, f);
      }
      return f.format(v);
    },
  };
}

const Ctx = createContext<I18n>(makeI18n('en'));

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => makeI18n(lang), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
