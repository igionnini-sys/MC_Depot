# Ipotesi per asset class e dati storici

I valori predefiniti sono **ipotesi prudenti di pianificazione**, espresse in
EUR nominali prima di TER e imposte. Le medie non sono la media automatica degli
ultimi anni. Rendimenti storici e previsioni degli analisti servono a scegliere
ipotesi plausibili; non garantiscono i risultati futuri.

| Asset e riferimento | Media annua aritmetica | Volatilità annua | Limiti annui del modello |
|---|---:|---:|---:|
| Azioni: MSCI World Net EUR, mercati sviluppati | 7,0% | 16,0% | −45% / +50% |
| Bond: Bloomberg Euro Aggregate, investment grade | 3,2% | 6,3% | −20% / +20% |
| Oro: prezzo spot in EUR | 5,0% | 16,0% | −40% / +65% |
| Immobiliare europeo quotato: FTSE EPRA/Nareit Developed Europe | 4,5% | 23,0% | −55% / +55% |
| Materie prime: S&P GSCI Total Return in EUR | 2,5% | 24,0% | −50% / +60% |
| Liquidità: tassi overnight EUR | 1,5% | 1,5% | −1% / +6% |

La media è aritmetica: il rendimento annuo **composto** tipico su 20 anni è
inferiore per effetto della volatilità. Per le azioni, 7% di media e 16% di
volatilità corrispondono indicativamente a un CAGR di circa 5,8% prima dei costi;
non significa che ogni traiettoria renda tale percentuale. Gli intervalli sono
scelte di modellazione, non minimi/massimi storici esatti o drawdown. Il motore
tronca i risultati a questi limiti, quindi non simula eventi più estremi.

## Ragioni delle ipotesi

