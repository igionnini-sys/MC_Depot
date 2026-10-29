# FinRet — Avanzamento del progetto

> File di avanzamento separato. Aggiornarlo a ogni passo (stato, decisioni, problemi aperti).
> Ultimo aggiornamento: **2026-10-29**

## Obiettivo

Convertire l'app Streamlit `oldCode/CPTMC/CPTMC-main` (simulatore Monte Carlo per la
pianificazione pensionistica) in un'app moderna per **Windows, Linux e Android**,
mantenendo inizialmente **le stesse funzionalità** con un'interfaccia nuova.

## Scelte tecniche

| Tema | Scelta | Motivo |
|---|---|---|
| Piattaforma | **PWA** (React 18 + TypeScript + Vite 5) | Un solo codice; installabile da browser su Android, Windows e Linux; funziona offline. In seguito impacchettabile come app nativa (vedi Fase 3). |
| Calcolo | Motore TypeScript in un **Web Worker** | L'interfaccia resta fluida; 10.000 simulazioni in ~150 ms (Python: diversi secondi). |
| Grafici | **ECharts 5** (import selettivi) | Copre tutti i grafici Plotly originali (istogrammi, scatter, heatmap, box plot, torta, barre), tema chiaro/scuro. |
| Stato | `useReducer` + `localStorage` | Sostituisce `st.session_state`; parametri e portafogli restano salvati tra una sessione e l'altra. |
| i18n | Dizionario IT/EN in `src/i18n` | Porting di `translations.py` + tutte le stringhe che erano inline nel codice Streamlit. |
| Test | Vitest | Test del motore (statistiche, RNG, tasse, simulazione). |

## Stato

### Fase 1 — Conversione con parità funzionale ✅ (completata)

- [x] Analisi del codice originale (STRM.py e moduli importati)
- [x] Struttura progetto (Vite + React + TS), build e type-check puliti
- [x] Configurazione: profili, caratteristiche asset, scenari di correlazione (`src/config/enhanced_config.json`, copia di quello originale)
- [x] Motore Monte Carlo indipendente (port di `simulation_engine.py`)
- [x] Motore con asset correlati (port di `correlation_engine.py`, Cholesky / riparazione matrice non PSD)
- [x] Motore fiscale a lotti (port di `tax_engine.py`)
- [x] Statistiche: percentili (stessa interpolazione di numpy), VaR/CVaR, CAGR, probabilità di perdita
- [x] Parametri generali, prelievo reale/nominale, aliquota capital gain, numero simulazioni
- [x] Correlazione: attivazione, scelta scenario, finestra "Impostazioni avanzate" (heatmap matrice, statistiche, spiegazione)
- [x] Portafoglio: profili, stesso portafoglio per le due fasi, editor asset (allocazione, TER, rendimento, volatilità, min/max), azzera/bilancia, stato allocazione, grafico a ciambella e riepilogo
- [x] Validazione input prima della simulazione
- [x] Risultati: metriche chiave, info prelievo, analisi prelievi, analisi fiscale, statistiche dettagliate (3 schede), grafici distribuzione/correlazione/confronto, analisi rischio VaR/CVaR, probabilità di perdita, messaggio finale
- [x] Disclaimer, footer, lingua IT/EN, tema chiaro/scuro/sistema
- [x] Layout responsive: desktop a due colonne; mobile con barra di navigazione in basso (Parametri / Portafoglio / Risultati)
- [x] PWA: manifest, service worker (offline), icone PNG/SVG
- [x] Test unitari del motore (10/10 verdi)
- [x] Verifica di parità con il motore Python originale (vedi sotto)
- [x] Verifica visiva su desktop e mobile (Edge headless), nessun errore in console

#### Verifica di parità (profilo Moderato, 40+25 anni, 6.000 €/anno, prelievo reale 12.000 €, 5.000 simulazioni)

