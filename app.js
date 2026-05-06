const STORAGE_KEY = "decision-support-v1";

const defaultProject = () => ({
  id: crypto.randomUUID(),
  name: "未命名决策",
  updatedAt: Date.now(),
  problem: {
    title: "",
    statement: "",
    context: "",
    goals: "",
    constraints: "",
  },
  approach: {
    summary: "",
    steps: "",
    assumptions: "",
  },
  criteria: [
    { id: crypto.randomUUID(), name: "成本", weight: 25 },
    { id: crypto.randomUUID(), name: "可行性", weight: 25 },
    { id: crypto.randomUUID(), name: "风险", weight: 25 },
    { id: crypto.randomUUID(), name: "长期价值", weight: 25 },
  ],
  options: [],
  checklist: [],
  notes: "",
});

let state = {
  projects: [],
  activeId: null,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.projects)) {
        state = { ...state, ...parsed };
        if (!state.activeId && state.projects[0]) state.activeId = state.projects[0].id;
      }
    }
  } catch (_) {}
  if (!state.projects.length) {
    const p = defaultProject();
    state.projects = [p];
    state.activeId = p.id;
    save();
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeProject() {
  return state.projects.find((p) => p.id === state.activeId) || state.projects[0];
}

function normalizeWeights(project) {
  const crit = project.criteria;
  const sum = crit.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  if (sum <= 0) return crit.map((c) => ({ ...c, weight: 100 / crit.length }));
  return crit.map((c) => ({ ...c, weight: ((Number(c.weight) || 0) / sum) * 100 }));
}

function optionScore(project, opt) {
  const crit = normalizeWeights(project);
  let total = 0;
  for (const c of crit) {
    const raw = opt.scores?.[c.id];
    const v = Math.min(10, Math.max(0, Number(raw) || 0));
    total += (c.weight / 100) * v;
  }
  return total;
}

function rankOptions(project) {
  return [...project.options]
    .map((o) => ({ opt: o, score: optionScore(project, o) }))
    .sort((a, b) => b.score - a.score);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") node.innerHTML = v;
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : String(v));
  });
  children.forEach((c) => {
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  });
  return node;
}

function renderSidebar() {
  const ul = document.getElementById("project-list");
  ul.innerHTML = "";
  state.projects
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((p) => {
      const btn = el(
        "button",
        {
          class: p.id === state.activeId ? "active" : "",
          onclick: () => {
            state.activeId = p.id;
            save();
            render();
          },
        },
        [
          el("span", {}, [p.name || "未命名"]),
          el("span", { class: "project-meta" }, [new Date(p.updatedAt).toLocaleDateString()]),
        ]
      );
      ul.appendChild(el("li", {}, [btn]));
    });
}

