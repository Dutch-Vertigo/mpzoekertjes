# mpzoekertjes
Marktplaats Script om in de browser te gebruiken op alle apparaten. met de extentie Tampermonkey.

# Zoekertjes-app – Marktplaats & 2dehands

Een userscript voor **marktplaats.nl** en **2dehands.be** dat je helpt om sneller interessante advertenties te vinden en ophaalritten te plannen. Het draait in je eigen browser via Tampermonkey. Je hebt geen server, account of installatie van software nodig.

> ⚠️ Dit is een onofficieel hulpmiddel. Het is niet gemaakt door of verbonden aan Marktplaats, 2dehands of Adevinta. Het gebruikt dezelfde interne koppelingen als de websites zelf. Die kunnen zonder aankondiging veranderen, waardoor (een deel van) de app tijdelijk niet meer werkt.

---

## Wat kan het?

### Widget op elke pagina
- Een zwevend venster rechtsonder op marktplaats.nl en 2dehands.be.
- Het wisselt **om de 30 seconden** tussen **nieuwe berichten** en **nieuwe zoekertjes**.
- Tellers tonen het aantal ongelezen berichten en nieuwe advertenties.
- Pauzeren en minimaliseren kan. Staat je muis op de widget, dan wisselt hij niet.

### Zoekertjes-app (knop **Zoeken ▦** in de widget)
- **Zoekt tegelijk op Marktplaats én 2dehands.** De resultaten worden samengevoegd en zijn herkenbaar aan een label (MP / 2dh).
- **Filters:** zoekterm, postcode, straal (km), minimum- en maximumprijs, sortering (nieuwste, prijs, dichtstbij) en per site aan of uit.
- **Geplaatst:** laatste 24 uur, 48 uur, 72 uur, ouder dan 72 uur, of altijd.
- **Opgeslagen zoekopdrachten.** Met één klik voer je ze opnieuw uit; advertenties die nieuw zijn sinds de vorige keer krijgen het label **NIEUW**.
- **Drie weergaven:**
  - **Lijst:** foto, titel, prijs, plaats, afstand en een stukje omschrijving.
  - **Raster:** grote foto's in kaarten.
  - **Kaart:** alle advertenties als punten rond je postcode, met de straal als cirkel. **Houd je muis op een punt** voor titel en foto.
- **Ritplanner:**
  - Voeg advertenties toe aan je rit, vanuit de lijst of vanaf de kaart.
  - De app zet de stops in een logische volgorde, schat de afstand en opent de route in **Google Maps**.

### Meldingen
- **Browsermeldingen:** zet het 🔔 belletje aan bij een opgeslagen zoekopdracht. Je krijgt dan een melding bij nieuwe advertenties *binnen het tijdvak van die zoekopdracht*.
- **E-mailmeldingen:**
  - Stuur een samenvatting naar één of meer e-mailadressen, ook van iemand anders.
  - Stel in **van hoe laat tot hoe laat** en **hoe vaak** (bijvoorbeeld elke 1 uur en 30 minuten).
  - Kies of de mail over nieuwe zoekertjes gaat, over nieuwe berichten, of over allebei.
  - Er gaat alleen een mail weg als er écht iets nieuws is.

---

## Installatie

