// Website chat assistant. Sends questions to the n8n Chat Trigger (Embedded Chat mode),
// streams the reply into the panel, and keeps the conversation while the visitor moves between pages.
(() => {
  const root = document.getElementById('chat-assistant');
  const endpoint = root?.dataset.endpoint;
  if (!root || !endpoint) return;

  const STORE_KEY = 'poplar-chat';
  const MAX_SAVED = 40;
  const SUGGESTIONS = ["I'd like to book an appointment", 'Are you taking new NHS patients?', 'I have toothache. What should I do?'];
  const REPLY_TIMEOUT = 90000;
  const SLOW_AFTER = 7000;
  const FAILED = "Sorry, I can't answer right now. Please call the practice on 0121 771 3720. In an emergency, call 999.";

  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const loadState = () => {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch { return null; }
  };
  const state = loadState() || { sessionId: newId(), messages: [], open: false };
  const saveState = () => {
    state.messages = state.messages.slice(-MAX_SAVED);
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private browsing: the chat still works */ }
  };

  root.innerHTML = `
    <button class="chat-launcher" type="button" aria-expanded="false" aria-controls="chat-panel">
      <svg class="icon" aria-hidden="true"><use href="#i-chat"/></svg><span>Ask a question</span>
    </button>
    <section class="chat-panel" id="chat-panel" role="dialog" aria-labelledby="chat-title" hidden>
      <header class="chat-panel__header">
        <div>
          <h2 id="chat-title">Ask Poplar Dental</h2>
          <p>Automated answers from our website</p>
        </div>
        <button class="chat-close" type="button" aria-label="Close chat"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button>
      </header>
      <div class="chat-log">
        <div class="chat-notice">
          <p>I'm an automated assistant. I can answer questions about the practice and book an appointment for you.</p>
          <p>Please don't share medical details here. In an emergency, call 999.</p>
        </div>
        <div class="chat-messages" aria-live="polite"></div>
        <div class="chat-suggestions"></div>
      </div>
      <form class="chat-form">
        <label class="visually-hidden" for="chat-input">Your question</label>
        <textarea id="chat-input" rows="1" maxlength="500" placeholder="Type your question" autocomplete="off"></textarea>
        <button class="chat-send" type="submit" aria-label="Send"><svg class="icon" aria-hidden="true"><use href="#i-send"/></svg></button>
      </form>
    </section>`;

  const launcher = root.querySelector('.chat-launcher');
  const panel = root.querySelector('.chat-panel');
  const log = root.querySelector('.chat-log');
  const list = root.querySelector('.chat-messages');
  const suggestions = root.querySelector('.chat-suggestions');
  const form = root.querySelector('.chat-form');
  const input = root.querySelector('#chat-input');
  const sendButton = root.querySelector('.chat-send');
  let busy = false;

  // ---------- Safe, minimal Markdown: paragraphs, bullet lists, **bold** and links ----------
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = (url, text) => {
    const internal = url.startsWith(window.location.origin) || /poplar-dental-sparkhill\.netlify\.app|poplardentalsparkhill\.co\.uk/.test(url);
    return `<a href="${url}"${internal ? '' : ' target="_blank" rel="noopener"'}>${text}</a>`;
  };
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, text, url) => link(url, text))
    .replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+[^\s<).,])/g, (_, before, url) => before + link(url, url))
    .replace(/(^|[^\d])(0121 771 3720)/g, '$1<a href="tel:+441217713720">$2</a>');
  const renderMarkdown = (text) => {
    let html = '';
    let inList = false;
    for (const raw of escapeHtml(text).split('\n')) {
      const line = raw.trim();
      const item = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
      if (item) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${inline(item[1])}</li>`;
        continue;
      }
      if (inList) { html += '</ul>'; inList = false; }
      if (line) html += `<p>${inline(line)}</p>`;
    }
    return inList ? `${html}</ul>` : html;
  };

  // ---------- Messages ----------
  const scrollToEnd = () => { log.scrollTop = log.scrollHeight; };
  const addBubble = (role, text) => {
    const bubble = document.createElement('div');
    bubble.className = `chat-msg chat-msg--${role}`;
    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = role === 'user' ? 'You said: ' : 'Assistant: ';
    const body = document.createElement('div');
    body.className = 'chat-msg__body';
    if (role === 'user') body.textContent = text;
    else body.innerHTML = renderMarkdown(text);
    bubble.append(label, body);
    list.append(bubble);
    scrollToEnd();
    return body;
  };

  const renderSuggestions = () => {
    suggestions.innerHTML = '';
    if (state.messages.length) return;
    for (const text of SUGGESTIONS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chat-chip';
      chip.textContent = text;
      chip.addEventListener('click', () => ask(text));
      suggestions.append(chip);
    }
  };

  // The Chat Trigger streams newline-separated JSON ({ type: 'item', content }); without streaming
  // it returns a single { output } object. Both shapes are handled.
  const readReply = async (response, onText) => {
    let text = '';
    let raw = '';
    let buffer = '';
    const handle = (line) => {
      if (!line.trim()) return;
      let data;
      try { data = JSON.parse(line); } catch { return; }
      if (data.type === 'item' && typeof data.content === 'string') text += data.content;
      else if (typeof data.output === 'string') text = data.output;
      else if (data.type === 'error') throw new Error('Assistant error');
      onText(text);
    };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      raw += chunk;
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handle);
    }
    handle(buffer);
    if (!text) raw.split(/(?<=\})\s*(?=\{)/).forEach(handle);
    return text;
  };

  async function ask(question) {
    const text = question.trim();
    if (!text || busy) return;
    busy = true;
    sendButton.disabled = true;
    state.messages.push({ role: 'user', text });
    addBubble('user', text);
    renderSuggestions();
    saveState();

    const reply = addBubble('bot', '');
    reply.parentElement.classList.add('is-pending');
    reply.innerHTML = '<span class="chat-typing"><span class="chat-typing__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="chat-typing__text" role="status">Typing</span></span>';
    scrollToEnd();
    const slowTimer = setTimeout(() => {
      const status = reply.querySelector('.chat-typing__text');
      if (status) status.textContent = 'Still working on it';
    }, SLOW_AFTER);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPLY_TIMEOUT);
    let answer = '';
    let partialText = '';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sendMessage', sessionId: state.sessionId, chatInput: text }),
      });
      if (!response.ok || !response.body) throw new Error(`Assistant replied ${response.status}`);
      answer = await readReply(response, (partial) => {
        // The stream opens with an empty "begin" message: keep the typing dots until real text arrives.
        if (!partial) return;
        partialText = partial;
        reply.parentElement.classList.remove('is-pending');
        reply.innerHTML = renderMarkdown(partial);
        scrollToEnd();
      });
      if (!answer) throw new Error('Empty reply');
    } catch {
      answer = partialText ? `${partialText}\n\n${FAILED}` : FAILED;
      reply.innerHTML = renderMarkdown(answer);
    }
    clearTimeout(slowTimer);
    clearTimeout(timeout);
    reply.parentElement.classList.remove('is-pending');
    state.messages.push({ role: 'bot', text: answer });
    saveState();
    busy = false;
    sendButton.disabled = false;
    scrollToEnd();
  }

  // ---------- Open, close and input ----------
  const setOpen = (open, { focus = true } = {}) => {
    state.open = open;
    panel.hidden = !open;
    launcher.hidden = open;
    launcher.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('chat-open', open);
    saveState();
    if (!focus) return;
    if (open) { input.focus(); scrollToEnd(); } else launcher.focus();
  };

  launcher.addEventListener('click', () => setOpen(true));
  root.querySelector('.chat-close').addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    input.style.height = '';
    ask(text);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = '';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });

  for (const message of state.messages) addBubble(message.role, message.text);
  renderSuggestions();
  if (state.open) setOpen(true, { focus: false });
})();