function renderMain() {
  const root = document.getElementById("main-content");
  const p = activeProject();
  if (!p) {
    root.innerHTML = "<p class='empty-hint'>暂无项目</p>";
    return;
  }

  const ranked = rankOptions(p);
  const maxScore = ranked[0]?.score || 10;

  const problemSection = el("div", { class: "section" }, [
    el("h2", { class: "section-title" }, ["1. 要解决什么问题", el("span", { class: "badge" }, ["问题界定"])]),
    el("div", { class: "card" }, [
      el("label", {}, ["决策 / 问题标题"]),
      inputBind("text", p.problem.title, (v) => {
        p.problem.title = v;
        p.name = (v && v.trim().slice(0, 48)) || p.name || "未命名决策";
        touch(p);
      }),
      el("div", { class: "grid-2" }, [
        fieldBlock("核心问题陈述（现象 + 影响）", p.problem.statement, (v) => {
          p.problem.statement = v;
          touch(p);
        }),
        fieldBlock("背景与相关方", p.problem.context, (v) => {
          p.problem.context = v;
          touch(p);
        }),
      ]),
      el("div", { class: "grid-2" }, [
        fieldBlock("成功标准 / 目标", p.problem.goals, (v) => {
          p.problem.goals = v;
          touch(p);
        }),
        fieldBlock("约束条件（时间、预算、政策等）", p.problem.constraints, (v) => {
          p.problem.constraints = v;
          touch(p);
        }),
      ]),
    ]),
  ]);

  const approachSection = el("div", { class: "section" }, [
    el("h2", { class: "section-title" }, ["2. 打算怎么解决", el("span", { class: "badge" }, ["思路与路径"])]),
    el("div", { class: "card" }, [
      fieldBlock("总体思路（原则、方向）", p.approach.summary, (v) => {
        p.approach.summary = v;
        touch(p);
      }),
      el("div", { class: "grid-2" }, [
        fieldBlock("关键步骤或阶段", p.approach.steps, (v) => {
          p.approach.steps = v;
          touch(p);
        }),
        fieldBlock("隐含假设（需验证的）", p.approach.assumptions, (v) => {
          p.approach.assumptions = v;
          touch(p);
        }),
      ]),
    ]),
  ]);

  const criteriaBlock = el("div", {}, [
    el("label", {}, ["评估维度与权重（总和会自动归一化）"]),
    el("small", { class: "hint" }, ["每个方案在各维度打 0–10 分；权重表示该维度在总决策中的重要性。"]),
    ...p.criteria.map((c, idx) =>
      el("div", { class: "criteria-row" }, [
        inputBind("text", c.name, (v) => {
          c.name = v;
          touch(p);
        }),
        (() => {
          const lab = el("label", {}, ["权重"]);
          const inp = el("input", {
            type: "number",
            min: "0",
            max: "100",
            value: String(c.weight),
          });
          inp.addEventListener("input", () => {
            c.weight = Number(inp.value) || 0;
            touch(p);
            renderMain();
          });
          return el("div", {}, [lab, inp]);
        })(),
        el("div", {}, [
          el("button", {
            class: "btn btn-ghost",
            type: "button",
            title: "删除维度",
            onclick: () => {
              if (p.criteria.length <= 1) return;
              p.criteria = p.criteria.filter((x) => x.id !== c.id);
              p.options.forEach((o) => {
                delete o.scores[c.id];
              });
              touch(p);
              render();
            },
            html: "✕",
          }),
        ]),
      ])
    ),
    el(
      "button",
      {
        class: "btn",
        type: "button",
        onclick: () => {
          p.criteria.push({ id: crypto.randomUUID(), name: "新维度", weight: 10 });
          touch(p);
          render();
        },
      },
      ["+ 添加评估维度"]
    ),
  ]);

  const matrixRows = p.options.map((o) => {
    const cells = p.criteria.map((c) => {
      const inp = el("input", {
        type: "number",
        min: "0",
        max: "10",
        step: "0.5",
        value: String(o.scores?.[c.id] ?? ""),
        title: `${o.name} — ${c.name}`,
      });
      inp.addEventListener("change", () => {
        if (!o.scores) o.scores = {};
        o.scores[c.id] = Math.min(10, Math.max(0, Number(inp.value) || 0));
        touch(p);
        renderMain();
      });
      return el("td", {}, [inp]);
    });
    return el("tr", {}, [
      el("td", {}, [o.name || "（未命名方案）"]),
      ...cells,
      el("td", {}, [optionScore(p, o).toFixed(2)]),
    ]);
  });

  const matrixSection =
    p.options.length && p.criteria.length
      ? el("div", { style: "overflow-x:auto;margin-top:1rem" }, [
          el("table", { class: "matrix-table" }, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", {}, ["方案 \\ 维度"]),
                ...p.criteria.map((c) => el("th", {}, [c.name])),
                el("th", {}, ["加权分"]),
              ]),
            ]),
            el("tbody", {}, matrixRows),
          ]),
        ])
      : el("p", { class: "empty-hint", style: "margin-top:1rem" }, ["添加至少一个方案后，可在此矩阵中批量打分。"]);

  const recommendation =
    ranked.length > 0
      ? el("div", { class: "summary-box", style: "margin-top:1rem" }, [
          el("strong", {}, ["综合排序（供参考）"]),
          document.createTextNode("："),
          ...ranked.map(({ opt, score }, i) => {
            const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
            return el("div", { style: "margin-top:0.65rem" }, [
              el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:0.5rem" }, [
                el("span", {}, [`${i + 1}. ${opt.name || "未命名"}`]),
                el("span", { class: "muted" }, [score.toFixed(2) + " / 10"]),
              ]),
              el("div", { class: "rank-bar" }, [el("span", { style: `width:${pct}%` })]),
            ]);
          }),
          el("p", { style: "margin:0.75rem 0 0;font-size:0.8rem;color:var(--muted)" }, [
            "分数由维度权重与 0–10 分相乘得到。请结合定性利弊与风险做最终判断，勿唯分数论。",
          ]),
        ])
      : null;

  const optionsSection = el("div", { class: "section" }, [
    el("h2", { class: "section-title" }, ["3. 方案评估与可能性", el("span", { class: "badge" }, ["定量 + 定性"])]),
    el("div", { class: "card" }, [
      criteriaBlock,
      matrixSection,
      ...(recommendation ? [recommendation] : []),
      el("div", { class: "options-grid", style: "margin-top:1.25rem" }, [
        ...p.options.map((o) => renderOptionCard(p, o)),
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onclick: () => {
              const scores = {};
              p.criteria.forEach((c) => {
                scores[c.id] = 5;
              });
              p.options.push({
                id: crypto.randomUUID(),
                name: `方案 ${p.options.length + 1}`,
                description: "",
                pros: "",
                cons: "",
                risks: "",
                upside: "",
                scores,
              });
              touch(p);
              render();
            },
          },
          ["+ 添加备选方案"]
        ),
      ]),
    ]),
  ]);

  const checklistSection = el("div", { class: "section" }, [
    el("h2", { class: "section-title" }, ["4. 行动清单", el("span", { class: "badge" }, ["落地检查"])]),
    el("div", { class: "card" }, [
      ...p.checklist.map((item, i) =>
        el("div", { style: "display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem" }, [
          (() => {
            const cb = el("input", { type: "checkbox", checked: item.done ? true : false });
            cb.addEventListener("change", () => {
              item.done = cb.checked;
              touch(p);
            });
            return cb;
          })(),
          (() => {
            const inp = el("input", { type: "text", class: "flex-grow", value: item.text, placeholder: "待办事项" });
            inp.style.marginBottom = "0";
            inp.addEventListener("input", () => {
              item.text = inp.value;
              touch(p);
            });
            return inp;
          })(),
          el("button", {
            class: "btn btn-ghost",
            type: "button",
            onclick: () => {
              p.checklist.splice(i, 1);
              touch(p);
              render();
            },
            html: "✕",
          }),
        ])
      ),
      el(
        "button",
        {
          class: "btn",
          type: "button",
          onclick: () => {
            p.checklist.push({ id: crypto.randomUUID(), text: "", done: false });
            touch(p);
            render();
          },
        },
        ["+ 添加待办"]
      ),
    ]),
  ]);

  const notesSection = el("div", { class: "section" }, [
    el("h2", { class: "section-title" }, ["5. 自由笔记", el("span", { class: "badge" }, ["会议记录 / 灵感"])]),
    el("div", { class: "card" }, [
      (() => {
        const ta = el("textarea", { rows: "6", placeholder: "记录讨论要点、未决问题、信息来源…" });
        ta.value = p.notes || "";
        ta.addEventListener("input", () => {
          p.notes = ta.value;
          touch(p);
        });
        return ta;
      })(),
    ]),
  ]);

  root.innerHTML = "";
  root.append(
    problemSection,
    approachSection,
    optionsSection,
    checklistSection,
    notesSection
  );
}

