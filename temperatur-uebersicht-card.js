/*
 * Temperatur Übersicht Card für Home Assistant
 * Außentemperatur/-feuchtigkeit + Raumkacheln (Temperatur, Luftfeuchtigkeit,
 * Heiz-Status, Fenster-Status) in einer einzigen Karte.
 */
const CARD_VERSION = "1.2.1";

const COLORS = {
  cold: "#4a9eed",
  ok: "#43a047",
  warm: "#f57c00",
  hot: "#e53935",
  frost: "#7e57c2",
  none: "#9e9e9e",
};

const fmt = (v, d = 1) =>
  Number.isFinite(v)
    ? v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "–";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

class TemperaturUebersichtCard extends HTMLElement {
  static getStubConfig() {
    return {
      outdoor: { temperature: "sensor.aussen_temperatur", humidity: "sensor.aussen_luftfeuchtigkeit" },
      columns: 3,
      rooms: [
        { icon: "mdi:sofa", temperature: "sensor.wohnzimmer_temperatur", humidity: "sensor.wohnzimmer_luftfeuchtigkeit" },
      ],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms) || config.rooms.length === 0) {
      throw new Error('Bitte mindestens einen Raum unter "rooms" angeben.');
    }
    this._config = { columns: 3, humidity_warning: 65, ...config };
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._lastKey = null;
    if (this._hass) this.hass = this._hass;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    const key = this._stateKey();
    if (key !== this._lastKey) {
      this._lastKey = key;
      this._render();
    }
  }

  getCardSize() {
    const rows = Math.ceil(this._config.rooms.length / (this._config.columns || 3));
    return 2 + rows * 2;
  }

  /* ---------- Hilfsfunktionen ---------- */
  _state(id) {
    return id ? this._hass.states[id] : undefined;
  }

  _num(id) {
    const s = this._state(id);
    return s ? parseFloat(s.state) : NaN;
  }

  _list(v) {
    return v ? [].concat(v) : [];
  }

  _isHeating(room) {
    for (const id of this._list(room.climate)) {
      const s = this._state(id);
      if (s && s.attributes.hvac_action === "heating") return true;
    }
    for (const id of this._list(room.heating)) {
      const s = this._state(id);
      if (!s) continue;
      if (["on", "heating", "heat", "true"].includes(String(s.state).toLowerCase())) return true;
      const n = parseFloat(s.state);
      if (Number.isFinite(n) && n > 0) return true;
    }
    return false;
  }

  _isWindowOpen(room) {
    return this._list(room.window).some((id) => {
      const s = this._state(id);
      return s && ["on", "open", "tilted", "gekippt", "offen"].includes(String(s.state).toLowerCase());
    });
  }

  _roomColor(t, room) {
    if (!Number.isFinite(t)) return COLORS.none;
    const min = room.min ?? 18;
    const max = room.max ?? 22;
    if (t < min) return COLORS.cold;
    if (t > max + 3) return COLORS.hot;
    if (t > max) return COLORS.warm;
    return COLORS.ok;
  }

  _outdoorColor(t) {
    if (!Number.isFinite(t)) return COLORS.none;
    if (t < 0) return COLORS.frost;
    if (t < 10) return COLORS.cold;
    if (t < 20) return COLORS.ok;
    if (t < 28) return COLORS.warm;
    return COLORS.hot;
  }

  _stateKey() {
    const c = this._config;
    const ids = [c.weather, c.outdoor?.temperature, c.outdoor?.humidity];
    for (const r of c.rooms) {
      ids.push(r.temperature, r.humidity, ...this._list(r.climate), ...this._list(r.heating), ...this._list(r.window));
    }
    return ids
      .map((id) => {
        const s = this._state(id);
        return s ? `${s.state}|${s.attributes.hvac_action ?? ""}` : "-";
      })
      .join(",");
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  /* ---------- Rendering ---------- */
  _render() {
    if (!this.shadowRoot || !this._hass) return;
    const c = this._config;
    const weather = this._state(c.weather);
    const outT = c.outdoor?.temperature ? this._num(c.outdoor.temperature) : parseFloat(weather?.attributes?.temperature);
    const outH = c.outdoor?.humidity ? this._num(c.outdoor.humidity) : parseFloat(weather?.attributes?.humidity);

    const roomsHtml = c.rooms
      .map((r, i) => {
        const t = this._num(r.temperature);
        const h = this._num(r.humidity);
        const color = this._roomColor(t, r);
        const heating = this._isHeating(r);
        const windowOpen = this._isWindowOpen(r);
        const wet = Number.isFinite(h) && h > (r.humidity_warning ?? c.humidity_warning);
        return `<div class="room${heating ? " heating" : ""}" style="--c:${color}" data-idx="${i}" title="${esc(r.name || "")}">
          ${windowOpen ? '<ha-icon class="badge left win" icon="mdi:window-open-variant"></ha-icon>' : ""}
          ${heating ? '<ha-icon class="badge right heat" icon="mdi:fire"></ha-icon>' : ""}
          <div class="ico-wrap"><ha-icon class="ico" icon="${esc(r.icon || "mdi:home")}"></ha-icon></div>
          <div class="t">${fmt(t)}<span class="u">°C</span></div>
          ${
            r.humidity
              ? `<div class="h${wet ? " wet" : ""}"><ha-icon icon="${wet ? "mdi:water-alert" : "mdi:water-outline"}"></ha-icon>${fmt(h, 0)} %</div>`
              : ""
          }
        </div>`;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="hero" style="--oc:${this._outdoorColor(outT)}" data-entity="${esc(c.outdoor?.temperature || c.weather || "")}">
          <div class="cond-icon"><ha-icon icon="mdi:thermometer"></ha-icon></div>
          <div class="temp">${fmt(outT)}<span class="u">°C</span></div>
          ${Number.isFinite(outH) ? `<div class="hum"><ha-icon icon="mdi:water-outline"></ha-icon>${fmt(outH, 0)}<span class="u">%</span></div>` : ""}
        </div>
        <div class="rooms" style="--cols:${c.columns};${c.temperature_color ? `--tu-temp-color:${esc(c.temperature_color)}` : ""}">${roomsHtml}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".room").forEach((el) => {
      el.addEventListener("click", () => this._moreInfo(c.rooms[+el.dataset.idx].temperature));
    });
    const hero = this.shadowRoot.querySelector(".hero");
    if (hero) hero.addEventListener("click", () => this._moreInfo(hero.dataset.entity));
  }
}

const STYLES = `
  :host { --tu-heat: #ff6d00; --tu-window: #039be5; --tu-wet: #e53935; }
  ha-card { padding: 20px 18px 18px; overflow: hidden; }
  ha-icon { display: inline-flex; }

  .hero { display: flex; align-items: center; justify-content: center; gap: 18px; cursor: pointer; }
  .cond-icon {
    width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(127,127,127,.10);
    background: color-mix(in srgb, var(--oc) 16%, transparent);
    color: var(--oc);
  }
  .cond-icon ha-icon { --mdc-icon-size: 30px; }
  .temp { font-size: 44px; font-weight: 400; line-height: 1; color: var(--primary-text-color); white-space: nowrap; }
  .temp .u { font-size: 20px; margin-left: 2px; color: var(--secondary-text-color); vertical-align: top; }
  .hum {
    display: flex; align-items: center; gap: 2px;
    color: var(--secondary-text-color);
    font-size: 24px; font-weight: 400; white-space: nowrap;
  }
  .hum ha-icon { --mdc-icon-size: 22px; color: #039be5; }
  .hum .u { font-size: 14px; margin-left: 2px; }

  .rooms { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 10px; margin-top: 20px; }
  .room {
    position: relative; cursor: pointer; border-radius: 18px; padding: 14px 6px 12px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    background: rgba(127,127,127,.08);
    background: color-mix(in srgb, var(--c) 11%, transparent);
    transition: transform .15s ease;
  }
  .room:active { transform: scale(.96); }
  .ico-wrap {
    width: 42px; height: 42px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--c) 20%, transparent); color: var(--c);
  }
  .ico { --mdc-icon-size: 24px; }
  .t {
    font-size: 21px; font-weight: 700; margin-top: 4px; white-space: nowrap;
    color: var(--tu-temp-color, var(--c));
    color: var(--tu-temp-color, color-mix(in srgb, var(--c) 75%, var(--primary-text-color)));
  }
  .t .u { font-size: 12px; font-weight: 500; margin-left: 1px; opacity: .8; }
  .h { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--secondary-text-color); }
  .h ha-icon { --mdc-icon-size: 13px; }
  .h.wet { color: var(--tu-wet); font-weight: 500; }

  .badge {
    position: absolute; top: 7px; --mdc-icon-size: 14px; width: 22px; height: 22px; border-radius: 50%;
    align-items: center; justify-content: center; color: #fff;
  }
  .badge.left { left: 7px; }
  .badge.right { right: 7px; }
  .heat { background: var(--tu-heat); animation: pulse 2s ease-in-out infinite; }
  .win { background: var(--tu-window); }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
`;

customElements.define("temperatur-uebersicht-card", TemperaturUebersichtCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "temperatur-uebersicht-card",
  name: "Temperatur Übersicht",
  description: "Außen und alle Räume mit Temperatur, Luftfeuchtigkeit, Heiz- und Fensterstatus.",
});

console.info(`%c TEMPERATUR-UEBERSICHT-CARD %c v${CARD_VERSION} `, "background:#43a047;color:#fff", "background:#333;color:#fff");
