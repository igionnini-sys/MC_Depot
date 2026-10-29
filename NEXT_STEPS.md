# Prossimi passi — da dove riprendere

Ultimo aggiornamento: **2026-10-29**. Stato: Fase 1 completata; **Passi 0, 1, 2 e 3 della Fase 4 completati**. Prossimo passo: **Passo 4** (Interfaccia e risultati fiscali per paese/contenitore).

Documenti: [PROGRESS.md](PROGRESS.md) · [docs/piano-fiscalita-multipaese.md](docs/piano-fiscalita-multipaese.md) · [docs/prompt-fiscalita-multipaese.md](docs/prompt-fiscalita-multipaese.md)

## Decisioni prese dall'utente (2026-10-29)

1. **Nominale vs reale: restano attive entrambe le possibilità.** Non tutto in nominale: nel tempo i limiti fissi (franchigie, tetti, scaglioni) possono cambiare in relazione all'inflazione.
   - *Confermato e implementato nel Passo 0:* il motore calcola internamente in modo coerente in euro nominali (evitando il doppio conteggio dell'inflazione), mentre i **limiti fiscali** hanno l'opzione "fissi nominali" oppure "indicizzati all'inflazione" (`indexTaxLimitsToInflation`, `taxLimitsInflationRate`, funzione `taxLimitFactor`). I risultati si possono vedere in euro nominali o in potere d'acquisto di oggi.
2. **Prelievo: si indica il netto desiderato**; il motore calcola il lordo (gross-up).
3. **Versamenti: l'utente indica il versamento totale annuo**, con due modalità:
   - **Automatico:** priorità all'Altersvorsorgedepot fino alla soglia (tetto da file parametri, 6.840 € da verificare); l'eccedenza va nel deposito ordinario.
   - **Manuale:** l'utente decide quanto allocare a AVD e quanto al deposito ordinario (con controllo del tetto).
4. **Aggiungere gli input mancanti:** età attuale, anno di partenza, singolo/coppia, Kirchensteuer (nessuna/8%/9%), numero di figli; più (dal piano §2.4) altri redditi in pensione e aliquota marginale in accumulo per la Günstigerprüfung.

## Da dove ripartire (ordine)

1. [x] **Confermare l'interpretazione del punto 1** — confermata.
2. [x] **Passo 0** — motore coerente (nominale interno) + opzione di indicizzazione dei limiti fiscali; aggiornati i test e `PROGRESS.md` (risolve Fase 2, punti 1–3).
3. [x] **Passo 1** — struttura `src/tax/`, regime `simplified` identico all'attuale, selettore paese, nuovi input (decisione 4) e modalità versamento (decisione 3), stato salvato v2 con migrazione.
4. [x] **Passo 2** — Germania: deposito ordinario (`src/tax/params/de.json`, `src/tax/grossUp.ts`, `src/tax/de/brokerage.ts`, 20/20 test verdi).
5. [x] **Passo 3** — Germania: Altersvorsorgedepot 2027 (`src/tax/common/progressive.ts`, `src/tax/de/guenstigerpruefung.ts`, `src/tax/de/altersvorsorgedepot.ts`, 25/25 test verdi).
6. **Passo 4** *(prossimo)* — Interfaccia e risultati (`ParametersPanel.tsx`, `ResultsView.tsx`, `translations.ts`, dettaglio per contenitore AVD vs Deposito ordinario, Zulage e avviso `verified: false`), poi Italia (Passo 5), Paesi Bassi (Passo 6), chiusura (Passo 7).

## Ancora aperto

- Verificare sul testo di legge definitivo i parametri dell'Altersvorsorgedepot 2027 e quelli annuali (Basiszins, tariffa ESt, bollo, Box 3): restano `verified: false` finché non confermati.
- Confermare il default della Teilfreistellung per asset (piano §2.6).
- Trattamento fiscale della quota forfettaria del 30% e base della deduzione nella Günstigerprüfung (da leggere nella norma).
