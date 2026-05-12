const characterInput = document.getElementById('character-input');
const scenarioInput = document.getElementById('scenario-input');
const feedbackArea = document.getElementById('feedback-area');
const feedbackFooter = document.getElementById('feedback-footer');
const statusBadge = document.getElementById('status-badge');
const charCount = document.getElementById('char-count');
const scenarioCharCount = document.getElementById('scenario-char-count');

let debounceTimer = null;
let currentController = null;

function setStatus(state, text) {
  statusBadge.className = 'status-badge' + (state ? ` ${state}` : '');
  statusBadge.textContent = text;
}

function showPlaceholder() {
  feedbackArea.innerHTML = `
    <div class="feedback-placeholder">
      <div class="placeholder-icon">💭</div>
      <p>キャラクター設定とシナリオを入力すると、<br />キャラクターからのフィードバックがここに表示されます。</p>
    </div>`;
}

function showLoading() {
  feedbackArea.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <span>フィードバックを生成中…</span>
    </div>`;
}

function showError(message) {
  feedbackArea.innerHTML = `<div class="error-message">⚠️ ${message}</div>`;
  setStatus('error', 'エラー');
}

async function fetchFeedback(characterSettings, scenario) {
  if (currentController) {
    currentController.abort();
  }
  currentController = new AbortController();

  setStatus('loading', '生成中…');
  showLoading();
  feedbackFooter.textContent = '';

  let feedbackDiv = null;
  let buffer = '';
  let started = false;

  try {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterSettings, scenario }),
      signal: currentController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'サーバーエラーが発生しました。' }));
      showError(err.error || 'サーバーエラーが発生しました。');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    setStatus('streaming', 'ストリーミング中');

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });

      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        if (parsed.error) {
          showError(parsed.error);
          return;
        }

        if (parsed.content) {
          if (!started) {
            feedbackArea.innerHTML = '<div class="feedback-content"></div>';
            feedbackDiv = feedbackArea.querySelector('.feedback-content');
            started = true;
          }
          buffer += parsed.content;
          feedbackDiv.textContent = buffer;

          // streaming cursor
          const existing = feedbackDiv.querySelector('.cursor');
          if (existing) existing.remove();
          const cursor = document.createElement('span');
          cursor.className = 'cursor';
          feedbackDiv.appendChild(cursor);

          feedbackArea.scrollTop = feedbackArea.scrollHeight;
        }
      }
    }

    // remove cursor on done
    if (feedbackDiv) {
      const cursor = feedbackDiv.querySelector('.cursor');
      if (cursor) cursor.remove();
    }

    setStatus('done', '完了');
    feedbackFooter.textContent = `生成完了 ${new Date().toLocaleTimeString('ja-JP')}`;
  } catch (err) {
    if (err.name === 'AbortError') return;
    showError('通信エラーが発生しました。サーバーが起動しているか確認してください。');
  } finally {
    currentController = null;
  }
}

function scheduleFeedback() {
  clearTimeout(debounceTimer);

  const character = characterInput.value.trim();
  const scenario = scenarioInput.value.trim();

  if (!character || !scenario) {
    setStatus('', '待機中');
    if (!character && !scenario) showPlaceholder();
    return;
  }

  setStatus('loading', '入力待機中…');

  debounceTimer = setTimeout(() => {
    fetchFeedback(character, scenario);
  }, 2000);
}

characterInput.addEventListener('input', () => {
  charCount.textContent = characterInput.value.length.toLocaleString();
  scheduleFeedback();
});

scenarioInput.addEventListener('input', () => {
  scenarioCharCount.textContent = scenarioInput.value.length.toLocaleString();
  scheduleFeedback();
});
