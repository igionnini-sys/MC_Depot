# Prossimi passi — da dove riprendere

Ultimo aggiornamento: **2026-10-29**. Stato: Fase 1 (conversione) completata; per la Fase 4 (fiscalità multi-paese) esistono solo piano e prompt. **Nessun codice fiscale è stato scritto.**

Documenti: [PROGRESS.md](PROGRESS.md) · [docs/piano-fiscalita-multipaese.md](docs/piano-fiscalita-multipaese.md) · [docs/prompt-fiscalita-multipaese.md](docs/prompt-fiscalita-multipaese.md)

## Decisioni prese dall'utente (2026-10-29)

1. **Nominale vs reale: restano attive entrambe le possibilità.** Non tutto in nominale: nel tempo i limiti fissi (franchigie, tetti, scaglioni) possono cambiare in relazione all'inflazione.
   - *Interpretazione da confermare:* il motore calcola internamente in modo coerente (euro nominali, per evitare il doppio conteggio dell'inflazione), mentre i **limiti fiscali** hanno un'opzione "fissi nominali" oppure "indicizzati all'inflazione" (con tasso configurabile). I risultati si possono vedere in euro nominali o in potere d'acquisto di oggi.
2. **Prelievo: si indica il netto desiderato**; il motore calcola il lordo (gross-up).
3. **Versamenti: l'utente indica il versamento totale annuo**, con due modalità:
   - **Automatico:** priorità all'Altersvorsorgedepot fino alla soglia (tetto da file parametri, 6.840 € da verificare); l'eccedenza va nel deposito ordinario.
   - **Manuale:** l'utente decide quanto allocare a AVD e quanto al deposito ordinario (con controllo del tetto).
4. **Aggiungere gli input mancanti:** età attuale, anno di partenza, singolo/coppia, Kirchensteuer (nessuna/8%/9%), numero di figli; più (dal piano §2.4) altri redditi in pensione e aliquota marginale in accumulo per la Günstigerprüfung.

## Da dove ripartire (ordine)

1. **Confermare l'interpretazione del punto 1** (una riga di risposta dell'utente).
2. **Passo 0** — motore coerente (nominale interno) + opzione di indicizzazione dei limiti fiscali; aggiornare i test e `PROGRESS.md` (risolve Fase 2, punti 1–2).
3. **Passo 1** — struttura `src/tax/`, regime `simplified` identico all'attuale, selettore paese, nuovi input (decisione 4) e modalità versamento (decisione 3), stato salvato v2 con migrazione.
4. **Passi 2–3** — Germania (deposito ordinario, poi Altersvorsorgedepot 2027), poi UI (Passo 4), Italia (5), Paesi Bassi (6), chiusura (7).

## Ancora aperto

- Verificare sul testo di legge definitivo i parametri dell'Altersvorsorgedepot 2027 e quelli annuali (Basiszins, tariffa ESt, bollo, Box 3): restano `verified: false` finché non confermati.
- Confermare il default della Teilfreistellung per asset (piano §2.6).
- Trattamento fiscale della quota forfettaria del 30% e base della deduzione nella Günstigerprüfung (da leggere nella norma).