function fieldBlock(label, value, onChange) {
  const ta = el("textarea", { rows: "4", placeholder: label });
  ta.value = value || "";
  ta.addEventListener("input", () => onChange(ta.value));
  return el("div", {}, [el("label", {}, [label]), ta]);
}

function inputBind(type, value, onChange) {
  const inp = el("input", { type, value: value || "" });
  inp.addEventListener("input", () => onChange(inp.value));
  return inp;
}

function renderOptionCard(project, o) {
  const score = optionScore(project, o);
  let pillClass = "score-pill mid";
  if (score >= 7) pillClass += " high";
  else if (score < 4) pillClass += " low";

  const nameInput = el("input", { type: "text", value: o.name, placeholder: "方案名称" });
  nameInput.style.marginBottom = "0.5rem";
  nameInput.addEventListener("input", () => {
    o.name = nameInput.value;
    touch(project);
  });

  return el("div", { class: "option-card" }, [
    el("header", {}, [
      el("div", { class: "flex-grow" }, [
        nameInput,
        el("small", { class: "hint" }, ["各维度分数可在上方矩阵中统一编辑，也可在卡片内单独维护（与矩阵同步）。"]),
      ]),
      el("span", { class: pillClass }, [`加权 ${score.toFixed(2)}`]),
    ]),
    fieldBlock("方案说明", o.description, (v) => {
      o.description = v;
      touch(project);
    }),
    el("div", { class: "grid-2" }, [
      fieldBlock("优势 / 机会", o.pros, (v) => {
        o.pros = v;
        touch(project);
      }),
      fieldBlock("劣势 / 威胁", o.cons, (v) => {
        o.cons = v;
        touch(project);
      }),
    ]),
    el("div", { class: "grid-2" }, [
      fieldBlock("主要风险与不确定性", o.risks, (v) => {
        o.risks = v;
        touch(project);
      }),
      fieldBlock("上行空间 / 额外收益可能", o.upside, (v) => {
        o.upside = v;
        touch(project);
      }),
    ]),
    el("details", { style: "margin-top:0.5rem" }, [
      el("summary", { style: "cursor:pointer;color:var(--muted);font-size:0.85rem" }, ["本方案各维度得分"]),
      el("div", { style: "margin-top:0.5rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.5rem" }, [
        ...project.criteria.map((c) => {
          const lab = el("label", {}, [c.name]);
          const inp = el("input", {
            type: "number",
            min: "0",
            max: "10",
            step: "0.5",
            value: String(o.scores?.[c.id] ?? ""),
          });
          inp.addEventListener("change", () => {
            if (!o.scores) o.scores = {};
            o.scores[c.id] = Math.min(10, Math.max(0, Number(inp.value) || 0));
            touch(project);
            renderMain();
          });
          return el("div", {}, [lab, inp]);
        }),
      ]),
    ]),
    el("div", { style: "margin-top:0.75rem;text-align:right" }, [
      el(
        "button",
        {
          class: "btn danger",
          type: "button",
          style: "border-color:var(--danger);color:var(--danger)",
          onclick: () => {
            if (!confirm("确定删除该方案？")) return;
            project.options = project.options.filter((x) => x.id !== o.id);
            touch(project);
            render();
          },
        },
        ["删除方案"]
      ),
    ]),
  ]);
}

function touch(p) {
  p.updatedAt = Date.now();
  save();
}

function render() {
  renderSidebar();
  renderMain();
}

function newProject() {
  const p = defaultProject();
  p.name = "新决策 " + new Date().toLocaleString();
  state.projects.unshift(p);
  state.activeId = p.id;
  save();
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `决策备份-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed.projects && Array.isArray(parsed.projects)) {
        state = { projects: parsed.projects, activeId: parsed.activeId || parsed.projects[0]?.id };
        save();
        render();
        alert("导入成功");
      }
    } catch (e) {
      alert("文件格式无效");
    }
  };
  reader.readAsText(file);
}

document.getElementById("btn-new").addEventListener("click", newProject);
document.getElementById("btn-export").addEventListener("click", exportJson);
document.getElementById("file-import").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (f) importJson(f);
  e.target.value = "";
});

load();
render();