| Metrica | Python originale | FinRet | 
|---|---|---|
| Tasso di successo (indip.) | 78,1% | 78,3% |
| Mediana accumulo nominale | 1.068.144 € | 1.060.525 € |
| Mediana accumulo reale | 397.809 € | 394.972 € |
| Mediana valore finale | 515.566 € | 501.269 € |
| VaR 5% accumulo nominale | 612.517 € | 621.374 € |
| Tasso di successo (correlato) | 79,5% | 78,9% |

Le differenze sono nel rumore Monte Carlo (semi casuali diversi).

### Fase 2 — Revisione del modello ✅ (punti 1–3 risolti nel Passo 0 della Fase 4)

Anomalie del modello originale corrette nel Passo 0:

1. [x] **Doppio conteggio dell'inflazione in pensione.** Risolto: il portafoglio cresce con il rendimento *nominale* anche durante il pensionamento, e il valore finale è in euro nominali coerenti (deflazionato una sola volta nella vista "Valori finali reali").
2. [x] **Rendimento reale diverso tra i due motori**: risolto (entrambi i motori usano il rendimento nominale nel ciclo annuale).
3. [x] **"Efficacia prelievo"**: risolto (con prelievo reale, il prelievo netto annuo è deflazionato all'anno del prelievo per essere confrontato omogeneamente con l'importo desiderato in potere d'acquisto di oggi).
4. [ ] Analisi del rischio e probabilità di perdita calcolate sull'accumulo **nominale** contro il totale depositato (nominale): con orizzonti lunghi la probabilità di perdita è quasi sempre ~0%.

### Fase 3 — Pacchetti nativi ⏳

- [ ] Desktop Windows/Linux: wrapper **Tauri 2** (eseguibile leggero, .msi/.AppImage/.deb) — in alternativa Electron
- [ ] Android: wrapper **Capacitor** (APK/AAB) oppure TWA (Trusted Web Activity) partendo dalla PWA
- [ ] Hosting statico della PWA (GitHub Pages / Netlify) per installazione diretta da browser

### Fase 4 — Fiscalità multi-paese (Germania → Italia → Paesi Bassi) ✅ (completata)

Piano: [docs/piano-fiscalita-multipaese.md](docs/piano-fiscalita-multipaese.md) · Prompt AI: [docs/prompt-fiscalita-multipaese.md](docs/prompt-fiscalita-multipaese.md)

- [x] Decisioni dell'utente salvate in [NEXT_STEPS.md](NEXT_STEPS.md) (2026-10-29): nominale e reale entrambi attivi, prelievo netto, versamento totale con ripartizione automatica/manuale AVD, nuovi input personali
- [x] Confermata interpretazione "nominale/reale" e Teilfreistellung di default per asset
- [x] Passo 0 — Modello coerente in euro nominali + `taxLimitFactor` per l'indicizzazione opzionale dei limiti fiscali (risolve Fase 2, punti 1–3)
- [x] Passo 1 — Struttura `src/tax/`, regime `simplified` identico all'attuale, selettore paese, nuovi input personali e di ripartizione versamenti, stato salvato `finret.state.v2` con migrazione da `v1`
- [x] Passo 2 — Germania: deposito ordinario (Abgeltungsteuer, Soli/KiSt, Sparer-Pauschbetrag, Teilfreistellung, Vorabpauschale, gross-up)
- [x] Passo 3 — Germania: Altersvorsorgedepot 2027 (Zulage, Günstigerprüfung, decumulo con tariffa progressiva)
- [x] Passo 4 — Interfaccia e risultati fiscali per paese/contenitore (confronto AVD vs Deposito ordinario, Zulagen, Günstigerprüfung, avviso `verified: false`, traduzioni IT/EN)
- [x] Passo 5 — Italia (`src/tax/params/it.json`, `src/tax/it/index.ts`, imposta sostitutiva 26%, bollo 0,20% annuo, fondo pensione con deducibilità fino a 5.164,57 € e decumulo agevolato 15% → 9%)
- [x] Passo 6 — Paesi Bassi (`src/tax/params/nl.json`, `src/tax/nl/index.ts`, Box 3: tassazione annuale sul rendimento forfettario differenziato tra liquidità e investimenti, franchigia singolo/coppia, prelievi esenti in pensione)
- [x] Passo 7 — Chiusura: disclaimer fiscali multi-paese in UI (`App.tsx` / `translations.ts`), documentazione aggiornata (`README.md`, `PROGRESS.md`, `NEXT_STEPS.md`)

Attenzione: i parametri dell'Altersvorsorgedepot 2027 provengono dalle note dell'utente e vanno **verificati sul testo di legge definitivo** (`verified: false` finché non confermati).

### Idee per il futuro (non presenti nell'originale)

- Editor della matrice di correlazione personalizzata (esisteva nel codice originale ma non era collegato all'interfaccia)
- Esportazione risultati (CSV/PDF) e salvataggio di più scenari da confrontare
- Grafico a ventaglio dell'evoluzione del portafoglio anno per anno (percentili)
- Seme casuale impostabile per risultati riproducibili

## Differenze rispetto all'originale

**Bug corretti** (erano chiaramente errori, non scelte di modello):

- `calculate_total_deposited` riceveva l'inflazione già divisa per 100 e la divideva di nuovo → il totale depositato quasi non cresceva con l'inflazione. Ora è corretto (influisce su CAGR, moltiplicatore e probabilità di perdita).
- L'aliquota effettiva media non veniva mai mostrata (`hasattr(results, 'get_tax_analysis')` su un dict era sempre falso). Ora viene mostrata insieme alle tasse totali medie.
- Lo scenario di correlazione scelto nella barra laterale non arrivava al simulatore (veniva sempre usata la matrice di default). Ora lo scenario scelto viene usato davvero.
- Euristica `inflation_rate / 100 if inflation_rate > 1 else inflation_rate` rimossa (con inflazione < 1% trattava 0,5 come 50%).

**Non portato** (non usato dall'app originale o solo informativo):

- `risk_metrics.py` e `risk_ui_components` (non importati da `STRM.py`)
- Banner "Nuove funzionalità" in cima alla pagina
- Editor manuale della matrice di correlazione ed export/import JSON delle correlazioni (presenti nel codice ma non raggiungibili dall'interfaccia)

**Cambiamenti di interfaccia**:

- Parametri avanzati degli asset modificabili direttamente nel pannello espandibile (niente pulsante "Modifica parametri").
- Con portafogli separati, le due fasi sono in schede (Accumulo/Pensione) con indicatore di validità.
- Simulazione annullabile durante l'esecuzione.

## Struttura

```
FinRet/
├── PROGRESS.md            ← questo file
├── README.md
├── index.html
├── public/                manifest, service worker, icone
├── scripts/gen-icons.mjs  generatore icone PNG
├── src/
│   ├── config/            profili e scenari (enhanced_config.json)
│   ├── engine/            motore Monte Carlo, tasse base, statistiche, worker, test
│   ├── tax/               architettura fiscale plug-in (de, it, nl, params/*.json, grossUp, progressive)
│   ├── i18n/              traduzioni IT/EN
│   ├── state/             stato app (v2 con migrazione) + hook simulazione
│   ├── components/        pannelli, grafici, primitive UI
│   ├── App.tsx            shell dell'app
│   └── styles.css         design token chiaro/scuro e layout
└── oldCode/               app Streamlit originale (solo riferimento)
```

## Registro

- **2026-10-29** — Fase 1 completata: conversione completa a PWA React/TS, parità numerica verificata contro il motore Python, test verdi, verifica visiva desktop/mobile.
- **2026-10-29** — Creati il piano di lavoro e il prompt AI per la fiscalità multi-paese (Fase 4); nessun codice ancora modificato. Aggiunto `avvia-app.bat` per l'avvio rapido.
- **2026-10-29** — Fase 4, Passo 0 completato: motore interno coerente in euro nominali (risolti i punti 1, 2 e 3 della Fase 2), aggiunta funzione `taxLimitFactor` e opzioni `indexTaxLimitsToInflation` / `taxLimitsInflationRate` in `SimulationParams`, aggiunti test deterministici su decumulo e indicizzazione limiti.
- **2026-10-29** — Fase 4, Passo 1 completato: struttura plug-in `src/tax/` (`types.ts`, `registry.ts`, stub `de`, `it`, `nl`), regime `simplified` bit-a-bit identico a parità di seme, nuovi input in UI (`ParametersPanel.tsx`) e traduzioni IT/EN, persistenza `finret.state.v2` con migrazione da `v1`, 14/14 test verdi e build pulita.
- **2026-10-29** — Fase 4, Passo 2 completato: deposito ordinario Germania (`src/tax/params/de.json`, `src/tax/grossUp.ts`, `src/tax/de/brokerage.ts`, `src/tax/de/brokerage.test.ts`), Abgeltungsteuer + Soli + Kirchensteuer, Sparer-Pauschbetrag, Teilfreistellung ponderata ed esenzione ETC (Gold/Commodities) da Vorabpauschale, tracciamento cumulativo Vorabpauschale lorda e deduzione alla vendita, compensazione perdite, gross-up (proporzionale e FIFO), 20/20 test verdi (< 420 ms per 10.000 simulazioni).
- **2026-10-29** — Fase 4, Passo 3 completato: Germania Altersvorsorgedepot 2027 (`src/tax/common/progressive.ts`, `src/tax/de/guenstigerpruefung.ts`, `src/tax/de/altersvorsorgedepot.ts`, `src/tax/de/altersvorsorgedepot.test.ts`), accumulo esente da tasse con Zulage (50% fino a 360 € + 25% fino a 1.800 € + 300 € per figlio) e Günstigerprüfung, ripartizione automatica/manuale con tetto 6.840 €, decumulo con età minima 65, quota forfettaria ≤ 30% e tariffa progressiva § 32a EStG con inversione analitica $O(1)$ (`grossUpGermanIncomeTax`), 25/25 test verdi (~313 ms per 10.000 simulazioni con entrambi i contenitori attivi).
- **2026-10-29** — Fase 4, Passo 4 completato: interfaccia e risultati fiscali per paese/contenitore (`ParametersPanel.tsx`, `ResultsView.tsx`, `src/engine/types.ts`, `src/engine/simulation.ts`, `translations.ts`), tabella di confronto AVD vs Deposito ordinario (tasse medie, valore finale mediano e medio), riepilogo Zulagen e rimborsi extra Günstigerprüfung, avviso `verified: false` per i parametri 2027 in bozza, spiegazione fiscale dettagliata IT/EN ed esclusioni dichiarate.
- **2026-10-29** — Fase 4, Passo 5 completato: modulo fiscale Italia (`src/tax/params/it.json`, `src/tax/it/index.ts`, `src/tax/it/it.test.ts`), conto titoli ordinario (26% capital gain + bollo 0,20% annuo) e fondo pensione complementare D.Lgs. 252/2005 (deducibilità fino a 5.164,57 €/anno e tassazione agevolato decumulo 15% → 9%), attivato in UI e nei risultati (29/29 test verdi).
- **2026-10-29** — Fase 4, Passo 6 completato: modulo fiscale Paesi Bassi Box 3 (`src/tax/params/nl.json`, `src/tax/nl/index.ts`, `src/tax/nl/nl.test.ts`), tassazione annuale sul rendimento presunto differenziato per categoria di asset (`Cash` vs altri investimenti), franchigia `heffingsvrij vermogen` singolo/coppia indicizzabile, prelievi in pensione esenti da capital gain alla vendita, banner `verified: false` per la normativa Box 3 in evoluzione (34/34 test verdi).
- **2026-10-29** — Fase 4, Passo 7 completato (Fase 4 conclusa): aggiunti disclaimer fiscali multi-paese nella sezione Informazioni/Disclaimer (`App.tsx`, `translations.ts`), aggiornati `README.md`, `PROGRESS.md` e `NEXT_STEPS.md`.
