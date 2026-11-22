# Temperatur Übersicht Card (v1.2.1)

Eine Lovelace-Karte für Home Assistant, die alles in einem Stück anzeigt:
- **Oben:** Außentemperatur, rechts daneben die Luftfeuchtigkeit
- **Darunter:** Raumkacheln nur mit Symbol, Temperatur und Luftfeuchtigkeit
  - Die Temperaturzahl hat dieselbe Farbe wie das Raumsymbol
  - Farbe nach Temperatur: blau = zu kalt, grün = angenehm, orange/rot = zu warm
  - 🪟 oben links, blau = Fenster offen
  - 🔥 oben rechts, orange und pulsierend = Raum heizt gerade (beide können gleichzeitig angezeigt werden)
  - Luftfeuchtigkeit wird rot, sobald sie über dem Grenzwert liegt

Die Karte braucht keine HACS-Abhängigkeiten wie Mushroom.

## Installation über HACS (empfohlen)
1. Gehe zu **HACS → ⋮ → Benutzerdefinierte Repositories**.
2. Trage als Repository `https://github.com/domiundergroun/HA---temperatur-card` ein und wähle den Typ **Dashboard** (bei älteren HACS-Versionen „Lovelace“).
3. Suche „Temperatur Übersicht Card“, lade sie herunter und lade die Seite neu.
4. Neue Versionen erscheinen danach automatisch in HACS als Update.

## Manuelle Installation
1. Kopiere `temperatur-uebersicht-card.js` nach `/config/www/`, zum Beispiel mit dem File-Editor- oder Samba-Add-on.
2. Gehe zu **Einstellungen → Dashboards → ⋮ → Ressourcen → Ressource hinzufügen**:
   - URL: `/local/temperatur-uebersicht-card.js?v=1.2.1`
   - Typ: **JavaScript-Modul**
3. Lade die Seite neu. Leere in der App falls nötig den Cache.
4. Gehe im Dashboard zu **Karte hinzufügen → Manuell** und füge den Inhalt aus `beispiel-konfiguration.yaml` ein.

Bei einem Update erhöhst du die `?v=`-Nummer in der Ressourcen-URL, damit der Browser die neue Version lädt.

## Optionen
| Option | Beschreibung | Standard |
|---|---|---|
| `outdoor.temperature` / `outdoor.humidity` | Außensensoren | – |
| `weather` | optional: Wetter-Entität als Ersatz, wenn keine Außensensoren angegeben sind | – |
| `columns` | Kacheln pro Zeile | 3 |
| `humidity_warning` | Warngrenze für die Luftfeuchtigkeit in % | 65 |
| `temperature_color` | feste Farbe für die Raumtemperaturen, z. B. `"#ffffff"` (ohne Angabe passt sich die Farbe an den Raumstatus an) | – |

**Pro Raum:** `icon`, `temperature`, `humidity`, `climate` (eine oder mehrere), `heating` (beliebige Entität, Heizen bei Zustand `on` oder einem Wert > 0, z. B. Ventilöffnung), `window` (eine oder mehrere), `min`, `max`, `humidity_warning`, `name` (wird nur als Tooltip angezeigt).

Ein Tipp auf eine Kachel öffnet den Verlauf des Temperatursensors.
