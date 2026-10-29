# Prompt per l'AI — Modulo fiscale multi-paese (copia/incolla)

> Usare insieme a [piano-fiscalita-multipaese.md](piano-fiscalita-multipaese.md). Si lavora **un passo alla volta** (Passo N del piano): dare all'AI solo il passo corrente.

---

## Contesto

Sei in un repository **FinRet**: PWA React 18 + TypeScript + Vite che esegue simulazioni Monte Carlo di accumulo e decumulo per il pensionamento (portata da un'app Streamlit in `oldCode/`, solo riferimento). Leggi prima `PROGRESS.md`, `README.md` e `docs/piano-fiscalita-multipaese.md`.

File rilevanti:
- `src/engine/simulation.ts` — `runSimulation`, `simulateOne` (ciclo annuale), `yearReturn` (rendimento ponderato, tetti min/max, TER)
- `src/engine/taxEngine.ts` — fisco attuale a lotti con un'unica aliquota sui plusvalori
- `src/engine/types.ts` — `SimulationParams`, `SimulationRequest`, `SimulationResults`
- `src/engine/worker.ts` — esecuzione in Web Worker; `src/engine/simulation.test.ts` — test (Vitest)
- `src/state/store.ts` — stato + `localStorage` (`finret.state.v1`)
- `src/components/ParametersPanel.tsx`, `ResultsView.tsx` — UI; `src/i18n/translations.ts` — testi IT/EN
- `src/config/enhanced_config.json` — profili e asset (Stocks, Bond, Gold, REIT, Commodities, Cash, UserAsset1/2)

Non esiste NumPy né un modulo `withdrawal_strategy`: il prelievo è dentro `simulateOne`. Il motore è un ciclo JS per simulazione (10.000 simulazioni ≈ 150 ms oggi).

## Obiettivo

Aggiungere un modulo fiscale **semplificato, modulare e multi-paese**: selezione del paese di residenza fiscale, partendo dalla **Germania** (incluso il nuovo **Altersvorsorgedepot dal 01/01/2027**), con interfaccia e stub pronti per **Italia** e **Paesi Bassi**.

## Regole di lavoro

1. Fai **solo il passo indicato**. Prima di scrivere codice, elenca in poche righe cosa cambierai e quali file. Poi implementa, esegui `npm test` e `npm run build`, e aggiorna `PROGRESS.md`.
2. **Non inventare parametri normativi.** Ogni valore legale (Basiszins, tariffa ESt, tetti, bonus, quote, bollo, aliquote Box 3) va in `src/tax/params/*.json` per anno, con `source` (URL o norma) e `verified`. Se non puoi confermarlo, `verified: false` e segnalalo nel riepilogo. Mai valori fissi nel codice.
3. Regime `simplified` = comportamento attuale: a parità di seme i risultati devono restare **identici** (test di regressione).
4. **Tutto in euro nominali** nel motore; franchigie e scaglioni sono nominali. La deflazione solo in visualizzazione. (Se il Passo 0 non è fatto, fermati e dillo.)
5. Performance: nessuna allocazione per anno o per lotto nel ciclo caldo; tabelle precalcolate fuori dal ciclo; aggiungi un test/benchmark (10.000 simulazioni, target < 500 ms).
6. Stile: segui quello del codice esistente (commenti essenziali, nomi inglesi nel codice, testi UI in `translations.ts` IT/EN, parametri in %). Niente nuove dipendenze senza motivo.
7. Se un requisito è ambiguo, **chiedi** invece di scegliere in silenzio.

## Specifiche Germania (da implementare nei Passi 2–3)

Classe `GermanyTaxEngine` con due contenitori.

**A) Deposito ordinario**
- *Sparer-Pauschbetrag*: 1.000 € (singolo) / 2.000 € (coppia), annuo, nominale.
- *Abgeltungsteuer*: 25% + Soli 5,5% = 26,375%. Kirchensteuer: enum `none | 8% | 9%`; con Kirchensteuer `e = 25% / (1 + 25%·k)`, totale `e · (1 + 5,5% + k)`.
- *Teilfreistellung* per tipologia di asset (non solo ">50% azioni"): proposta di default Stocks 30%, REIT azionario 30%, Bond/Cash 0%, Gold/Commodities (ETC) 0%. Configurabile per asset; aliquota ponderata sul portafoglio.
- *Vorabpauschale* (solo fondi, non ETC), a fine anno dopo il rendimento: `Basisertrag = valore a inizio anno × Basiszins × 0,7`; `Vorabpauschale = max(0, min(Basisertrag, rendimento effettivo dell'anno))`. Ordine: applica **prima** la Teilfreistellung, **poi** sottrai il Sparer-Pauschbetrag residuo, l'eccedenza paga l'Abgeltungsteuer. La Vorabpauschale cumulata (importo lordo, pre-Teilfreistellung) **riduce il plusvalore alla vendita** (niente doppia imposizione). Contributi versati a fine anno: nessuna Vorabpauschale nell'anno del versamento. L'imposta riduce il valore del portafoglio (si preleva dalla liquidità).
- *Decumulo*: prelievo proporzionale (default) o FIFO (opzione); si tassa solo il plusvalore netto dopo Teilfreistellung, con compensazione delle perdite nello stesso deposito. Input = **netto** desiderato; calcola il lordo con gross-up.

