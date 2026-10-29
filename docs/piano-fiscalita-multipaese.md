# Piano di lavoro — Fiscalità multi-paese (Germania → Italia → Paesi Bassi)

Stato: **da approvare**. Si procede un passo alla volta; dopo ogni passo si aggiorna `PROGRESS.md`.
Il prompt operativo per l'AI è in [prompt-fiscalita-multipaese.md](prompt-fiscalita-multipaese.md).

## 1. Punto di partenza (codice attuale)

| Cosa | Dove | Stato oggi |
|---|---|---|
| Ciclo di simulazione, rendimento annuo | `src/engine/simulation.ts` (`simulateOne`, `yearReturn`) | Accumulo: rendimenti → contributo a fine anno. Decumulo: rendimento → prelievo. Rendimento medio ponderato dell'intero portafoglio |
| Fisco | `src/engine/taxEngine.ts` | Un solo contenitore a lotti, **una sola aliquota** sul plusvalore al prelievo. Nessuna imposta annuale |
| Prelievo | dentro `simulateOne` (non esiste un modulo `withdrawal_strategy`) | Si preleva l'importo **lordo** desiderato; le tasse lo riducono (da qui "efficacia prelievo"). Nessun gross-up |
| Parametri | `src/engine/types.ts` (`SimulationParams.capitalGainsTaxRate`) | Solo aliquota %; nessuna età, anno di partenza, paese |
| UI | `ParametersPanel.tsx`, `ResultsView.tsx` (`TaxAnalysis`) | Un solo campo aliquota, una spiegazione generica |
| Stato salvato | `src/state/store.ts` (chiave `finret.state.v1`) | Va versionato se si aggiungono campi |
| Performance | `worker.ts` | 10.000 simulazioni ≈ 150 ms. **Non c'è NumPy**: è un loop JS per simulazione, quindi il budget è "niente allocazioni per anno/lotto" |

## 2. Dipendenze e decisioni da prendere PRIMA

1. **Modello nominale/reale (blocca tutto).** Franchigie, scaglioni IRPEF/ESt e Basiszins sono *nominali*; oggi il decumulo mescola reale e nominale (vedi PROGRESS.md, Fase 2, punto 1). Con una tassa progressiva il risultato sarebbe sbagliato. **Proposta:** tutto il motore in euro nominali, con deflazione solo in visualizzazione.
2. **Prelievo target netto o lordo?** Proposta: l'utente indica il **netto** desiderato (in potere d'acquisto di oggi) e il motore calcola il lordo (gross-up).
3. **Due contenitori in parallelo (Germania).** Come si divide il risparmio annuo tra Altersvorsorgedepot (AVD) e deposito ordinario? Proposta: parametro "versamento annuo in AVD" (con tetto 6.840 €); il resto va nel deposito ordinario.
4. **Dati personali Germania:** singolo/coppia, Kirchensteuer (nessuna/8%/9%), numero figli, altri redditi in pensione, aliquota marginale in accumulo (per la Günstigerprüfung). Proposta: tariffa progressiva reale calcolata dal reddito imponibile; aliquota marginale come input in accumulo.
5. **Età e calendario:** servono *età attuale* e *anno di partenza* (regola 65+, riforma dal 2027, Basiszins per anno).
6. **Teilfreistellung per asset, non solo ">50% azioni".** Proposta di default (da verificare con un consulente): Stocks 30%, REIT-ETF azionario 30%, Bond/Cash 0%, Gold e Commodities (ETC) 0% e **senza Vorabpauschale** (non sono fondi). Il portafoglio è già ribilanciato a pesi costanti, quindi si usa l'aliquota ponderata.

> **Parametri normativi.** Tutto ciò che riguarda l'Altersvorsorgedepot 2027 (tetto 6.840 €, Zulage 50%/25%, bonus figli, quota forfettaria 30%, età 65, piano fino a 85+) viene dalle tue note. **Va verificato sul testo di legge definitivo** prima di fissarlo nel codice: va in file di parametri datati, con campo `source` e `verified: false` finché non confermato. Lo stesso vale per Basiszins, tariffa ESt, bollo e Box 3 (cambiano ogni anno).

