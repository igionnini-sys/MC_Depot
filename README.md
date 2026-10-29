# MC_Depot — FinRet

Simulatore Monte Carlo per la pianificazione pensionistica con fiscalità multi-paese, realizzato come Progressive Web App (Windows, Linux, Android). Evoluzione dell'app Streamlit originale in `oldCode/`.

Lo stato completo dei lavori e le scelte architetturali sono documentati in [PROGRESS.md](PROGRESS.md) e [NEXT_STEPS.md](NEXT_STEPS.md).

## Caratteristiche principali

- **Motore Monte Carlo veloce (Web Worker)**: 10.000 simulazioni in ~300 ms, con asset indipendenti o correlati (fattorizzazione Cholesky / riparazione automatica PSD).
- **Modello coerente in euro nominali e potere d'acquisto reale**: versamenti e prelievi reali/nominali, più opzione per indicizzare all'inflazione i limiti fiscali fissi (`indexTaxLimitsToInflation`).
- **Architettura fiscale plug-in (`src/tax/`)** con parametri normativi datati in JSON (`src/tax/params/*.json`):
  - **Semplificato (`simplified`)**: aliquota unica sul capital gain con contabilità a lotti (parità bit-a-bit con il motore storico).
  - **Germania (`de`)**: Deposito ordinario (*Abgeltungsteuer* + *Soli* + *Kirchensteuer*, *Sparer-Pauschbetrag*, *Teilfreistellung* per categoria di fondo, *Vorabpauschale* annua sui fondi ed esenzione ETC, compensazione perdite) + *Altersvorsorgedepot* 2027 (accumulo esente fino al tetto con *Grundzulage*, *Kinderzulage*, *Günstigerprüfung* e decumulo con tariffa progressiva § 32a EStG e inversione analitica $O(1)$ per il gross-up).
  - **Italia (`it`)**: Conto titoli in regime amministrato (imposta sostitutiva 26% sulle plusvalenze, compensazione minusvalenze, imposta di bollo 0,20% annuo) + Fondo Pensione Complementare D.Lgs. 252/2005 (deducibilità IRPEF fino a 5.164,57 €/anno e tassazione agevolata in decumulo dal 15% al 9%).
  - **Paesi Bassi (`nl`)**: *Box 3* (*Overbruggingswet box 3*, franchigia *heffingsvrij vermogen* singolo/coppia, rendimenti forfettari differenziati tra liquidità `Cash` e altri investimenti, aliquota 36% annua, prelievi esenti da capital gain alla vendita).
- **Bilingue (IT/EN)**, tema chiaro/scuro/sistema e funzionamento offline (PWA).

## Calibrazione delle asset class

I default delle asset class sono ipotesi prudenti in EUR per un investitore europeo,
confrontate con dati storici di lungo periodo e ricerche, e verificate su 1.000
simulazioni. Media aritmetica, volatilità annua e CAGR sono distinti; i TER sono invariati.
Fonti, limiti e istruzioni di verifica: [calibrazione storica](docs/calibrazione-asset.md).

## Requisiti

Node.js 18 o superiore.

## Comandi

Su Linux/macOS puoi usare direttamente lo script `./avvia-app.sh` (che carica automaticamente `nvm` se presente):

```bash
./avvia-app.sh          # avvia il server di sviluppo (http://localhost:5173)
./avvia-app.sh test     # esegue la suite di test Vitest
./avvia-app.sh build    # esegue type-check TypeScript e build di produzione in dist/
./avvia-app.sh preview  # serve la build di produzione (PWA con service worker)
```

Oppure con `npm`:

```bash
npm install        # dipendenze
npm run dev        # sviluppo su http://localhost:5173
npm test           # test del motore di simulazione e dei moduli fiscali
npm run build      # build di produzione in dist/
npm run preview    # serve la build (PWA con service worker attivo)
npm run icons      # rigenera le icone PNG da scripts/gen-icons.mjs
```

Su Windows è disponibile `avvia-app.bat`.

## Installazione come app

Pubblica `dist/` su un hosting HTTPS statico (o usa `npm run preview` in locale), apri la pagina con Chrome/Edge e scegli **Installa app** (desktop) o **Aggiungi a schermata Home** (Android). L'app funziona anche offline.

> **Disclaimer**: Strumento a solo scopo educativo e informativo. Non costituisce consulenza finanziaria, patrimoniale o fiscale. I parametri normativi marcati `verified: false` (es. riforma tedesca Altersvorsorgedepot 2027 ed evoluzione futura del Box 3 olandese) si basano su bozze legislative o regimi transitori soggetti a modifiche.
