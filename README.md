# E C O — un .io nel buio

> **Non vedi il mondo. Lo ricostruisci a impulsi e lo insegui mentre si muove.**

Un gioco stile *.io* in cui il mondo esiste solo quando lo interroghi con l'**eco**.
Sei un blob luminoso in una nave spaziale al buio: ti muovi sempre, controlli solo la
direzione, e ogni informazione ti arriva **in ritardo** e **mai precisa al 100%**.

## ▶️ Come si gioca

Apri `index.html` in un browser (o servi la cartella con `python3 -m http.server` /
attiva GitHub Pages sul repo — non serve alcuna build, zero dipendenze).

| Input | Azione |
|---|---|
| **Mouse** | direzione (il blob non si ferma mai) |
| **SPAZIO** (tieni premuto) | eco direzionale a cono |
| **CLICK** | attacco frontale a corto raggio |

Su mobile: trascina per dirigere, pulsanti **ECO** / **ATK**.

---

## 🧠 Identità del gioco

Non è un gioco di visione, precisione o reflex. È un gioco di:
**percezione incompleta · interpretazione del suono · decisioni nel buio · predizione del movimento altrui.**

- L'eco viaggia a velocità finita: il ritorno arriva dopo `2·distanza/velocità` → giochi sempre con informazioni **vecchie**.
- Usare l'eco **ti espone**: il bagliore si vede, il ping si sente anche fuori dal cono.
- La minimappa è un **radar**: aree sfumate ("qualcuno è stato qui"), mai punti precisi.
- Se un'eco nemica ti tocca: bordi rossi, vibrazione, radar che si tinge — sai solo che **sei stato percepito**, non da chi né da dove.
- **Eco Power** (kill + energia) fa crescere *tutto insieme*: raggio, durata, chiarezza e colore dell'onda — 🟢 verde → 🔵 blu → 🟣 viola. Il colore comunica la forza. Ma più sei forte, più sei percepibile.
- I **bot** non barano: percepiscono solo tramite il proprio eco, i suoni e la vista ravvicinata — le stesse informazioni parziali del giocatore. Cacciano con predizione dell'intercetta, tendono agguati, scappano dai più forti, accorrono alle esplosioni per rubare energia, e ognuno ha riflessi, mira e indole diversi.

---

## 📋 Piano di costruzione (per punti)

Il piano seguito per costruire il gioco, pensato per essere **veloce, ottimizzato e moderno**.

### Fase 0 — Visione e vincoli
1. Pilastri: buio vivo, informazione ritardata, rischio/esposizione, un solo valore di progressione (Eco Power).
2. Stack: **HTML5 Canvas 2D puro, zero dipendenze, zero build** → carica ovunque in <1s, gira su GitHub Pages.
3. Budget prestazioni: 60 FPS su hardware modesto → spatial hash, culling, cap su particelle/reveal, DPR limitato a 1.6.

### Fase 1 — Fondamenta tecniche
4. Game loop `requestAnimationFrame` con `dt` clampato (nessuna esplosione di fisica se il tab si sospende).
5. Camera con inseguimento morbido, anticipo nella direzione di marcia, shake e zoom-pulse sugli eventi.
6. Scheduler di eventi ritardati (`sched`) — la spina dorsale di *tutti* i ritorni eco.

### Fase 2 — Mondo (nave spaziale)
7. Mappa 4200×4200 generata proceduralmente: griglia di stanze 600px, porte casuali, 3 hangar 2×2, pilastri e container.
8. Garanzia di connettività: ogni cella ha ≥2 lati attraversabili (niente stanze-prigione).
9. Muri come rettangoli AABB in uno **spatial hash** → raycast DDA O(celle attraversate), collisioni cerchio-muro con scivolamento.
10. Energia ambientale (motes) sparsa negli spazi aperti, con respawn.

### Fase 3 — Player e movimento
11. Blob sempre in movimento, velocità lenta e costante, si controlla **solo la direzione** (turn-rate limitato: niente scatti).
12. Un'unica classe `Blob` per player e bot: **stesse regole per tutti**.

### Fase 4 — Sistema ECO (core)
13. Tieni premuto SPAZIO → impulsi ripetuti; ogni impulso campiona 44 raggi in un **cono direzionale**.
14. Ogni raggio che colpisce un muro genera un *reveal* mostrato al tempo `t + 2d/v` → l'ambiente si forma **in ritardo, da vicino a lontano**.
15. Player nel cono: l'onda li tocca a `t + d/v` (loro percepiscono il pericolo), il ritorno arriva a te a `t + 2d/v` con la **posizione di quando l'onda li ha toccati** — già vecchia — più un errore che cala con l'Eco Power.
16. Fuga sonora: ogni ping si sente fino a 1.7× il raggio, anche fuori dal cono → usare l'eco è sempre un rischio.
17. Batteria eco: impulsi costano, ricarica costante → niente spam, decisioni.

