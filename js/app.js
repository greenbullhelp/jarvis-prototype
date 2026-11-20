// Джарвіс — прототип інтерфейсу. Логіка: рендер панелей, стани ядра, голос, СТОП, картка агента.
// Продуктивність: жодного постійного циклу малювання. DOM оновлюється лише при зміні даних;
// рівень голосу (~15 разів/с) рахується тільки поки мікрофон увімкнено.
import { buildStage, nodeScreenPos } from "./stage.js";
import { createDemoSource } from "./data/demo.js";
// Щоб підключити справжнього Джарвіса (Hermes через панель): import { createHermesSource } from "./data/hermes.js";
// і нижче замінити createDemoSource() на createHermesSource({ base: "" }). Див. README.

const $ = (s) => document.querySelector(s);
const source = createDemoSource();
const svg = $("#stage");
const NAMES = Object.fromEntries(source.snapshot().agents.map((a) => [a.id, a.name]));
const stage = buildStage(svg, source.snapshot().agents);

const STATE_TEXT = { idle: "спокій", listening: "слухаю", thinking: "думаю", speaking: "говорю", stopped: "зупинено" };
const AGENT_STATUS = { idle: "Очікує", working: "Працює", stopped: "Зупинено" };
const PRICE = { in: 2, out: 10 };   // $ за 1 млн токенів — лише для демо-розрахунку вартості агента
const money = (v) => "$" + v.toFixed(v < 10 ? 3 : 2);
const num = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + " млн" : v >= 1e3 ? Math.round(v / 1e3) + " тис." : String(Math.round(v)));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const costOf = (a) => a.costUsd ?? (a.tokensIn * PRICE.in + a.tokensOut * PRICE.out) / 1e6;

// ---------- стан ядра ----------
let coreState = "idle", data = source.snapshot(), openCard = null, listening = false;
function setCore(s) {
  coreState = s;
  const shown = data.halted && s === "idle" ? "stopped" : s;
  svg.dataset.state = shown;
  stage.label.textContent = STATE_TEXT[shown].toUpperCase();
  $("#chip-state").innerHTML = `Стан: <b>${STATE_TEXT[shown]}</b>`;
}

// ---------- рендер (лише якщо змінилось) ----------
const cache = {};
const put = (key, el, html) => { if (cache[key] !== html) { cache[key] = html; el.innerHTML = html; } };

function render(d) {
  data = d;
  // задачі: хто що виконує
  const running = d.tasks.filter((t) => t.status === "running").length;
  $("#tasks-count").textContent = running ? `${running} в роботі` : "";
  put("tasks", $("#tasks"), d.tasks.length ? d.tasks.slice(0, 12).map((t) => {
    const st = t.status === "running" ? "working" : t.status;
    const p = t.progress == null ? null : Math.max(0, Math.min(100, t.progress));
    return `<div class="card task ${t.status}">
      <div class="task-t">${esc(t.title)}</div>
      <div class="task-m"><span class="who"><span class="dot ${st}"></span>${esc(NAMES[t.agent] || t.agent)}</span>
        <span>${t.status === "done" ? "готово" : t.status === "stopped" ? "зупинено" : p != null ? p + "%" : "в роботі"}</span></div>
      ${p != null ? `<div class="prog"><i style="transform:scaleX(${p / 100})"></i></div>` : ""}
    </div>`;
  }).join("") : `<p class="empty">Задач немає.</p>`);

  // витрати
  const u = d.usage, left = Math.max(0, u.limitUsd - u.spentUsd), frac = u.limitUsd ? Math.min(1, u.spentUsd / u.limitUsd) : 0;
  $("#spent").innerHTML = `${money(u.spentUsd)} <small>з ${money(u.limitUsd)}</small>`;
  $("#meter").style.transform = `scaleX(${frac})`;
  $("#limit").textContent = money(u.limitUsd);
  $("#left").textContent = money(left);
  $("#tokens").textContent = `${num(u.tokensIn)} / ${num(u.tokensOut)}`;
  const max = Math.max(...d.agents.map(costOf), 1e-9);
  put("costs", $("#costs"), d.agents.map((a) => `<span class="name"><span class="dot ${a.status}"></span>${esc(a.name)}</span><b>${money(costOf(a))}</b>
    <span class="bar"><i style="transform:scaleX(${(costOf(a) / max).toFixed(3)})"></i></span>`).join(""));

  // вузли й спиці на сцені
  for (const a of d.agents) {
    const node = svg.querySelector(`.node[data-agent="${a.id}"]`);
    if (!node) continue;
    node.classList.toggle("working", a.status === "working");
    node.classList.toggle("stopped", a.status === "stopped");
    svg.querySelector(`.spoke[data-agent="${a.id}"]`)?.classList.toggle("live", a.status === "working");
  }

  // СТОП / Продовжити
  const b = $("#stop");
  b.textContent = d.halted ? "ПРОДОВЖИТИ" : "СТОП";
  b.classList.toggle("resume", d.halted);
  b.setAttribute("aria-label", d.halted ? "Продовжити роботу агентів" : "Зупинити всіх агентів");
  setCore(coreState);
  if (openCard) showCard(openCard);
}
source.subscribe(render);
render(data);