1. Installeer de browserextensie **Tampermonkey**:
   - [Chrome / Edge / Brave](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)
   - Safari en andere browsers: zie [tampermonkey.net](https://www.tampermonkey.net)
2. Open het bestand [`marktplaats-widget.user.js`](marktplaats-widget.user.js) in deze repository en klik op **Raw**. Tampermonkey herkent het script en toont een installatiescherm. Klik op **Installeren**.
   *(Werkt dat niet? Open Tampermonkey → **Nieuw script maken**, plak de volledige inhoud van het bestand erin en sla op met Ctrl/Cmd + S.)*
3. **Chrome / Edge:** recente versies voeren userscripts alleen uit als je dat toestaat. Open `chrome://extensions` (of `edge://extensions`), klik bij Tampermonkey op **Details** en zet **Gebruikersscripts toestaan** aan. Zie je die schakelaar niet? Zet dan rechtsboven de **Ontwikkelaarsmodus** aan.
4. Ga naar [marktplaats.nl](https://www.marktplaats.nl) of [2dehands.be](https://www.2dehands.be). De widget verschijnt rechtsonder.
5. Vraagt Tampermonkey toestemming om andere websites op te vragen (2dehands.be, marktplaats.nl, api.pdok.nl, api.emailjs.com of je webhook)? Kies dan **Altijd toestaan**. Die toegang is nodig om beide sites tegelijk te doorzoeken en e-mails te versturen.

**Tip:** log in op beide sites als je de berichten van allebei wilt zien.

### Updates
Staat er een nieuwe versie in deze repository? Herhaal dan stap 2. Je opgeslagen zoekopdrachten, rit en instellingen blijven bewaard.

---

## Gebruik

1. Klik in de widget op **Zoeken ▦**.
2. Vul een **zoekterm** in en pas eventueel postcode, straal, prijs en tijdvak aan. Klik op **Zoeken**.
3. Wissel bovenaan tussen **Lijst**, **Raster** en **Kaart**.
4. Klik op **Opslaan…** om de zoekopdracht te bewaren. De eerste opgeslagen zoekopdracht verschijnt ook in de widget.
5. Klik op **+ Rit** bij advertenties die je wilt ophalen. Daarna opent **Route openen in Google Maps** de hele route.

### Tijdvakken

| Optie | Hoe het werkt |
|---|---|
| Laatste 24 uur | Filter *Aangeboden sinds: Vandaag* van de site zelf |
| Laatste 48 uur | Filter *Aangeboden sinds: Gisteren* van de site zelf |
| Laatste 72 uur | Filter *Een week* van de site, plus het datumlabel (vandaag, gisteren of eergisteren) |
| Ouder dan 72 uur | Advertenties met een datumlabel van 3 dagen of ouder |
| Altijd | Geen filter |

De sites geven per advertentie alleen de **datum**, geen tijdstip. Daarom zijn 72 uur en "ouder" per dag nauwkeurig. Betaalde "Dagtoppers" krijgen dagelijks een nieuwe datum en kunnen daardoor jonger lijken dan ze zijn.

---

## E-mailmeldingen instellen

Open de app en klik links op **E-mail instellen…**. Een browserscript kan zelf geen e-mail versturen, dus je kiest één van deze twee manieren:

### Optie A – EmailJS (aanbevolen, gratis)
1. Maak een gratis account op [emailjs.com](https://www.emailjs.com).
2. Kies **Email Services → Add New Service** en koppel je Gmail, Outlook of ander e-mailaccount. Noteer de **Service ID**.
3. Maak onder **Email Templates** een nieuwe template:
   - **To Email:** `{{to_email}}`
   - **Subject:** `{{subject}}`
   - **Content:** `{{{message_html}}}`. Gebruik **drie** accolades, anders komen de opmaak en foto's niet mee.

   Noteer de **Template ID**.
4. Kopieer bij **Account → General** je **Public key**.
5. Vul deze drie waarden in de app in, plus het e-mailadres van de ontvanger(s). Kies je tijden en je interval.
6. Klik op **Testmail** om te controleren of het werkt; kijk eventueel in je spammap. Klik daarna op **Opslaan**.

Het gratis abonnement van EmailJS heeft een maximum aantal e-mails per maand. Kies daarom een redelijk interval.

### Optie B – Webhook (Make, Zapier, n8n, …)
Vul een webhook-URL in (moet met `https://` beginnen). De app stuurt dan een `POST` met JSON in deze vorm:

```json
{
  "to": ["jij@voorbeeld.nl", "collega@voorbeeld.be"],
  "subject": "Zoekertjes: 3 nieuwe advertenties en 1 nieuw bericht",
  "html": "<div>… kant-en-klare e-mail met foto's …</div>",
  "text": "Platte-tekstversie van dezelfde e-mail",
  "listings": [
    { "search": "Kast", "title": "Vitrinekast", "price": "€ 50", "city": "Maastricht",
      "km": 45, "site": "Marktplaats", "url": "https://…", "image": "https://…", "date": "Vandaag" }
  ],
  "messages": [
    { "src": "mp", "site": "Marktplaats", "from": "Naam", "title": "Advertentietitel",
      "text": "Begin van het laatste bericht…", "unread": 1, "url": "https://…" }
  ]
}
```

Laat je automatisering met `to`, `subject` en `html` een e-mail versturen. Je kunt de gegevens ook ergens anders voor gebruiken, bijvoorbeeld een Slack- of Teams-bericht.

### Hoe de controle werkt
- Er wordt alleen gecontroleerd **binnen het ingestelde tijdvenster**, bijvoorbeeld 08:00–22:00. Een venster over middernacht kan ook, zoals 22:00–07:00.
- De **eerste controle** legt alleen de huidige stand vast. Je krijgt dus niet alle bestaande advertenties in één keer.
- Een advertentie of bericht wordt maar **één keer** gemaild.

---

## Belangrijk om te weten

- **Je browser moet openstaan.** Meldingen en e-mails werken alleen zolang er minstens één tabblad met marktplaats.nl of 2dehands.be open is (dat mag op de achtergrond). Bij een gesloten browser of uitgeschakelde computer wordt er niets gecontroleerd.
- **Een zoekterm is verplicht.** Beide sites geven geen resultaten zonder zoekterm.
- **Postcodes:** gebruik een Nederlandse postcode (`6041GE`) of een Belgische (`3640`). Zoek je vanaf een Nederlandse postcode op 2dehands (of andersom)? Dan zoekt de app vanaf de dichtstbijzijnde plaats over de grens en filtert daarna op de echte afstand tot jouw postcode.
- **Locaties op de kaart** zijn per plaats, niet per adres. Meerdere advertenties uit dezelfde plaats staan op hetzelfde punt; zoom in om ze uit elkaar te halen.
- **Maximum per site:** standaard 200 advertenties per site per zoekopdracht, in te stellen tot 1000. Meer advertenties betekent langer laden.

---

## Privacy

- Alles draait **lokaal in je eigen browser**. Opgeslagen zoekopdrachten, rit, instellingen en EmailJS-gegevens worden bewaard in de opslag van Tampermonkey op jouw computer, niet in deze repository en niet op een server.
- De app praat alleen met:
  - marktplaats.nl en 2dehands.be (zoeken en je berichten)
  - api.pdok.nl (je postcode omzetten naar een locatie)
  - OpenStreetMap (kaarttegels) en cdnjs (de kaartbibliotheek Leaflet)
  - EmailJS of jouw webhook, alleen als je e-mailmeldingen aanzet
- E-mailmeldingen bevatten het begin van je laatste ontvangen berichten. Stuur je meldingen naar iemand anders, dan ziet die persoon dus ook (een deel van) je berichten.

---

## Instellingen in het script

Bovenaan in `marktplaats-widget.user.js` staat een blok `CONFIG`. Dat kun je in Tampermonkey aanpassen:

| Instelling | Standaard | Betekenis |
|---|---|---|
| `switchSeconds` | `30` | Na hoeveel seconden de widget wisselt tussen berichten en zoekertjes |
| `refreshSeconds` | `60` | Hoe vaak de widget nieuwe gegevens ophaalt |
| `widgetItems` | `6` | Aantal items in de widget |
| `notifyMinutes` | `5` | Hoe vaak er gecontroleerd wordt voor browsermeldingen |
| `defaultSearch.postcode` | `6041GE` | Standaardpostcode van de app; **pas deze aan naar je eigen postcode** |
| `defaultSearch.radiusKm` | `100` | Standaardstraal in km |

---

## Problemen oplossen

| Probleem | Oplossing |
|---|---|
| De widget verschijnt niet | Controleer of Tampermonkey en het script aan staan. Zet in Chrome/Edge "Gebruikersscripts toestaan" of de Ontwikkelaarsmodus aan (zie Installatie) en ververs de pagina. |
| "Berichten konden niet geladen worden" | Log in op de site. Blijft het? Dan heeft de site waarschijnlijk iets veranderd; meld het via een issue. |
| Geen resultaten van 2dehands | Geef Tampermonkey toestemming om 2dehands.be op te vragen (Tampermonkey → script → Instellingen → toegestane domeinen). |
| De kaart blijft leeg | Kaarttegels en Leaflet komen van internet; controleer of een adblocker cdnjs.cloudflare.com of openstreetmap.org blokkeert. |
| Geen browsermeldingen | Gebruik **Testmelding sturen** in de app en sta meldingen toe voor je browser (en in de systeeminstellingen van je computer). |
| Testmail komt niet aan | Controleer je spammap, de drie EmailJS-waarden en of de template `{{to_email}}` als ontvanger gebruikt. De foutmelding staat in het e-mailscherm. |

---

## Bijdragen

Zie je een fout, of heb je een idee? Maak een **issue** aan of stuur een **pull request**. Zet bij een bug erbij:
- welke browser en welke Tampermonkey-versie je gebruikt;
- op welke site (Marktplaats of 2dehands) het misgaat;
- wat je deed en wat je zag (een screenshot helpt).

