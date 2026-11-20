// Справжнє джерело даних (ще НЕ увімкнене): той самий контракт, що й demo.js, поверх API панелі Джарвіса,
// яка вже працює на сервері й спілкується з Hermes Agent. Ключів тут немає: вхід — cookie-сесія панелі (пароль + 2FA).
//
// Як увімкнути пізніше: розмістити прототип на тому ж домені, що й панель (або дозволити CORS у панелі),
// і в app.js замінити createDemoSource() на createHermesSource({ base: "" }).
//
// Відповідність полів (панель → прототип):
//   GET  /api/overview  → agents[].{name,title,status,doing,cost}, tasks.latest, budget.{spent,limit}
//   GET  /api/tasks     → список задач (id, agent, title, status)
//   POST /api/chat      {text}  → створює задачу Джарвісу; відповідь приходить подією SSE «message»
//   GET  /api/stream    → SSE: message | task | costs | halted …
//   POST /api/stop, POST /api/resume

const STATUS = { working: "working", waiting: "idle", idle: "idle", stopped: "stopped" };

export function createHermesSource({ base = "" } = {}) {
  let last = { agents: [], tasks: [], usage: { limitUsd: 0, spentUsd: 0, tokensIn: 0, tokensOut: 0 }, halted: false };
  const subs = new Set();
  const api = (p, o = {}) => fetch(base + p, { credentials: "include", headers: { "X-Jarvis": "1", "Content-Type": "application/json" }, ...o }).then((r) => r.json());

  async function refresh() {
    const [o, tasks] = await Promise.all([api("/api/overview"), api("/api/tasks?limit=30")]);
    last = {
      halted: o.halted,
      agents: o.agents.map((a) => ({ id: a.name, name: a.title, role: "", main: a.name === "jarvis", status: STATUS[a.status] || "idle",
        task: a.doing, tokensIn: 0, tokensOut: 0, costUsd: a.cost })),
      tasks: tasks.filter((t) => !["cancelled"].includes(t.status)).map((t) => ({ id: t.id, title: t.title, agent: t.agent,
        status: { done: "done", failed: "error", stopped: "stopped" }[t.status] || "running", progress: t.status === "done" ? 100 : null })),
      usage: { limitUsd: o.budget.limit, spentUsd: o.budget.spent, tokensIn: 0, tokensOut: 0 },
    };
    subs.forEach((fn) => fn(last));
  }
  const es = new EventSource(base + "/api/stream", { withCredentials: true });
  es.onmessage = () => refresh().catch(() => {});
  refresh().catch(() => {});

  return {
    snapshot: () => last,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    async send(text, onPhase = () => {}) {
      onPhase("thinking");
      await api("/api/chat", { method: "POST", body: JSON.stringify({ text }) });
      // відповідь Джарвіса прийде через SSE; тут лише повертаємо фазу
      return { reply: "", agent: "jarvis" };
    },
    stop: () => api("/api/stop", { method: "POST" }).then(refresh),
    resume: () => api("/api/resume", { method: "POST" }).then(refresh),
  };
}