## 3. Architettura proposta

```
src/tax/
  types.ts              TaxRegime, TaxContainer, TaxParams, CountryCode
  registry.ts           country → regime (default: "simplified" = comportamento attuale)
  common/progressive.ts tariffe a scaglioni (funzione pura, tabelle per anno)
  params/de.json        parametri datati Germania (Basiszins per anno, tariffa, ecc.) + source/verified
  de/                   GermanyTaxEngine: brokerage.ts, altersvorsorgedepot.ts, guenstigerpruefung.ts
  it/                   ItalyTaxEngine (stub, poi implementazione)
  nl/                   NetherlandsTaxEngine (stub, poi implementazione)
  grossUp.ts            gross-up numerico (bisezione) per netto → lordo
```

Interfaccia comune (idea): un regime espone `onYearEnd(state, grossReturn, year)` (tasse annuali), `onContribution(...)` (bonus/deduzioni) e `withdraw(state, netTarget, year)` (restituisce lordo, tasse, netto). Lo stato di ogni contenitore è un oggetto piatto (valore, costo, Vorabpauschale cumulata, ecc.), senza array di lotti, per restare veloci.

## 4. Passi (uno alla volta)

### Passo 0 — Modello coerente in nominale
Risolvere Fase 2 di PROGRESS.md (punto 1 e 2). *Fatto quando:* un caso a rendimento deterministico dà il valore atteso calcolato a mano; i test esistenti sono aggiornati; il tasso di successo cambia in modo spiegato.

### Passo 1 — Struttura plug-in, nessun cambio di numeri
Introdurre `src/tax/` con regime `simplified` che replica `taxEngine.ts` attuale; selettore paese in UI (solo "Semplificato" attivo); versione dello stato salvato (`finret.state.v2`) con migrazione. *Fatto quando:* i risultati con seme fisso sono identici a prima.

### Passo 2 — Germania: deposito ordinario
Abgeltungsteuer + Soli (+ Kirchensteuer), Sparer-Pauschbetrag, Teilfreistellung, Vorabpauschale con tracciamento cumulativo, decumulo proporzionale (FIFO opzionale), gross-up. *Fatto quando:* i test del §6 passano e il confronto con un foglio di calcolo indipendente combacia.

### Passo 3 — Germania: Altersvorsorgedepot 2027
Accumulo senza tasse, Zulage (base + figli), Günstigerprüfung, decumulo: quota forfettaria una tantum ≤ 30%, resto in rate tassate con tariffa progressiva. *Fatto quando:* test del §6 verdi; il motore gestisce AVD + deposito insieme.

### Passo 4 — Interfaccia e risultati
Selettore paese; pannello parametri Germania; risultati con tasse totali per contenitore, aliquota effettiva, confronto AVD vs deposito; testi IT/EN; avvisi "parametro non verificato". *Fatto quando:* verifica visiva su desktop e mobile.

### Passo 5 — Italia
Imposta sostitutiva 26% (12,5% titoli di stato, da valutare), bollo 0,20% annuo sul patrimonio, fondo pensione: deducibilità fino a 5.164,57 €, tassazione del decumulo 15% → 9%. Stub già dal Passo 1.

### Passo 6 — Paesi Bassi
Box 3: tassazione annuale sul rendimento forfettario (aliquote per categoria, franchigia, debiti esclusi); regime in evoluzione, parametri datati.

### Passo 7 — Chiusura
Disclaimer fiscali per paese, README, PROGRESS.md aggiornato.

## 5. Checklist di audit (adattata al codice reale)