// ---------- картка агента ----------
function showCard(id) {
  const a = data.agents.find((x) => x.id === id);
  if (!a) return;
  openCard = id;
  svg.querySelectorAll(".node").forEach((n) => n.classList.toggle("sel", n.dataset.agent === id));
  const card = $("#card");
  const tasks = data.tasks.filter((t) => t.agent === id && t.status === "running");
  put("card", card, `<button class="x" type="button" aria-label="Закрити">×</button>
    <h3><span class="dot ${a.status}"></span>${esc(a.name)}</h3>
    <p class="role">${esc(a.role || "")}</p>
    <div class="kv" style="margin-top:0">
      <span>Статус</span><b>${AGENT_STATUS[a.status] || a.status}</b>
      <span>Зараз</span><b>${esc(a.task || (tasks[0] && tasks[0].title) || "—")}</b>
      <span>Задач у роботі</span><b>${tasks.length}</b>
      <span>Вартість сьогодні</span><b>${money(costOf(a))}</b>
    </div>`);
  card.hidden = false;
  const r = nodeScreenPos(svg, id), cw = card.offsetWidth, ch = card.offsetHeight;
  if (r) {
    let x = r.left + r.width / 2 - cw / 2, y = r.bottom + 14;
    if (y + ch > innerHeight - 90) y = r.top - ch - 14;
    x = Math.max(12, Math.min(innerWidth - cw - 12, x));
    y = Math.max(12, y);
    card.style.left = x + "px"; card.style.top = y + "px";
  }
}
function hideCard() {
  openCard = null; $("#card").hidden = true; delete cache.card;
  svg.querySelectorAll(".node.sel").forEach((n) => n.classList.remove("sel"));
}
stage.nodes.addEventListener("click", (e) => {
  const n = e.target.closest(".node");
  if (n) { e.stopPropagation(); openCard === n.dataset.agent ? hideCard() : showCard(n.dataset.agent); }
});
stage.nodes.addEventListener("keydown", (e) => {
  const n = e.target.closest(".node");
  if (n && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showCard(n.dataset.agent); }
});
$("#card").addEventListener("click", (e) => { if (e.target.closest(".x")) hideCard(); });
document.addEventListener("click", (e) => { if (openCard && !e.target.closest("#card, .node")) hideCard(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideCard(); });
addEventListener("resize", () => openCard && showCard(openCard));
addEventListener("scroll", () => openCard && hideCard(), { passive: true });

// натискання на ядро — демо: показує стани по колу
const CYCLE = ["idle", "listening", "thinking", "speaking"];
let demoLevel = null;
function cycleCore() {
  if (listening) return;
  const next = CYCLE[(CYCLE.indexOf(coreState) + 1) % CYCLE.length];
  setCore(next);
  clearInterval(demoLevel);
  if (next === "listening") demoLevel = setInterval(() => svg.style.setProperty("--lvl", (0.25 + Math.random() * 0.75).toFixed(2)), 140);
  else svg.style.removeProperty("--lvl");
}
stage.hit.addEventListener("click", cycleCore);
stage.hit.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleCore(); } });

