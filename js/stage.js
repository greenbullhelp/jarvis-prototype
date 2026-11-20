// Сцена: живе ядро Джарвіса + «сузір'я» агентів навколо.
// Адаптація ApexOrb.jsx і ReasoningWeb.jsx з APEX-UI (MIT, Ruben Mouradian — див. CREDITS.md):
// та сама геометрія (кільце, тонкі зовнішні кільця, хвиля, хвилі звуку, внутрішні орбіти, орбітальні кільця,
// «доріжки» плати, вигнуті спиці), але SVG будується ОДИН раз, а рухається лише CSS (transform/opacity).
// Жодного requestAnimationFrame-циклу; стан задає атрибут data-state на #stage.

const NS = "http://www.w3.org/2000/svg";
const C = 400;            // центр viewBox 800×800
const R = 118;            // головне кільце ядра
const ORBIT = 292;        // радіус, на якому стоять агенти
const mk = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.append(el);
  return el;
};

// детермінований «випадок», щоб «доріжки» щоразу були однакові
let seed = 11;
const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

export function buildStage(svg, agents) {
  svg.setAttribute("viewBox", "0 0 800 800");
  svg.innerHTML = `<defs>
    <radialGradient id="g-ambient"><stop offset="0" style="stop-color:var(--c-gold);stop-opacity:.10"/><stop offset=".55" style="stop-color:var(--c-silver);stop-opacity:.04"/><stop offset="1" style="stop-color:var(--c-silver);stop-opacity:0"/></radialGradient>
    <radialGradient id="g-ringfill"><stop offset="0" style="stop-color:var(--c-silver);stop-opacity:0"/><stop offset=".72" style="stop-color:var(--c-silver);stop-opacity:.025"/><stop offset=".92" style="stop-color:var(--c-gold);stop-opacity:.09"/><stop offset="1" style="stop-color:var(--c-gold);stop-opacity:.22"/></radialGradient>
    <radialGradient id="g-core"><stop offset="0" style="stop-color:var(--c-core)"/><stop offset=".45" style="stop-color:var(--c-gold-arc)"/><stop offset="1" style="stop-color:var(--c-gold);stop-opacity:0"/></radialGradient>
    <radialGradient id="g-node-live"><stop offset="0" style="stop-color:var(--c-emerald);stop-opacity:.45"/><stop offset="1" style="stop-color:var(--c-emerald);stop-opacity:0"/></radialGradient>
    <filter id="f-soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>`;

  // ---------- сузір'я (задній план) ----------
  const web = mk("g", { class: "web" }, svg);
  [210, 252, 334].forEach((r) => mk("circle", { cx: C, cy: C, r, class: "web-ring" }, web));
  // «доріжки» плати до країв (як у ReasoningWeb, але статичні)
  const pcb = mk("g", { class: "pcb" }, web);
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 5; i++) {
      const y = C + (i - 2) * 64 + (rnd() * 18 - 9);
      const x0 = C + side * (150 + rnd() * 30);
      const xm = side < 0 ? 70 + rnd() * 60 : 670 + rnd() * 60;
      const y2 = y + (rnd() * 34 - 17);
      const xe = side < 0 ? 18 + rnd() * 20 : 762 + rnd() * 20;
      mk("path", { d: `M${x0} ${y} H${xm} V${y2} H${xe}` }, pcb);
      mk("circle", { cx: xe, cy: y2, r: 2.2, class: "pcb-end" }, pcb);
    }
  });

  // спиці й вузли агентів
  const spokes = mk("g", { class: "spokes" }, web);
  const nodes = mk("g", { class: "nodes" }, svg);
  const n = agents.length;
  agents.forEach((a, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = C + ORBIT * Math.cos(ang), y = C + ORBIT * Math.sin(ang);
    const sx = C + 204 * Math.cos(ang), sy = C + 204 * Math.sin(ang);   // спиця починається за зовнішнім кільцем ядра
    const mx = (sx + x) / 2, my = (sy + y) / 2, dx = x - C, dy = y - C, l = Math.hypot(dx, dy), bend = 14;
    mk("path", { d: `M${sx} ${sy} Q${mx + (-dy / l) * bend} ${my + (dx / l) * bend} ${x} ${y}`, class: "spoke", "data-agent": a.id }, spokes);
    const g = mk("g", { class: `node${a.main ? " main" : ""}`, "data-agent": a.id, tabindex: "0", role: "button", "aria-label": `${a.name}: статус` }, nodes);
    const rr = a.main ? 15 : 11;
    mk("circle", { cx: x, cy: y, r: rr * 3.2, fill: "url(#g-node-live)", class: "node-live" }, g);
    mk("circle", { cx: x, cy: y, r: rr + 7, class: "node-halo" }, g);
    mk("circle", { cx: x, cy: y, r: rr, class: "node-core" }, g);
    mk("circle", { cx: x, cy: y, r: 3.4, class: "node-dot" }, g);
    const below = y >= C - 10;
    const t = mk("text", { x, y: below ? y + rr + 26 : y - rr - 16, class: "node-label" }, g);
    t.textContent = a.name;
    mk("circle", { cx: x, cy: y, r: 44, class: "hit" }, g);   // велика зона натискання для пальця
  });

  // ---------- ядро (передній план) ----------
  const orb = mk("g", { class: "orb" }, svg);
  mk("ellipse", { cx: C, cy: C, rx: R + 130, ry: R + 110, fill: "url(#g-ambient)", class: "orb-ambient" }, orb);
  [150, 164, 180, 196].forEach((r, i) => mk("circle", { cx: C, cy: C, r, class: `orb-outer${i % 2 ? " dash" : ""}`, style: `opacity:${(0.5 - i * 0.09).toFixed(2)}` }, orb));
  mk("line", { x1: C, y1: C - 206, x2: C, y2: C - 186, class: "tick" }, orb);
  mk("line", { x1: C, y1: C + 186, x2: C, y2: C + 206, class: "tick" }, orb);
  mk("line", { x1: C - 206, y1: C, x2: C - 186, y2: C, class: "tick" }, orb);
  mk("line", { x1: C + 186, y1: C, x2: C + 206, y2: C, class: "tick" }, orb);
  const waves = mk("g", { class: "waves" }, orb);
  for (let i = 0; i < 4; i++) mk("circle", { cx: C, cy: C, r: R, class: `wave w${i}` }, waves);
  mk("circle", { cx: C, cy: C, r: R, fill: "url(#g-ringfill)", class: "orb-fill" }, orb);
  mk("circle", { cx: C, cy: C, r: R, class: "orb-glow", filter: "url(#f-soft)" }, orb);   // статичне світіння
  mk("circle", { cx: C, cy: C, r: R, class: "orb-ring" }, orb);
  const spin = mk("g", { class: "orb-spin" }, orb);
  mk("circle", { cx: C, cy: C, r: R, class: "orb-arc" }, spin);      // яскрава дуга, що повільно обертається
  mk("circle", { cx: C, cy: C, r: R * 0.6, class: "orbit o1" }, orb);
  mk("circle", { cx: C, cy: C, r: R * 0.37, class: "orbit o2" }, orb);
  mk("circle", { cx: C, cy: C, r: R + 22, class: "orbit o3" }, orb);   // видно лише коли думає

  // хвиля-еквалайзер
  const wf = mk("g", { class: "wf" }, orb);
  mk("line", { x1: C - R - 70, y1: C, x2: C - R + 12, y2: C, class: "wf-ext" }, wf);
  mk("line", { x1: C + R - 12, y1: C, x2: C + R + 70, y2: C, class: "wf-ext" }, wf);
  const bars = 28, width = 170, bw = 3, gap = (width - bars * bw) / (bars - 1);
  for (let i = 0; i < bars; i++) {
    const h = 34;
    const amp = 0.25 + Math.abs(Math.sin(i * 0.8)) * 0.75;   // висота «на піку»
    mk("rect", { x: C - width / 2 + i * (bw + gap), y: C - h / 2, width: bw, height: h, rx: 1.5, class: `bar b${i % 7}`, style: `--amp:${amp.toFixed(2)}` }, wf);
  }
  // центр
  mk("circle", { cx: C, cy: C, r: 20, class: "core-ring" }, orb);
  mk("circle", { cx: C, cy: C, r: 13, fill: "url(#g-core)", class: "core-glow" }, orb);
  mk("circle", { cx: C, cy: C, r: 5, class: "core-dot" }, orb);
  const label = mk("text", { x: C, y: C + R * 0.56, class: "orb-label" }, orb);
  for (let i = 0; i < 3; i++) mk("circle", { cx: C + (i - 1) * 11, cy: C + R * 0.56 + 17, r: 2.2, class: `blink k${i}` }, orb);
  const hit = mk("circle", { cx: C, cy: C, r: R + 18, class: "hit core-hit", tabindex: "0", role: "button", "aria-label": "Ядро Джарвіса: змінити стан (демо)" }, orb);

  return { label, hit, nodes, spokes, wf };
}

// Позиція вузла агента в координатах екрана (для картки агента)
export function nodeScreenPos(svg, id) {
  const g = svg.querySelector(`.node[data-agent="${id}"] .node-core`);
  return g ? g.getBoundingClientRect() : null;
}