| # | Cosa controllare | Dove | Criterio |
|---|---|---|---|
| 1 | Ordine delle operazioni nell'anno | `simulateOne` in `simulation.ts` | Rendimento → **imposte annuali (Vorabpauschale / bollo)** → contributo di fine anno. La Vorabpauschale scade a gennaio dell'anno dopo: si preleva dalla liquidità; nel modello si riduce il valore del portafoglio a fine anno (approssimazione: nessun plusvalore realizzato per pagarla) |
| 2 | Gross-up | nuovo `src/tax/grossUp.ts`, chiamato dal decumulo | Dato il netto N, trovare il lordo L con `net(L) = N`. Con tassazione solo sul plusvalore proporzionale: `L = N / (1 − aliquotaEffettiva)`; con tariffa progressiva non è chiusa → bisezione (≈ 20 iterazioni, funzione pura). Se L > portafoglio: si preleva tutto e si registra il fallimento |
| 3 | Performance | `worker.ts`, nuovi motori | 10.000 simulazioni entro ~500 ms. Niente `Array`/oggetti per anno o per lotto nel ciclo caldo; tabelle fiscali precalcolate fuori dal ciclo; test di benchmark |
| 4 | Parità | `simulation.test.ts` | Regime `simplified` = risultati attuali (stesso seme) |
| 5 | Coerenza nominale | tutto `src/engine` | Nessuna operazione che mescola reale e nominale; le franchigie sono nominali |
| 6 | Perdite | `taxEngine.ts` attuale tassa ogni lotto separatamente (`max(0, ...)` per lotto) | In Germania le perdite nello stesso deposito si compensano: usare un solo aggregato (con proporzionale è equivalente per valore) |
| 7 | Stato salvato | `store.ts` | Migrazione `v1 → v2`; valori di default sensati |
| 8 | Test sui limiti | nuovi test | Anni = 0, portafoglio esaurito, plusvalore negativo, Basiszins ≤ 0, tetto contributi AVD superato |

## 6. Test di accettazione (valori a mano)

**Vorabpauschale (esempio, Basiszins 2,53% *solo per il test*):**
- Valore inizio anno 100.000 €, rendimento effettivo +5.000 €: Basisertrag = 100.000 × 2,53% × 0,7 = **1.771 €** (< 5.000, quindi Vorabpauschale = 1.771 €).
- Teilfreistellung 30%: 1.771 × 0,7 = 1.239,70 €; meno Sparer-Pauschbetrag 1.000 € → imponibile 239,70 €; imposta 239,70 × 26,375% = **63,22 €**.
- Rendimento effettivo +800 €: Vorabpauschale = 800 € (limite al rendimento reale); rendimento negativo: 0.
- Vendita: la Vorabpauschale cumulata (lorda, prima della Teilfreistellung) riduce il plusvalore.

**Aliquote:** senza Kirchensteuer 26,375%. Con Kirchensteuer k: `e = 25% / (1 + 25%·k)`, totale = `e · (1 + 5,5% + k)` → 27,82% (k = 8%), 27,99% (k = 9%).

**Altersvorsorgedepot (parametri da verificare):**
- Versamento 1.800 € → Zulage = 50% × 360 + 25% × 1.440 = **540 €**; versamento 360 € → 180 €; con 2 figli (300 € ciascuno) → +600 €.
- Günstigerprüfung (ipotesi: base di deduzione = versamento + Zulage, come Riester — da confermare nella legge): aliquota marginale 30% → beneficio 0,30 × 2.340 = 702 € > 540 € → rimborso aggiuntivo 162 €; aliquota 10% → 234 € < 540 € → solo Zulage.
- Decumulo: quota forfettaria 30% tassata come reddito (da definire: tassata subito o ripartita? **verificare nella legge**); rate annuali con tariffa progressiva; test: reddito imponibile 0 → imposta 0; reddito molto alto → aliquota marginale massima.

## 7. Rischi

- **Normativa in movimento** (AVD, Basiszins, Box 3): file di parametri datati, `verified`, avvisi in UI.
- **Complessità di due contenitori**: si parte con un unico flusso (decisione 3).
- **Troppa precisione apparente**: restare "semplificato", con disclaimer; niente Kirchensteuer di fatto per stati federali diversi, niente Krankenversicherung sulle pensioni, niente Freistellungsauftrag tra più banche (da dichiarare tra le esclusioni).
