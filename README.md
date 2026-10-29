# MC_Depot — FinRet

Simulatore Monte Carlo per la pianificazione pensionistica, come Progressive Web App
(Windows, Linux, Android). Conversione dell'app Streamlit in `oldCode/`.

Lo stato dei lavori è in [PROGRESS.md](PROGRESS.md).

## Requisiti

Node.js 18 o superiore.

## Comandi

```bash
npm install        # dipendenze
npm run dev        # sviluppo su http://localhost:5173
npm test           # test del motore di simulazione
npm run build      # build di produzione in dist/
npm run preview    # serve la build (PWA con service worker attivo)
npm run icons      # rigenera le icone PNG da scripts/gen-icons.mjs
```

## Installazione come app

Pubblica `dist/` su un hosting HTTPS statico (o usa `npm run preview` in locale), apri la pagina
con Chrome/Edge e scegli **Installa app** (desktop) o **Aggiungi a schermata Home** (Android).
L'app funziona anche offline.

> Strumento a solo scopo educativo: non costituisce consulenza finanziaria.
