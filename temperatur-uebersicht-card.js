/*
 * Temperatur Übersicht Card für Home Assistant
 * Außentemperatur/-feuchtigkeit + Raumkacheln (Temperatur, Luftfeuchtigkeit,
 * Heiz-Status, Fenster-Status) in einer einzigen Karte.
 */
const CARD_VERSION = "1.7.2";

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
  static getConfigElement() {
    return document.createElement("temperatur-uebersicht-card-editor");
  }

  static getStubConfig() {
    return { columns: 2, rooms: [] };
  }

  setConfig(config) {
    if (!config) throw new Error("Ungültige Konfiguration");
    this._config = { columns: 2, humidity_warning: 65, ...config, rooms: Array.isArray(config.rooms) ? config.rooms : [] };
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

  connectedCallback() {
    if (!this._ro && window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._applyCols());
    }
    this._ro?.observe(this);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  /* Spaltenzahl an die Kartenbreite anpassen: "columns" ist das Maximum */
  _cols() {
    const max = Math.max(1, +this._config.columns || 2);
    const w = this.clientWidth;
    if (!w) return max;
    const minTile = this._config.min_tile_width || 128;
    const fit = Math.max(1, Math.floor((w - 36 + 10) / (minTile + 10)));
    return Math.min(max, fit);
  }

  _applyCols() {
    const el = this.shadowRoot?.querySelector(".rooms");
    if (!el) return;
    const cols = this._cols();
    if (String(cols) !== el.style.getPropertyValue("--cols")) el.style.setProperty("--cols", cols);
    const w = this.clientWidth;
    el.classList.toggle("compact", !!w && (w - 36 - (cols - 1) * 10) / cols < 160);
  }

  getCardSize() {
    const rows = Math.ceil(Math.max(this._config.rooms.length, 1) / (this._config.columns || 2));
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
    const hasOutdoor = !!(c.outdoor?.temperature || c.outdoor?.humidity || c.weather);

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
          ${heating ? '<ha-icon class="badge bottom-left heat" icon="mdi:fire"></ha-icon>' : ""}
          <div class="ico-wrap"><ha-icon class="ico" icon="${esc(r.icon || "mdi:home")}"></ha-icon></div>
          <div class="info">
            <div class="t">${fmt(t)}<span class="u">°C</span></div>
            ${
              r.humidity
                ? `<div class="h${wet ? " wet" : ""}"><ha-icon icon="${wet ? "mdi:water-alert" : "mdi:water-outline"}"></ha-icon>${fmt(h, 0)} %</div>`
                : ""
            }
          </div>
        </div>`;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        ${!hasOutdoor ? "" : `<div class="hero" style="--oc:${this._outdoorColor(outT)}" data-entity="${esc(c.outdoor?.temperature || c.weather || "")}">
          <div class="cond-icon"><ha-icon icon="${Number.isFinite(outT) && outT <= 0 ? "mdi:snowflake" : "mdi:flower"}"></ha-icon></div>
          <div class="temp">
            <span class="num">${fmt(outT)}</span>
            <div class="side">
              <span class="u">°C</span>
              ${Number.isFinite(outH) ? `<div class="hum"><ha-icon icon="mdi:water"></ha-icon>${fmt(outH, 0)}<span class="hu">%</span></div>` : ""}
            </div>
          </div>
        </div>`}
        ${c.rooms.length ? "" : '<div class="empty">Noch keine Räume – füge sie über „Bearbeiten“ im Karten-Editor hinzu.</div>'}
        <div class="rooms" style="--cols:${this._cols()};${c.temperature_color ? `--tu-temp-color:${esc(c.temperature_color)}` : ""}">${roomsHtml}</div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".room").forEach((el) => {
      el.addEventListener("click", () => this._moreInfo(c.rooms[+el.dataset.idx].temperature));
    });
    this._applyCols();
    const hero = this.shadowRoot.querySelector(".hero");
    if (hero) hero.addEventListener("click", () => this._moreInfo(hero.dataset.entity));
  }
}

const STYLES = `
  :host { display: block; --tu-heat: #ff6d00; --tu-window: #039be5; --tu-wet: #e53935; }
  ha-card { padding: 20px 18px 18px; overflow: hidden; }
  ha-icon { display: inline-flex; }

  .hero { display: flex; align-items: center; justify-content: flex-start; gap: 14px; cursor: pointer; padding-left: 4px; }
  .cond-icon {
    width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(127,127,127,.10);
    background: color-mix(in srgb, var(--oc) 16%, transparent);
    color: var(--oc);
  }
  .cond-icon ha-icon { --mdc-icon-size: 30px; }
  .temp { display: flex; align-items: stretch; gap: 4px; color: var(--primary-text-color); white-space: nowrap; }
  .num { font-size: 48px; font-weight: 300; line-height: 1; }
  .side { display: flex; flex-direction: column; justify-content: space-between; padding: 3px 0 2px; }
  .side .u { font-size: 20px; line-height: 1; color: var(--secondary-text-color); }
  .hum {
    display: flex; align-items: center; gap: 1px; line-height: 1;
    background: none; border: none; box-shadow: none; padding: 0; border-radius: 0;
    color: var(--secondary-text-color); font-size: 16px; font-weight: 400;
  }
  .hum ha-icon { --mdc-icon-size: 16px; color: #039be5; }
  .hum .hu { font-size: 12px; margin-left: 1px; }

  .empty { color: var(--secondary-text-color); font-size: 14px; text-align: center; padding: 8px 0; }
  .hero + .rooms, .hero + .empty { margin-top: 20px; }
  .rooms { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 10px; }
  .room {
    position: relative; cursor: pointer; border-radius: 18px; padding: 12px 10px 12px 12px;
    display: flex; flex-direction: row; align-items: center; gap: 10px; min-width: 0; overflow: hidden;
    background: rgba(127,127,127,.08);
    background: color-mix(in srgb, var(--c) 11%, transparent);
    transition: transform .15s ease;
  }
  .room:active { transform: scale(.96); }
  .ico-wrap {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--c) 20%, transparent); color: var(--c);
  }
  .ico { --mdc-icon-size: 24px; }
  .compact .room { padding: 10px 8px 10px 10px; gap: 8px; border-radius: 16px; }
  .compact .ico-wrap { width: 36px; height: 36px; }
  .compact .ico { --mdc-icon-size: 20px; }
  .compact .t { font-size: 18px; }
  .compact .t .u { font-size: 11px; }
  .compact .badge { --mdc-icon-size: 10px; width: 16px; height: 16px; }
  .info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .t {
    font-size: 20px; font-weight: 700; line-height: 1.15; white-space: nowrap;
    color: var(--tu-temp-color, var(--c));
    color: var(--tu-temp-color, color-mix(in srgb, var(--c) 75%, var(--primary-text-color)));
  }
  .t .u { font-size: 12px; font-weight: 500; margin-left: 1px; opacity: .8; }
  .h { display: flex; align-items: center; gap: 2px; font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
  .h ha-icon { --mdc-icon-size: 13px; }
  .h.wet { color: var(--tu-wet); font-weight: 500; }

  .badge {
    position: absolute; top: 5px; --mdc-icon-size: 12px; width: 19px; height: 19px; border-radius: 50%;
    box-shadow: 0 0 0 2px var(--card-background-color, var(--ha-card-background, #fff));
    align-items: center; justify-content: center; color: #fff;
  }
  .badge.left { left: 6px; }
  .badge.bottom-left { top: auto; bottom: 5px; left: 6px; }
  .heat { background: var(--tu-heat); animation: pulse 2s ease-in-out infinite; }
  .win { background: var(--tu-window); }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
`;

/* ====================== Grafischer Editor ====================== */
const tempNumber = { number: { min: 0, max: 35, step: 0.5, mode: "box", unit_of_measurement: "°C" } };

const GENERAL_SCHEMA = [
  { name: "outdoor_temperature", selector: { entity: { filter: { domain: "sensor", device_class: "temperature" } } } },
  { name: "outdoor_humidity", selector: { entity: { filter: { domain: "sensor", device_class: "humidity" } } } },
  {
    name: "",
    type: "grid",
    schema: [
      { name: "columns", selector: { number: { min: 1, max: 6, step: 1, mode: "box" } } },
      { name: "humidity_warning", selector: { number: { min: 30, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
    ],
  },
  { name: "temperature_color", selector: { text: {} } },
];

const ROOM_SCHEMA = [
  {
    name: "",
    type: "grid",
    schema: [
      { name: "name", selector: { text: {} } },
      { name: "icon", selector: { icon: {} } },
    ],
  },
  { name: "temperature", selector: { entity: { filter: { domain: "sensor", device_class: "temperature" } } } },
  { name: "humidity", selector: { entity: { filter: { domain: "sensor", device_class: "humidity" } } } },
  { name: "climate", selector: { entity: { filter: { domain: "climate" } } } },
  { name: "window", selector: { entity: { multiple: true, filter: { domain: "binary_sensor" } } } },
  {
    name: "",
    type: "grid",
    schema: [
      { name: "min", selector: tempNumber },
      { name: "max", selector: tempNumber },
    ],
  },
  { name: "humidity_warning", selector: { number: { min: 30, max: 100, step: 1, mode: "box", unit_of_measurement: "%" } } },
];
const ROOM_KEYS = ["name", "icon", "temperature", "humidity", "climate", "window", "min", "max", "humidity_warning"];

const GENERAL_LABELS = {
  outdoor_temperature: "Außen – Temperatursensor",
  outdoor_humidity: "Außen – Luftfeuchtigkeitssensor",
  columns: "Kacheln pro Zeile",
  humidity_warning: "Feuchte-Warnung ab",
  temperature_color: "Feste Farbe für Raumtemperaturen (optional)",
};
const GENERAL_HELPERS = {
  temperature_color: "Leer lassen = Farbe passend zum Raumstatus. Beispiel: #ffffff",
};
const ROOM_LABELS = {
  name: "Name (nur im Editor sichtbar)",
  icon: "Symbol",
  temperature: "Temperatursensor",
  humidity: "Luftfeuchtigkeitssensor",
  climate: "Thermostat (für Heiz-Anzeige)",
  window: "Fenstersensor(en)",
  min: "Zu kalt unter",
  max: "Zu warm über",
  humidity_warning: "Eigene Feuchte-Warnung ab",
};
const ROOM_HELPERS = {
  min: "Standard: 18 °C",
  max: "Standard: 22 °C",
  humidity_warning: "Leer lassen = allgemeiner Wert",
};

const clean = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
};

class TemperaturUebersichtCardEditor extends HTMLElement {
  constructor() {
    super();
    this._open = new Set();
  }

  setConfig(config) {
    this._config = { ...config, rooms: (config.rooms || []).map((r) => ({ ...r })) };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this.shadowRoot) this.shadowRoot.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    this._updateTitles();
  }

  async _loadHaForm() {
    if (customElements.get("ha-form") && customElements.get("ha-entity-picker")) return;
    if (!this._loading) {
      this._loading = (async () => {
        const helpers = await window.loadCardHelpers?.();
        const card = await helpers?.createCardElement({ type: "entities", entities: [] });
        await card?.constructor?.getConfigElement?.();
      })().catch(() => {});
    }
    await this._loading;
  }

  async _render() {
    if (!this._config) return;
    await this._loadHaForm();
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (this._builtCount !== this._config.rooms.length) this._build();
    this._update();
  }

  _build() {
    const rooms = this._config.rooms;
    this._builtCount = rooms.length;
    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="section">
        <div class="sec-title">Allgemein</div>
        <ha-form id="general"></ha-form>
      </div>
      <div class="sec-title">Räume</div>
      ${rooms
        .map(
          (_, i) => `
        <div class="room${this._open.has(i) ? " open" : ""}" data-i="${i}">
          <div class="room-hd" data-act="toggle" data-i="${i}">
            <ha-icon class="r-ico"></ha-icon>
            <span class="r-title"></span>
            <span class="sp"></span>
            <button data-act="up" data-i="${i}" title="Nach oben" ${i === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-up"></ha-icon></button>
            <button data-act="down" data-i="${i}" title="Nach unten" ${i === rooms.length - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-down"></ha-icon></button>
            <button data-act="delete" data-i="${i}" title="Raum löschen" class="del"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
            <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
          </div>
          <div class="room-body"><ha-form class="room-form" data-i="${i}"></ha-form></div>
        </div>`
        )
        .join("")}
      ${rooms.length === 0 ? '<div class="empty">Noch keine Räume angelegt.</div>' : ""}
      <button class="add" data-act="add"><ha-icon icon="mdi:plus"></ha-icon>Raum hinzufügen</button>
    `;

    const general = this.shadowRoot.getElementById("general");
    general.schema = GENERAL_SCHEMA;
    general.computeLabel = (s) => GENERAL_LABELS[s.name] ?? s.name;
    general.computeHelper = (s) => GENERAL_HELPERS[s.name];
    general.addEventListener("value-changed", (ev) => this._generalChanged(ev));

    this.shadowRoot.querySelectorAll(".room-form").forEach((f) => {
      f.schema = ROOM_SCHEMA;
      f.computeLabel = (s) => ROOM_LABELS[s.name] ?? s.name;
      f.computeHelper = (s) => ROOM_HELPERS[s.name];
      f.addEventListener("value-changed", (ev) => this._roomChanged(ev, +f.dataset.i));
    });

    this.shadowRoot.querySelectorAll("[data-act]").forEach((el) =>
      el.addEventListener("click", (ev) => {
        const act = el.dataset.act;
        if (act === "toggle" && ev.target.closest("button")) return;
        ev.stopPropagation();
        this._action(act, +el.dataset.i);
      })
    );
  }

  _update() {
    const c = this._config;
    const general = this.shadowRoot.getElementById("general");
    if (general) {
      general.hass = this._hass;
      general.data = {
        outdoor_temperature: c.outdoor?.temperature,
        outdoor_humidity: c.outdoor?.humidity,
        columns: c.columns ?? 2,
        humidity_warning: c.humidity_warning ?? 65,
        temperature_color: c.temperature_color,
      };
    }
    this.shadowRoot.querySelectorAll(".room-form").forEach((f) => {
      const r = c.rooms[+f.dataset.i] || {};
      f.hass = this._hass;
      f.data = { ...r, window: r.window ? [].concat(r.window) : [] };
    });
    this._updateTitles();
  }

  _updateTitles() {
    if (!this.shadowRoot || !this._config) return;
    this.shadowRoot.querySelectorAll(".room").forEach((el) => {
      const r = this._config.rooms[+el.dataset.i] || {};
      const friendly = r.temperature && this._hass?.states[r.temperature]?.attributes?.friendly_name;
      el.querySelector(".r-title").textContent = r.name || friendly || `Raum ${+el.dataset.i + 1}`;
      el.querySelector(".r-ico").setAttribute("icon", r.icon || "mdi:home");
    });
  }

  _action(act, i) {
    const rooms = this._config.rooms;
    if (act === "toggle") {
      const el = this.shadowRoot.querySelector(`.room[data-i="${i}"]`);
      el.classList.toggle("open");
      el.classList.contains("open") ? this._open.add(i) : this._open.delete(i);
      return;
    }
    if (act === "add") {
      rooms.push({ icon: "mdi:home" });
      this._open = new Set([rooms.length - 1]);
    } else if (act === "delete") {
      if (!confirm("Diesen Raum wirklich löschen?")) return;
      rooms.splice(i, 1);
      this._open = new Set();
    } else if (act === "up" && i > 0) {
      [rooms[i - 1], rooms[i]] = [rooms[i], rooms[i - 1]];
      this._open = new Set();
    } else if (act === "down" && i < rooms.length - 1) {
      [rooms[i + 1], rooms[i]] = [rooms[i], rooms[i + 1]];
      this._open = new Set();
    } else return;
    this._builtCount = -1;
    this._fire();
    this._render();
  }

  _generalChanged(ev) {
    ev.stopPropagation();
    const v = ev.detail.value || {};
    const outdoor = clean({ temperature: v.outdoor_temperature, humidity: v.outdoor_humidity });
    const cfg = { ...this._config };
    if (Object.keys(outdoor).length) cfg.outdoor = outdoor;
    else delete cfg.outdoor;
    for (const k of ["columns", "humidity_warning", "temperature_color"]) {
      if (v[k] === undefined || v[k] === "" || v[k] === null) delete cfg[k];
      else cfg[k] = v[k];
    }
    this._config = cfg;
    this._fire();
  }

  _roomChanged(ev, i) {
    ev.stopPropagation();
    const old = this._config.rooms[i] || {};
    const extra = Object.fromEntries(Object.entries(old).filter(([k]) => !ROOM_KEYS.includes(k)));
    const value = { ...ev.detail.value };
    if (Array.isArray(value.window) && value.window.length === 1) value.window = value.window[0];
    this._config.rooms[i] = clean({ ...extra, ...value });
    this._updateTitles();
    this._fire();
  }

  _fire() {
    const config = { ...this._config, rooms: this._config.rooms.map((r) => ({ ...r })) };
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

const EDITOR_STYLES = `
  :host { display: block; }
  .sec-title { font-size: 15px; font-weight: 500; margin: 18px 0 8px; color: var(--primary-text-color); }
  .section .sec-title { margin-top: 0; }
  .room { border: 1px solid var(--divider-color); border-radius: 12px; margin-bottom: 8px; overflow: hidden; }
  .room-hd { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; cursor: pointer; }
  .r-ico { color: var(--primary-color); --mdc-icon-size: 22px; }
  .r-title { font-size: 14px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sp { flex: 1; }
  .room-hd button {
    background: none; border: none; padding: 6px; border-radius: 50%; cursor: pointer;
    color: var(--secondary-text-color); display: inline-flex;
  }
  .room-hd button:hover { background: rgba(127,127,127,.12); }
  .room-hd button[disabled] { opacity: .3; cursor: default; }
  .room-hd button.del { color: var(--error-color, #db4437); }
  .chev { color: var(--secondary-text-color); transition: transform .2s; }
  .room.open .chev { transform: rotate(180deg); }
  .room-body { display: none; padding: 4px 12px 12px; border-top: 1px solid var(--divider-color); }
  .room.open .room-body { display: block; }
  .empty { color: var(--secondary-text-color); font-size: 14px; padding: 8px 0; }
  .add {
    display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
    margin-top: 4px; padding: 10px; border-radius: 12px; cursor: pointer;
    border: 1px dashed var(--primary-color); background: none; color: var(--primary-color);
    font-size: 14px; font-weight: 500;
  }
  .add:hover { background: rgba(127,127,127,.08); }
`;

customElements.define("temperatur-uebersicht-card-editor", TemperaturUebersichtCardEditor);

customElements.define("temperatur-uebersicht-card", TemperaturUebersichtCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "temperatur-uebersicht-card",
  name: "Temperatur Übersicht",
  preview: false,
  description: "Außen und alle Räume mit Temperatur, Luftfeuchtigkeit, Heiz- und Fensterstatus.",
});

console.info(`%c TEMPERATUR-UEBERSICHT-CARD %c v${CARD_VERSION} `, "background:#43a047;color:#fff", "background:#333;color:#fff");
