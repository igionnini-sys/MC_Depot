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

### Fase 2 — Revisione del modello (da decidere con l'utente) ⏳

Anomalie del modello originale **mantenute volutamente** per avere parità di numeri; vanno decise prima di cambiarle:

1. **Doppio conteggio dell'inflazione in pensione.** Al pensionamento il saldo resta *nominale*, ma viene fatto crescere con il rendimento *reale* (nominale − inflazione), mentre i prelievi sono gonfiati *nominalmente* (`prelievo × (1+i)^(anni)`). L'inflazione pesa due volte → risultati pessimistici. Inoltre il "valore finale" è in unità miste e la vista "Valori finali reali" lo deflaziona di nuovo.
2. **Rendimento reale diverso tra i due motori**: indipendente usa `nominale − inflazione`, correlato usa la forma esatta `(1+n)/(1+i) − 1`.
3. **"Efficacia prelievo"** confronta il prelievo netto medio *nominale* con l'importo in euro *di oggi* → valori > 100% (es. 290%).
4. Analisi del rischio e probabilità di perdita calcolate sull'accumulo **nominale** contro il totale depositato (nominale): con orizzonti lunghi la probabilità di perdita è quasi sempre ~0%.

### Fase 3 — Pacchetti nativi ⏳

- [ ] Desktop Windows/Linux: wrapper **Tauri 2** (eseguibile leggero, .msi/.AppImage/.deb) — in alternativa Electron
- [ ] Android: wrapper **Capacitor** (APK/AAB) oppure TWA (Trusted Web Activity) partendo dalla PWA
- [ ] Hosting statico della PWA (GitHub Pages / Netlify) per installazione diretta da browser

### Fase 4 — Fiscalità multi-paese (Germania → Italia → Paesi Bassi) 📝 (pianificata)

Piano: [docs/piano-fiscalita-multipaese.md](docs/piano-fiscalita-multipaese.md) · Prompt AI: [docs/prompt-fiscalita-multipaese.md](docs/prompt-fiscalita-multipaese.md)

- [x] Decisioni dell'utente salvate in [NEXT_STEPS.md](NEXT_STEPS.md) (2026-10-29): nominale e reale entrambi attivi, prelievo netto, versamento totale con ripartizione automatica/manuale AVD, nuovi input personali
- [ ] Ancora da confermare: interpretazione del punto "nominale/reale", Teilfreistellung per asset, parametri normativi
- [ ] Passo 0 — Modello coerente in euro nominali (risolve Fase 2, punti 1–2)
- [ ] Passo 1 — Struttura `src/tax/`, regime `simplified` identico all'attuale, selettore paese, stato salvato v2
- [ ] Passo 2 — Germania: deposito ordinario (Abgeltungsteuer, Soli/KiSt, Sparer-Pauschbetrag, Teilfreistellung, Vorabpauschale, gross-up)
- [ ] Passo 3 — Germania: Altersvorsorgedepot 2027 (Zulage, Günstigerprüfung, decumulo con tariffa progressiva)
- [ ] Passo 4 — Interfaccia e risultati fiscali per paese/contenitore
- [ ] Passo 5 — Italia · [ ] Passo 6 — Paesi Bassi · [ ] Passo 7 — Chiusura e disclaimer

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
│   ├── engine/            motore Monte Carlo, tasse, statistiche, worker, test
│   ├── i18n/              traduzioni IT/EN
│   ├── state/             stato app + hook simulazione
│   ├── components/        pannelli, grafici, primitive UI
│   ├── App.tsx            shell dell'app
│   └── styles.css         design token chiaro/scuro e layout
└── oldCode/               app Streamlit originale (solo riferimento)
```

## Registro

- **2026-10-29** — Fase 1 completata: conversione completa a PWA React/TS, parità numerica verificata contro il motore Python, test verdi, verifica visiva desktop/mobile.
- **2026-10-29** — Creati il piano di lavoro e il prompt AI per la fiscalità multi-paese (Fase 4); nessun codice ancora modificato. Aggiunto `avvia-app.bat` per l'avvio rapido.