// ---------- відповідь під ядром ----------
let replyTimer;
function say(text, who) {
  const el = $("#reply");
  el.innerHTML = `<b>${esc(who || "Джарвіс")}:</b> ${esc(text)}`;
  el.classList.add("on");
  clearTimeout(replyTimer);
  replyTimer = setTimeout(() => el.classList.remove("on"), 9000);
}

// ---------- текст ----------
const input = $("#input"), sendBtn = $("#send");
input.addEventListener("input", () => { sendBtn.disabled = !input.value.trim(); });
let busy = false;
$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  if (listening) stopListening(false);
  busy = true; input.value = ""; sendBtn.disabled = true;
  clearInterval(demoLevel);
  try {
    const r = await source.send(text, (phase) => setCore(phase));
    if (r.reply) say(r.reply);
    setCore("speaking");
    speakOut(r.reply);
    setTimeout(() => { if (coreState === "speaking") setCore("idle"); }, 3200);
  } catch (err) {
    say("Не вдалося надіслати: " + err.message);
    setCore("idle");
  } finally { busy = false; }
});

// озвучення відповіді (якщо браузер уміє; тихо пропускаємо, якщо ні)
function speakOut(text) {
  try {
    if (!text || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "uk-UA"; u.rate = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch { /* без голосу */ }
}

// ---------- голос: мікрофон → рівень для хвилі + розпізнавання мови ----------
let stream = null, ctx = null, levelTimer = null, rec = null;
const mic = $("#mic");
async function startListening() {
  listening = true; mic.classList.add("on"); mic.setAttribute("aria-pressed", "true");
  clearInterval(demoLevel); setCore("listening");
  // 1) рівень гучності: аналізатор Web Audio, читаємо ~15 разів/с і лише поки слухаємо
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const tick = () => {
      if (!listening) return;
      an.getByteFrequencyData(buf);
      let s = 0; for (let i = 2; i < 48; i++) s += buf[i];
      svg.style.setProperty("--lvl", Math.min(1, s / 46 / 150).toFixed(2));
      levelTimer = setTimeout(tick, 66);
    };
    tick();
  } catch {
    // мікрофон недоступний — показуємо імітацію рівня, щоб було видно стан
    demoLevel = setInterval(() => svg.style.setProperty("--lvl", (0.2 + Math.random() * 0.6).toFixed(2)), 140);
  }
  // 2) розпізнавання мови (Chrome/Edge/Safari): текст падає в поле вводу
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    rec = new SR(); rec.lang = "uk-UA"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (ev) => {
      input.value = Array.from(ev.results).map((r) => r[0].transcript).join(" ");
      sendBtn.disabled = !input.value.trim();
    };
    rec.onend = () => { if (listening) stopListening(true); };
    rec.onerror = () => {};
    try { rec.start(); } catch { /* вже запущено */ }
  } else {
    say("Цей браузер не розпізнає мову — напишіть текстом.");
  }
}
function stopListening(autoSend) {
  listening = false; mic.classList.remove("on"); mic.setAttribute("aria-pressed", "false");
  clearTimeout(levelTimer); clearInterval(demoLevel);
  try { rec && rec.stop(); } catch {}
  rec = null;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  ctx?.close().catch(() => {}); ctx = null;
  svg.style.removeProperty("--lvl");
  setCore("idle");
  if (autoSend && input.value.trim()) $("#form").requestSubmit();
}
mic.addEventListener("click", () => (listening ? stopListening(true) : startListening()));

// ---------- СТОП (завжди видно) ----------
$("#stop").addEventListener("click", () => {
  if (data.halted) { source.resume(); say("Агенти продовжують роботу."); }
  else {
    if (listening) stopListening(false);
    try { speechSynthesis.cancel(); } catch {}
    source.stop(); setCore("idle"); say("Усіх агентів зупинено. Нічого не виконується.");
  }
});

// ---------- економія: пауза анімацій у фоновій вкладці ----------
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("paused", document.hidden);
  if (document.hidden && listening) stopListening(false);
});