- **Azioni.** Il [Matrix Book Dimensional](https://www.vuvb.nl/wp-content/uploads/matrix_book_eur_20151.pdf) mostra MSCI World total return in EUR nel 1970–2014; prima del 1999 l'euro è ricostruito. La [scheda MSCI World Net EUR](https://www.msci.com/documents/10199/255599/msci-world-index-eur-net.pdf) riporta un CAGR del 6,67% dal 29 dicembre 2000 al 30 settembre 2026 e una volatilità decennale del 13,44%, calcolata sui rendimenti mensili. Per un orizzonte molto più lungo l'[UBS Yearbook 2025](https://www.ubs.com/global/en/wealthmanagement/insights/2025/global-investment-returns-yearbook.html) confronta 125 anni di mercati e segnala un rendimento reale globale del 3,5% annuo dal 2000 al 2024: è un paniere e una misura diversi da MSCI World EUR. [Capital Group](https://www.capitalgroup.com/institutions/global-consultants/en/investments/capabilities/capital-market-assumptions.html) stima per il 2026 il 6,0% composto globale su 20 anni in USD; [State Street](https://www.ssga.com/us/en/intermediary/insights/long-term-asset-class-forecasts-q1-2026) indica MSCI World 6,5% e volatilità 14,8% su 10+ anni, in USD. Non sono previsioni EUR equivalenti. Il 7% aritmetico / 16% di volatilità è una scelta prudente, non una conversione esatta di tali stime. MSCI World comprende mercati sviluppati, non gli emergenti.
- **Obbligazioni.** Il [Bloomberg Euro Aggregate](https://data.bloomberglp.com/professional/sites/27/Euro-Aggregate-Index.pdf) include titoli a tasso fisso in EUR investment grade: governativi, assimilati, societari e cartolarizzati. La denominazione è in euro, anche se gli emittenti possono essere extra-UE. Nelle serie 2008–2024 la volatilità campionaria annua è circa 6,35% e il 2022 è −17,17%; la media storica di quel periodo è circa 2,84%. [J.P. Morgan](https://am.jpmorgan.com/content/dam/jpm-am-aem/global/en/insights/market-insights/guide-to-the-markets/mi-guide-to-the-markets-ce-en.pdf) indica, in EUR per 10–15 anni, 3,4% composto per governativi euro e 4,0% per corporate investment grade; [State Street](https://www.ssga.com/us/en/intermediary/insights/long-term-asset-class-forecasts-q1-2026) indica circa 3,1% per entrambe su 10+ anni. Il 3,2% aritmetico è una scelta cauta per il mix.
- **Oro.** Il [World Gold Council](https://www.gold.org/goldhub/research/golds-long-term-expected-returns/building-block-approach) analizza il 1971–2023 e stima circa 5,2% annuo per il 2025–2040 con un proprio modello in **USD**. Non è una previsione in euro e dipende dalle ipotesi di crescita; non va immessa direttamente come media aritmetica EUR. Usiamo 5% aritmetico / 16% di volatilità e limiti più ampi, comprendendo ad esempio il +46,6% in EUR nel 2025 riportato da [Goldprice.org](https://goldprice.org/?lang=pt). L'oro non distribuisce cedole.
- **Immobiliare quotato europeo.** Il [FTSE EPRA/Nareit Developed Europe](https://www.amundi.fr/fr_part/dl/doc/prospectus/LU1681045370/ENG/FRA) comprende REIT **e altre società immobiliari quotate**, anche di Regno Unito e Svizzera; quindi non è limitato all'area euro né ai soli REIT. Gli indici in EUR incorporano il cambio. Il 2008 fu circa −48,59% per il [total return gross FTSE](https://research.ftserussell.com/products/downloads/FTSE-EPRA-NAREIT-Developed-Europe.pdf); nel 2022 il benchmark net [DWS](https://etf.dws.com/en-gb/AssetDownload/Index/33f44f2a-4742-4953-a9a2-697f1f3b9d1e/DWS-UKKIID-LU0489337690-GB-en-2025-11-10.pdf) perse il 37%. La volatilità campionaria annua sul periodo comune è circa 23,34%. Il 4,5% aritmetico è una scelta prudente, inferiore all'ipotesi per l'oro. Il [6,7% J.P. Morgan per REIT europei](https://bcapital.partners/wp-content/uploads/2025/10/JP-Morgan-2026-Long-Term-Capital-Market-Assumptions.pdf) è in USD, non direttamente confrontabile con il nostro EUR.
- **Materie prime e liquidità.** Il GSCI rappresenta futures e collaterale, non prezzi spot. Il 2,5% aritmetico è una scelta prudente, non il rendimento osservato nel solo intervallo comune. Per la liquidità si usa un proxy overnight EUR con media 1,5%, inferiore alla stima composta del 2,3% per EUR cash nella guida J.P. Morgan citata sopra; i tassi non sono quelli garantiti da un conto deposito.

## Serie comuni e correlazioni

La matrice delle correlazioni predefinita usa i **17 rendimenti annui 2008–2024**
nel dataset locale [historical_returns.json](../src/config/historical_returns.json).
La finestra comune è più breve degli studi sulle medie: è il periodo per cui
abbiamo trovato serie annuali comparabili delle sei classi, includendo il 2008
e il 2022. Le correlazioni sono stime incerte su un campione piccolo; gli altri
scenari di correlazione sono ipotetici. I due asset personali usano zero come
segnaposto. Il taglio dei rendimenti modifica leggermente le correlazioni effettive.

Le serie sono ricostruite così:

- MSCI World Net EUR 2012–2024 dalla scheda MSCI; 2008–2011 dai [rendimenti MSCI Net USD pubblicati da Investing in the Web](https://investingintheweb.com/blog/msci-world-index-historical-data/) convertiti in EUR al cambio BCE di fine anno.
- Bloomberg Euro Aggregate 2008–2023 dalla [tabella annuale](https://www.mejudice.nl/docs/default-source/download/bijlage-16f68dc800cab62c08a14ff000058593c.pdfcc3be7c_0), 2024 dal benchmark nella [scheda BlackRock](https://www.ishares.com/uk/professional/en/literature/kiid/ucits_kiid-ishares-euro-aggregate-bond-index-a2-eur-gb-lu0836513423-en.pdf?siteEntryPassthrough=true&switchLocale=y). La tabella è una fonte secondaria; i valori sono arrotondati.
- FTSE Developed Europe: 2008–2014 total return **gross** dal prospetto FTSE citato sopra, 2015–2024 total return **net** dalla scheda DWS. Le convenzioni fiscali sui dividendi differiscono: la concatenazione è un'approssimazione per le correlazioni, non una serie omogenea di performance netta.
- Oro dalla [serie NYU](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html), in USD; GSCI dalle fonti JPMorgan, ETF Report e MarketScreener indicate nel JSON. USD convertiti usando il [cambio BCE annuale di fine anno](https://data-api.ecb.europa.eu/service/data/EXR/A.USD.EUR.SP00.E?startPeriod=2004&endPeriod=2024&format=csvdata): `rEUR = (1+rUSD) × FX_precedente / FX_corrente − 1`.
- Cash: [EONIA](https://data-api.ecb.europa.eu/service/data/EON/D.EONIA_TO.RATE?startPeriod=2004-12-30&endPeriod=2021-12-31&format=csvdata) fino al 2021 e [ESTR](https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT?startPeriod=2022-01-01&endPeriod=2024-12-31&format=csvdata) dal 2022, capitalizzazione giornaliera ACT/360, ultimo tasso nei festivi.

Le serie azionarie e immobiliari **net** includono dividendi dopo la ritenuta
convenzionale dell'indice, ma prima del TER del fondo e delle imposte personali.
Il TER applicativo viene sottratto una sola volta; non è stato modificato.

## Modello, migrazione e verifica

Il motore usa una normale censurata, non un bootstrap degli anni effettivi.
`fitCensoredNormal` adatta la normale sottostante affinché media e volatilità
immesse siano rispettate dopo il taglio ai limiti. I rendimenti assumono anni
indipendenti nel tempo; non riproducono interamente code, asimmetria o regimi
storici. Combinazioni personalizzate impossibili con quei limiti mantengono il
precedente comportamento di taglio e possono non rispettare i momenti indicati.

Gli stati salvati che coincidono con i precedenti default vengono migrati ai
nuovi valori, preservando TER e allocazioni. Gli asset personalizzati e la scelta
sulle correlazioni restano invariati. **Carica profilo** applica i nuovi default
ma ricarica anche le allocazioni e i TER del profilo selezionato.

`npm run calibration:check` controlla la coerenza tra ipotesi in
`src/config/planning_assumptions.json`, serie e configurazione, e lancia i test
dedicati. `node scripts/calibrate-assets.mjs` rigenera la configurazione senza
modificare TER e allocazioni. La suite verifica per ogni classe 1.000 rendimenti
annui e 1.000 traiettorie ventennali, oltre a correlazioni, conversioni e
migrazione. Per evitare contesa nel test di prestazione da 500 ms, i file di test
sono eseguiti in sequenza.
