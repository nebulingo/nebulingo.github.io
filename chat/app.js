const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    call: callOpenAI,
    docs: "https://platform.openai.com/docs",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    call: callDeepSeek,
    docs: "https://platform.deepseek.com/docs",
  },
  {
    id: "google",
    label: "Google Gemini",
    call: callGoogle,
    docs: "https://ai.google.dev/models/gemini",
  },
];

const MODEL_PRESETS = {
  standard: {
    label: "Precision",
    description: "Optimized for fast, production-ready chat responses.",
    openai: { model: "gpt-4.1", display: "GPT-4.1 Instant" },
    deepseek: { model: "deepseek-chat", display: "DeepSeek V3.2 Exp" },
    google: { model: "gemini-2.5-flash", display: "Gemini 2.5 Flash" },
  },
  reasoning: {
    label: "Reasoning",
    description: "Maximize deep reasoning and structured thought.",
    openai: { model: "gpt-5", display: "GPT-5 Thinking" },
    deepseek: { model: "deepseek-reasoner", display: "DeepSeek V3.2 Thinking" },
    google: { model: "gemini-2.5-pro", display: "Gemini 2.5 Pro" },
  },
};

const STORAGE_KEYS = {
  api: "multiModelStudio.apiKeys",
  history: "multiModelStudio.history",
};

const state = {
  isLoading: false,
  tripleRun: false,
  mode: "standard",
  conversations: {
    openai: [],
    deepseek: [],
    google: [],
  },
  lastResponses: {
    openai: [],
    deepseek: [],
    google: [],
  },
  transcript: [],
  lastPrompt: "",
};

const el = {
  promptInput: document.getElementById("promptInput"),
  submit: document.getElementById("submitPrompt"),
  clearPrompt: document.getElementById("clearPrompt"),
  tripleRunToggle: document.getElementById("tripleRunToggle"),
  responseGrid: document.getElementById("responseGrid"),
  saveConversation: document.getElementById("saveConversation"),
  historyToggle: document.getElementById("historyToggle"),
  historyPanel: document.getElementById("historyPanel"),
  historyList: document.getElementById("historyList"),
  closeHistory: document.getElementById("closeHistory"),
  settingsToggle: document.getElementById("settingsToggle"),
  settingsPanel: document.getElementById("settingsPanel"),
  closeSettings: document.getElementById("closeSettings"),
  settingsForm: document.getElementById("settingsForm"),
  clearKeys: document.getElementById("clearKeys"),
  overlay: document.getElementById("overlay"),
  openaiKey: document.getElementById("openaiKey"),
  deepseekKey: document.getElementById("deepseekKey"),
  googleKey: document.getElementById("googleKey"),
};

let apiKeys = loadApiKeys();
prefillApiKeyInputs(apiKeys);
renderResponseColumns();
renderHistoryList();

attachEventListeners();

function attachEventListeners() {
  document.querySelectorAll(".mode-pill").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (mode && state.mode !== mode) {
        state.mode = mode;
        document.querySelectorAll(".mode-pill").forEach((pill) => pill.classList.toggle("active", pill.dataset.mode === mode));
        renderResponseColumns();
        showStatus(`${MODEL_PRESETS[mode].label} models armed.`);
      }
    });
  });

  el.submit.addEventListener("click", () => submitPrompt());
  el.promptInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  });

  el.clearPrompt.addEventListener("click", () => {
    el.promptInput.value = "";
    el.promptInput.focus();
  });

  el.tripleRunToggle.addEventListener("change", (event) => {
    state.tripleRun = event.target.checked;
    renderResponseColumns();
  });

  el.saveConversation.addEventListener("click", saveCurrentConversation);

  el.historyToggle.addEventListener("click", () => toggleSidePanel(el.historyPanel, true));
  el.closeHistory.addEventListener("click", () => toggleSidePanel(el.historyPanel, false));

  el.settingsToggle.addEventListener("click", () => toggleSidePanel(el.settingsPanel, true));
  el.closeSettings.addEventListener("click", () => toggleSidePanel(el.settingsPanel, false));

  el.overlay.addEventListener("click", closePanels);

  el.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const keys = {
      openai: el.openaiKey.value.trim(),
      deepseek: el.deepseekKey.value.trim(),
      google: el.googleKey.value.trim(),
    };
    localStorage.setItem(STORAGE_KEYS.api, JSON.stringify(keys));
    apiKeys = keys;
    toggleSidePanel(el.settingsPanel, false);
    showStatus("API keys saved locally.");
  });

  el.clearKeys.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.api);
    apiKeys = { openai: "", deepseek: "", google: "" };
    prefillApiKeyInputs({ openai: "", deepseek: "", google: "" });
    showStatus("API keys cleared.");
  });
}