**B) Altersvorsorgedepot (dal 2027)** — *parametri dall'utente, da verificare sulla legge definitiva*
- Accumulo: tetto agevolato 6.840 €/anno; Zulage 50% sui primi 360 € (max 180 €) + 25% sui successivi fino a 1.800 € (max 360 €); totale base 540 €/anno; + 300 €/anno per figlio. Nessuna Abgeltungsteuer e nessuna Vorabpauschale durante l'accumulo.
- *Günstigerprüfung*: confronta la Zulage con il risparmio da deduzione (Sonderausgabenabzug) all'aliquota marginale indicata; se la deduzione vale di più, il beneficio aggiuntivo = differenza. Base di deduzione e tetto: parametri da confermare.
- Decumulo: età minima 65; quota forfettaria una tantum fino al 30% (trattamento fiscale da confermare); rate (piano fino a 85+) tassate **interamente** con la tariffa progressiva (Einkommensteuertarif, tabella per anno) come reddito differito. Gross-up per bisezione perché la tariffa non è invertibile in forma chiusa.
- Risparmio annuo diviso tra AVD e deposito ordinario secondo il parametro "versamento annuo in AVD" (con tetto).

## Estensioni (stub dal Passo 1, implementazione Passi 5–6)

- `ItalyTaxEngine`: imposta sostitutiva 26% al realizzo, bollo 0,20% annuo sul patrimonio (a fine anno, prima del contributo), fondo pensione: deducibilità fino a 5.164,57 €, decumulo con aliquota agevolata 15% → 9%.
- `NetherlandsTaxEngine`: Box 3, tassazione annuale su rendimento forfettario del patrimonio al netto dei debiti, aliquote/franchigie per anno.

## Dove controllare (audit prima di modificare)

1. `simulateOne` in `src/engine/simulation.ts`: ordine rendimento → imposte annuali → contributo. Verifica che le imposte annuali (Vorabpauschale, bollo) riducano il patrimonio **dopo** il rendimento e **prima** del contributo di fine anno.
2. Decumulo in `simulateOne`: oggi preleva il lordo desiderato. Introduci gross-up (`src/tax/grossUp.ts`) con gestione esaurimento portafoglio.
3. Performance: `worker.ts` e il ciclo di `simulateOne`; nessun `new Array`/oggetto per anno o lotto; bisezione con iterazioni limitate.
4. `taxEngine.ts`: tassa i lotti singolarmente (`max(0, …)` per lotto) → in Germania le perdite si compensano nello stesso deposito.
5. `store.ts`: nuovi parametri richiedono `finret.state.v2` con migrazione dal v1.
6. `simulation.test.ts`: aggiungi regressione sul regime `simplified` con seme fisso.

## Consegna per ogni passo

1. Interfacce/strutture dati TypeScript del passo (`src/tax/types.ts`, ecc.).
2. Implementazione e integrazione nel motore.
3. Test Vitest, almeno (valori calcolati a mano, tolleranza 0,01 €):
   - **Vorabpauschale**: Basiszins 2,53% (solo esempio), valore 100.000 €, rendimento +5.000 € → Vorabpauschale 1.771 €; con Teilfreistellung 30% → 1.239,70 €; dopo Sparer-Pauschbetrag 1.000 € → imponibile 239,70 €, imposta 63,22 €. Rendimento +800 € → 800 €; rendimento negativo → 0. La Vorabpauschale cumulata riduce il plusvalore alla vendita.
   - **Aliquote**: 26,375% senza Kirchensteuer, 27,82% con 8%, 27,99% con 9%.
   - **AVD**: versamento 1.800 € → Zulage 540 €; 360 € → 180 €; due figli → +600 €; Günstigerprüfung con aliquota 30% vs 10% (vedi piano §6).
   - **Decumulo**: imposta netta con reddito imponibile 0, medio e alto; gross-up: `net(gross(N)) ≈ N`; portafoglio insufficiente.
   - Limiti: anni = 0, perdita, Basiszins ≤ 0, tetto AVD superato.
4. Aggiornamento di `PROGRESS.md` (stato, decisioni, parametri `verified: false` aperti).
5. Riepilogo finale: cosa è stato fatto, cosa **non** è stato verificato, cosa serve da me.

## Esclusioni da dichiarare

Krankenversicherung sulle pensioni, Kirchensteuer per stati federali diversi, Freistellungsauftrag su più banche, Teilfreistellung "reale" per singolo fondo, regole di successione. Il tool resta educativo: nessuna consulenza fiscale.
