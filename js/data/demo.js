// Демо-джерело даних: живе «імітоване» життя Джарвіса без сервера й без ключів.
// Інтерфейс працює з ЄДИНИМ контрактом джерела (див. README → «Підключення до Hermes»):
//   source.snapshot()            → { agents, tasks, usage, halted }
//   source.subscribe(fn)         → fn(snapshot) після кожної зміни; повертає функцію відписки
//   source.send(text)            → Promise<{ reply, agent }>; під час роботи викликає onPhase('thinking'|'speaking'|'idle')
//   source.stop() / source.resume()
// Справжнє джерело (hermes.js) реалізує той самий контракт поверх API панелі Джарвіса.

const AGENTS = [
  { id: "jarvis", name: "Джарвіс", role: "Головний: приймає задачі, розбиває на кроки, звітує", main: true },
  { id: "controller", name: "Контролер", role: "Перевіряє результати, стежить за файлами й витратами" },
  { id: "game", name: "Ігровий", role: "Карткова гра: механіки, баланс, код" },
  { id: "video", name: "Відео", role: "Монтаж, субтитри, сценарії" },
  { id: "trading", name: "Трейдинговий", role: "Золото: аналітика, сигнали, демо-рахунок" },
  { id: "research", name: "Дослідник", role: "Пошук і аналіз інформації" },
];
// ціни, $ за 1 млн токенів (вхід/вихід) — лише для демо-розрахунку
const PRICE = { in: 2, out: 10 };

const ROUTES = [
  [/гр[аиу]|карт|баланс|колод/i, "game"],
  [/відео|ролик|монтаж|субтит|youtube/i, "video"],
  [/золот|xau|ринок|трейд|угод/i, "trading"],
  [/знайди|дослід|пошук|аналіз|порівня/i, "research"],
];
const REPLIES = {
  jarvis: "Зрозумів. Беру на себе й тримаю вас у курсі.",
  game: "Доручив Ігровому агенту, Контролер перевірить результат.",
  video: "Відео-агент уже готує план монтажу.",
  trading: "Трейдинговий агент аналізує золото. Торгівля лише на демо-рахунку.",
  research: "Дослідник шукає джерела — звіт буде в панелі задач.",
};

export function createDemoSource() {
  const state = {
    halted: false,
    agents: AGENTS.map((a) => ({ ...a, status: "idle", task: "", tokensIn: 0, tokensOut: 0 })),
    tasks: [],
    usage: { limitUsd: 3, spentUsd: 0, tokensIn: 0, tokensOut: 0 },
  };
  let nextId = 1;
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn(snapshot()));
  const agent = (id) => state.agents.find((a) => a.id === id);

  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function spend(a, tin, tout) {
    a.tokensIn += tin; a.tokensOut += tout;
    state.usage.tokensIn += tin; state.usage.tokensOut += tout;
    state.usage.spentUsd = +(state.usage.spentUsd + (tin * PRICE.in + tout * PRICE.out) / 1e6).toFixed(4);
  }

  function addTask(title, agentId, progress = 0) {
    const t = { id: nextId++, title, agent: agentId, progress, status: "running", started: Date.now() };
    state.tasks.unshift(t);
    const a = agent(agentId); a.status = "working"; a.task = title;
    return t;
  }

  // стартові задачі, щоб прототип одразу виглядав «живим»
  addTask("Баланс стартових карток гри", "game", 35);
  addTask("Огляд золота на тиждень", "trading", 60);
  addTask("Субтитри до ролика «Тиждень золота»", "video", 15);
  spend(agent("jarvis"), 42_000, 6_100); spend(agent("game"), 61_000, 9_800);
  spend(agent("trading"), 38_000, 5_200); spend(agent("video"), 12_000, 1_400); spend(agent("controller"), 9_000, 700);
  state.tasks.push({ id: nextId++, title: "Перевірка монетизації гри", agent: "controller", progress: 100, status: "done", started: Date.now() - 3.6e6 });

  // повільний «пульс» роботи: раз на 4 с просуваємо задачі (дрібні оновлення DOM, без анімаційних циклів)
  setInterval(() => {
    if (state.halted || document.hidden) return;
    for (const t of state.tasks) {
      if (t.status !== "running") continue;
      t.progress = Math.min(100, t.progress + 2 + Math.round(Math.random() * 5));
      spend(agent(t.agent), 900 + Math.random() * 1600, 120 + Math.random() * 300);
      if (t.progress >= 100) {
        t.status = "done";
        const a = agent(t.agent);
        if (!state.tasks.some((x) => x.status === "running" && x.agent === a.id)) { a.status = "idle"; a.task = ""; }
        spend(agent("controller"), 1500, 200);
      }
    }
    emit();
  }, 4000);

  return {
    snapshot,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    async send(text, onPhase = () => {}) {
      if (state.halted) return { reply: "Агенти зупинені. Натисніть «Продовжити».", agent: "jarvis" };
      onPhase("thinking");
      const j = agent("jarvis"); j.status = "working"; j.task = text.slice(0, 60); emit();
      await new Promise((r) => setTimeout(r, 2200));
      const route = ROUTES.find(([re]) => re.test(text));
      const to = route ? route[1] : "jarvis";
      spend(j, 3000 + text.length * 4, 600);
      if (to !== "jarvis") addTask(text.length > 70 ? text.slice(0, 67) + "…" : text, to, 5);
      j.status = "idle"; j.task = "";
      emit();
      onPhase("speaking");
      return { reply: REPLIES[to], agent: to };
    },
    stop() {
      state.halted = true;
      state.agents.forEach((a) => { if (a.status === "working") a.status = "stopped"; });
      state.tasks.forEach((t) => { if (t.status === "running") t.status = "stopped"; });
      emit();
    },
    resume() {
      state.halted = false;
      state.tasks.forEach((t) => { if (t.status === "stopped") t.status = "running"; });
      state.agents.forEach((a) => { a.status = state.tasks.some((t) => t.status === "running" && t.agent === a.id) ? "working" : "idle"; });
      emit();
    },
  };
}