async function submitPrompt() {
  if (state.isLoading) {
    return;
  }

  const prompt = el.promptInput.value.trim();
  if (!prompt) {
    showStatus("Enter a prompt to get started.");
    el.promptInput.focus();
    return;
  }

  state.isLoading = true;
  el.submit.disabled = true;
  el.tripleRunToggle.disabled = true;
  showStatus("Fetching responses...");

  const runCount = state.tripleRun ? 3 : 1;

  PROVIDERS.forEach((provider) => {
    state.conversations[provider.id].push({ role: "user", content: prompt });
    state.lastResponses[provider.id] = Array.from({ length: runCount }, () => ({
      type: "loading",
      content: "Awaiting response...",
    }));
  });
  renderResponseColumns();

  const results = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const history = state.conversations[provider.id];
      const modelConfig = getActiveModel(provider.id);
      try {
        const outputs = await provider.call({
          messages: history,
          runCount,
          model: modelConfig.model,
          apiKeys,
        });

        const formatted = outputs.length
          ? outputs.map((content, index) => ({
              type: index === 0 ? "primary" : "secondary",
              content,
            }))
          : [
              {
                type: "error",
                content: "No response received.",
              },
            ];

        state.lastResponses[provider.id] = formatted;

        if (formatted[0] && formatted[0].type !== "error") {
          state.conversations[provider.id].push({
            role: "assistant",
            content: formatted[0].content,
          });
        }

        return { provider: provider.id, success: true };
      } catch (error) {
        console.error(error);
        state.lastResponses[provider.id] = [
          {
            type: "error",
            content:
              typeof error === "string"
                ? error
                : error?.message || "Unexpected error fetching response.",
          },
        ];

        state.conversations[provider.id].push({
          role: "assistant",
          content: "[Error: response unavailable]",
        });

        return { provider: provider.id, success: false };
      } finally {
        renderResponseColumns();
      }
    })
  );

  const entry = {
    prompt,
    mode: state.mode,
    timestamp: Date.now(),
    responses: {},
  };

  PROVIDERS.forEach((provider) => {
    const responses = state.lastResponses[provider.id];
    entry.responses[provider.id] = responses.length ? responses[0].content : "";
  });

  state.transcript.push(entry);
  state.lastPrompt = prompt;

  const allSucceeded = results.every((item) => item.success);
  showStatus(allSucceeded ? "Responses ready." : "Some models could not process the request.");

  state.isLoading = false;
  el.submit.disabled = false;
  el.tripleRunToggle.disabled = false;
  el.promptInput.focus();
}

function renderResponseColumns() {
  el.responseGrid.innerHTML = "";
  PROVIDERS.forEach((provider) => {
    const modelConfig = getActiveModel(provider.id);
    const column = document.createElement("article");
    column.className = "model-column";
    column.dataset.model = provider.id;

    const header = document.createElement("div");
    header.className = "model-header";
    const title = document.createElement("div");
    title.className = "model-title";
    title.innerHTML = `<span class="model-lab">${provider.label}</span><span class="model-name">${modelConfig.display}</span>`;
    header.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "model-meta";
    const baseMeta = MODEL_PRESETS[state.mode].label.toUpperCase();
    meta.innerText = state.tripleRun ? `${baseMeta} | TRIPLE RUN` : baseMeta;
    header.appendChild(meta);
    column.appendChild(header);

    const body = document.createElement("div");
    body.className = "model-responses";

    const responses = state.lastResponses[provider.id] || [];
    if (!responses.length) {
      const voidCard = document.createElement("div");
      voidCard.className = "response-void";
      body.appendChild(voidCard);
    } else {
      responses.forEach((item) => {
        const card = document.createElement("div");
        card.classList.add("response-card");

        if (item.type === "loading") {
          card.classList.add("loading-card");
          card.innerText = item.content;
        } else {
          if (item.type === "secondary") {
            card.classList.add("secondary");
          }
          if (item.type === "error") {
            card.classList.add("error-card");
          }
          card.innerText = item.content;
        }
        body.appendChild(card);
      });
    }

    column.appendChild(body);
    el.responseGrid.appendChild(column);
  });
}

function showStatus(message) {
  console.info(message);
}

function saveCurrentConversation() {
  if (!state.transcript.length) {
    showStatus("Nothing to save yet.");
    return;
  }

  const history = loadHistory();
  const entry = {
    id: `session-${Date.now()}`,
    savedAt: Date.now(),
    transcript: cloneState(state.transcript),
    conversations: cloneState(state.conversations),
    lastResponses: cloneState(state.lastResponses),
    tripleRun: state.tripleRun,
    mode: state.mode,
  };
  history.push(entry);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  renderHistoryList();
  showStatus("Session saved locally.");
}

function loadHistory() {
  const raw = localStorage.getItem(STORAGE_KEYS.history);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderHistoryList() {
  const history = loadHistory();
  el.historyList.innerHTML = "";

  if (!history.length) {
    el.historyList.innerHTML = "<p>No saved sessions yet.</p>";
    return;
  }

  history
    .slice()
    .reverse()
    .forEach((session) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const savedAt = new Date(session.savedAt).toLocaleString();
      const headline = session.transcript?.[0]?.prompt?.slice(0, 60) || "Session";
      const turns = session.transcript?.length || 0;
      const mode = MODEL_PRESETS[session.mode || "standard"]?.label || MODEL_PRESETS.standard.label;
      item.innerHTML = `
        <header>
          <strong>${headline}</strong>
          <time datetime="${new Date(session.savedAt).toISOString()}">${savedAt}</time>
        </header>
        <p>${turns} turn(s) | ${mode}</p>
      `;

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const loadButton = document.createElement("button");
      loadButton.type = "button";
      loadButton.className = "ghost-btn small";
      loadButton.innerText = "Load";
      loadButton.addEventListener("click", () => loadSession(session.id));
      actions.appendChild(loadButton);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "ghost-btn small danger";
      deleteButton.innerText = "Delete";
      deleteButton.addEventListener("click", () => deleteSession(session.id));
      actions.appendChild(deleteButton);

      item.appendChild(actions);
      el.historyList.appendChild(item);
    });
}