### Fase 5 — Percezione e feedback
18. Minimappa **radar**: spazzata rotante, aree sfumate a scomparsa, tacca centrale solo per il tuo orientamento, tinta rossa sul pericolo.
19. Ghost dei ritorni: sagome sfocate color-tier che svaniscono — mai un bersaglio preciso.
20. Audio 100% sintetizzato (WebAudio, zero asset): ping, ritorno-muro, ritorno-player bitonale, ping altrui col pan stereo direzionale, pericolo, hum ambientale della nave.
21. Vibrazione (dove supportata) + screen shake + flash rossi.

### Fase 6 — Combattimento ed energia
22. Attacco frontale a corto raggio con windup: se manchi → **scia visiva nel vuoto** (ti esponi); se colpisci → compressione del blob, knockback, danno.
23. Kill → esplosione in **frammenti organici luminosi** (non pallini) che si spargono, con magnete di raccolta.
24. Il botto si sente lontano: i bot accorrono da avvoltoi → risse per l'energia.
25. Progressione: `EcoPower = f(xp)` con curva dolce; HP, danno, raggio, cono, durata reveal e chiarezza scalano da quel solo valore.

### Fase 7 — Bot che sanno giocare
26. **Percezione onesta**: memoria di contatti alimentata solo da eco proprio, ping sentiti, rumori d'attacco, esplosioni e vista ravvicinata (~190px, come il player).
27. Stima della velocità altrui da rilevamenti successivi → **inseguimento con intercetta predittiva**, re-ping per riagganciare il bersaglio (facendosi sentire…).
28. Stati: esplora / raccogli energia / investiga / caccia / fuggi — scelti confrontando la forza percepita (dal ritorno eco) con la propria e con gli HP.
29. Profilo "umano" per bot: tempo di reazione 160–400ms, errore di mira, aggressività, prudenza, disciplina nell'uso dell'eco (in fuga stanno **zitti**).
30. Navigazione: 3 whisker raycast per evitare i muri, repulsione dai bordi mappa, serpeggiamento in fuga.
31. Respawn a popolazione costante: il server sembra sempre vivo.

### Fase 8 — UI / UX
32. Schermata iniziale: nome, 4 skin animate (**Neon / Glitch / Slime / Void**), START; preferenze salvate in `localStorage`.
33. HUD essenziale: kill counter + vita in alto a sinistra, classifica top-8, un solo indicatore in basso — la barra ECO spessa il cui colore comunica l'Eco Power — toast per kill e potenziamenti, etichetta "settore 7806".
34. Schermata morte: chi ti ha assorbito, kill/energia/tempo, RIENTRA o MENU.
35. Dietro il menu la simulazione gira già in modalità spettatore: il mondo è vivo prima ancora di entrare.

### Fase 9 — Estetica moderna e ottimizzazione
36. Buio stratificato: vignetta, polvere in parallasse a 2 livelli, e una **bolla di luce piena e sfumata** che parte dal corpo del blob — dentro vedi davvero l'ambiente (pannelli del pavimento con decal, prese d'aria, frecce, griglia, pareti pseudo-3D con neon alla base, strisce guida luminose), fuori resta il buio da interrogare con l'eco.
37. Glow additivo (`lighter`) per eco, energia, esplosioni; blob "wobble" 3D con occhio unico, ombra di contatto sul pavimento, speculare e ombreggiatura in coordinate mondo, squash & stretch su attacco e colpo, dettagli per skin (glitch-slice, goccioline, stelle interne); pareti con estrusione prospettica che si inclina rispetto all'osservatore.
38. Ottimizzazioni: culling a viewport su tutto, cap (reveal 1600, particelle 700, frammenti 460), un solo canvas di gioco + minimappa separata, nessuna allocazione calda nei raycast (stamp invece di Set).
39. Verifica: 13 bot + player, echi multipli e combattimenti → **~61 FPS stabili** in headless Chromium, zero errori JS.

### Fase 10 — Roadmap multiplayer reale (prossimo passo)
40. Server autoritativo Node + WebSocket: il server simula mondo/eco/combattimento, i client inviano solo direzione+input.
41. Interest management naturale: il server invia a ogni client **solo ciò che il suo eco ha rivelato** → anti-cheat gratis (il client non conosce ciò che non ha percepito).
42. I bot attuali girano sul server come riempitivo dei lobby; matchmaking a stanze ("settori").

---

## 🗂️ Architettura

```
index.html          struttura + HUD + menu
css/style.css       UI neon dark
js/config.js        costanti, skin, stato globale
js/utils.js         math, RNG deterministico, vibrazione
js/audio.js         sintesi WebAudio (nessun asset)
js/world.js         generazione nave, spatial hash, raycast DDA, collisioni
js/echo.js          onde, ritorni ritardati, reveal, fuga sonora
js/entities.js      Blob (player+bot), combattimento, frammenti, particelle
js/ai.js            cervello bot: contatti, predizione, stati
js/minimap.js       radar
js/render.js        buio vivo, glow additivo, pseudo-3D, skin
js/ui.js            menu, HUD, morte, toast
js/main.js          boot, input, game loop, camera
```