function deleteSession(id) {
  const history = loadHistory();
  const filtered = history.filter((entry) => entry.id !== id);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(filtered));
  renderHistoryList();
  showStatus("Session removed.");
}

function loadSession(id) {
  const history = loadHistory();
  const session = history.find((item) => item.id === id);
  if (!session) {
    showStatus("Unable to load session.");
    return;
  }

  state.lastResponses = cloneState(
    session.lastResponses || {
      openai: [],
      deepseek: [],
      google: [],
    }
  );
  state.conversations = cloneState(
    session.conversations || {
      openai: [],
      deepseek: [],
      google: [],
    }
  );
  state.tripleRun = Boolean(session.tripleRun);
  el.tripleRunToggle.checked = state.tripleRun;
  state.mode = session.mode || "standard";
  document.querySelectorAll(".mode-pill").forEach((pill) => pill.classList.toggle("active", pill.dataset.mode === state.mode));
  state.transcript = cloneState(session.transcript || []);
  state.lastPrompt = state.transcript[state.transcript.length - 1]?.prompt || "";
  if (state.lastPrompt) {
    el.promptInput.value = state.lastPrompt;
  }

  renderResponseColumns();
  toggleSidePanel(el.historyPanel, false);
  showStatus("Session loaded.");
}

function toggleSidePanel(panel, open) {
  if (open) {
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    updateOverlayState();
  } else {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    updateOverlayState();
  }
}

function closePanels() {
  [el.historyPanel, el.settingsPanel].forEach((panel) => toggleSidePanel(panel, false));
}

function updateOverlayState() {
  const anyOpen = [el.historyPanel, el.settingsPanel].some((panel) => panel.classList.contains("open"));
  el.overlay.hidden = !anyOpen;
}

function getActiveModel(providerId) {
  const preset = MODEL_PRESETS[state.mode] || MODEL_PRESETS.standard;
  return preset[providerId];
}

function loadApiKeys() {
  const raw = localStorage.getItem(STORAGE_KEYS.api);
  if (!raw) return { openai: "", deepseek: "", google: "" };
  try {
    const parsed = JSON.parse(raw);
    return {
      openai: parsed.openai || "",
      deepseek: parsed.deepseek || "",
      google: parsed.google || "",
    };
  } catch {
    return { openai: "", deepseek: "", google: "" };
  }
}

function prefillApiKeyInputs(keys) {
  el.openaiKey.value = keys.openai || "";
  el.deepseekKey.value = keys.deepseek || "";
  el.googleKey.value = keys.google || "";
}

function ensureApiKey(providerId, keys) {
  const key = keys[providerId];
  if (!key) {
    throw new Error("API key missing. Add it in the API Keys panel.");
  }
  return key;
}

async function callOpenAI({ messages, runCount, model, apiKeys }) {
  const key = ensureApiKey("openai", apiKeys);
  const responses = [];

  for (let i = 0; i < runCount; i += 1) {
    const result = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    if (!result.ok) {
      const errorPayload = await safeParseJSON(result);
      const message = errorPayload?.error?.message || result.statusText || "OpenAI request failed.";
      throw new Error(message);
    }

    const data = await result.json();
    const content = data.choices?.[0]?.message?.content || "";
    responses.push(content.trim());
  }

  return responses;
}

async function callDeepSeek({ messages, runCount, model, apiKeys }) {
  const key = ensureApiKey("deepseek", apiKeys);
  const responses = [];

  for (let i = 0; i < runCount; i += 1) {
    const result = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
      }),
    });

    if (!result.ok) {
      const errorPayload = await safeParseJSON(result);
      const message = errorPayload?.error?.message || result.statusText || "DeepSeek request failed.";
      throw new Error(message);
    }

    const data = await result.json();
    const content = data.choices?.[0]?.message?.content || "";
    responses.push(content.trim());
  }

  return responses;
}

async function callGoogle({ messages, runCount, model, apiKeys }) {
  const key = ensureApiKey("google", apiKeys);
  const responses = [];

  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  for (let i = 0; i < runCount; i += 1) {
    const result = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      }
    );

    if (!result.ok) {
      const errorPayload = await safeParseJSON(result);
      const message = errorPayload?.error?.message || result.statusText || "Google request failed.";
      throw new Error(message);
    }

    const data = await result.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim() ||
      "No content returned.";
    responses.push(text);
  }

  return responses;
}

async function safeParseJSON(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function cloneState(fragment) {
  return JSON.parse(JSON.stringify(fragment));
}
