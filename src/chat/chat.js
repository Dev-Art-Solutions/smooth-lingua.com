(function () {
  'use strict';

  var API_BASE = (window.SMOOTH_LINGUA_API_BASE || '').replace(/\/$/, '');
  var CONVERSATION_KEY = 'smoothlingua.demo.conversationId';

  function api(path) {
    return API_BASE + path;
  }

  function getOrCreateConversationId() {
    var id;
    try {
      id = sessionStorage.getItem(CONVERSATION_KEY);
    } catch (e) {
      id = null;
    }
    if (!id) {
      id = 'demo-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
      try { sessionStorage.setItem(CONVERSATION_KEY, id); } catch (e) { /* ignore */ }
    }
    return id;
  }

  function resetConversationId() {
    try { sessionStorage.removeItem(CONVERSATION_KEY); } catch (e) { /* ignore */ }
    return getOrCreateConversationId();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function confidenceClass(c) {
    if (c < 0.4) return 'low';
    if (c < 0.7) return 'mid';
    return '';
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  var chatLog = document.getElementById('chat-log');
  var chatForm = document.getElementById('chat-form');
  var chatInput = document.getElementById('chat-input');
  var chatReset = document.getElementById('chat-reset');

  function appendUserMessage(text) {
    var div = document.createElement('div');
    div.className = 'chat-msg user';
    div.innerHTML = '<span class="bubble">' + escapeHtml(text) + '</span>';
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function appendBotMessage(messages, intentName, confidence) {
    var div = document.createElement('div');
    div.className = 'chat-msg bot';
    var body = (messages && messages.length ? messages : ['(no reply)']).map(escapeHtml).join('<br>');
    var pct = Math.round(confidence * 100);
    var cls = confidenceClass(confidence);
    div.innerHTML =
      '<span class="bubble">' + body + '</span>' +
      '<span class="meta">' +
      '<span class="badge badge-secondary">' + escapeHtml(intentName) + '</span>' +
      'confidence' +
      '<span class="confidence-bar"><span class="fill ' + cls + '" style="width:' + pct + '%"></span></span>' +
      pct + '%' +
      '</span>';
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function appendError(text) {
    var div = document.createElement('div');
    div.className = 'chat-msg bot';
    div.innerHTML = '<span class="bubble" style="background:#f8d7da;color:#721c24">' + escapeHtml(text) + '</span>';
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    appendUserMessage(text);

    var id = getOrCreateConversationId();
    fetch(api('/conversations/' + encodeURIComponent(id) + '/messages'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      appendBotMessage(data.messages, data.intentName, typeof data.confidence === 'number' ? data.confidence : 0);
    }).catch(function (err) {
      appendError('Could not reach the agent: ' + err.message);
    });
  });

  chatReset.addEventListener('click', function () {
    var id = getOrCreateConversationId();
    fetch(api('/conversations/' + encodeURIComponent(id) + '/reset'), { method: 'POST' })
      .finally(function () {
        resetConversationId();
        chatLog.innerHTML = '';
      });
  });

  // ── Playground ──────────────────────────────────────────────────────────────

  var playgroundIntents = document.getElementById('playground-intents');
  var playgroundForm = document.getElementById('playground-form');
  var playgroundInput = document.getElementById('playground-input');
  var playgroundResult = document.getElementById('playground-result');
  var playgroundAdd = document.getElementById('playground-add-intent');

  function renderIntentRow(name, examples) {
    var wrap = document.createElement('div');
    wrap.className = 'playground-intent';
    wrap.innerHTML =
      '<div class="form-row align-items-center mb-2">' +
      '<div class="col">' +
      '<input type="text" class="form-control form-control-sm intent-name" placeholder="Intent name" value="' +
      escapeHtml(name) + '">' +
      '</div>' +
      '<div class="col-auto">' +
      '<button type="button" class="btn btn-sm btn-link text-danger remove-intent">remove</button>' +
      '</div>' +
      '</div>' +
      '<textarea class="form-control form-control-sm intent-examples" rows="3" ' +
      'placeholder="One example per line">' + escapeHtml(examples) + '</textarea>';

    wrap.querySelector('.remove-intent').addEventListener('click', function () {
      wrap.parentNode.removeChild(wrap);
    });
    playgroundIntents.appendChild(wrap);
  }

  // Seed the playground with a sensible starting point.
  renderIntentRow('Greeting', 'Hello\nHi\nHey there');
  renderIntentRow('Bye', 'Goodbye\nBye\nSee you');

  playgroundAdd.addEventListener('click', function () {
    renderIntentRow('', '');
  });

  function collectIntents() {
    var result = [];
    var rows = playgroundIntents.querySelectorAll('.playground-intent');
    for (var i = 0; i < rows.length; i++) {
      var name = rows[i].querySelector('.intent-name').value.trim();
      var examples = rows[i].querySelector('.intent-examples').value
        .split(/\r?\n/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; });
      if (!name || examples.length === 0) continue;
      result.push({ name: name, examples: examples });
    }
    return result;
  }

  playgroundForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = playgroundInput.value.trim();
    var intents = collectIntents();

    if (intents.length < 2) {
      showPlaygroundResult('Add at least two intents with examples.', true);
      return;
    }
    if (!text) return;

    fetch(api('/playground/predict'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intents: intents, text: text })
    }).then(function (r) {
      return r.json().then(function (body) { return { ok: r.ok, body: body }; });
    }).then(function (resp) {
      if (!resp.ok) {
        showPlaygroundResult((resp.body && resp.body.error) || 'Request failed.', true);
        return;
      }
      var pct = Math.round(resp.body.confidence * 100);
      var cls = confidenceClass(resp.body.confidence);
      showPlaygroundResult(
        'Predicted intent: <strong>' + escapeHtml(resp.body.intentName) + '</strong>' +
        ' <span class="confidence-bar"><span class="fill ' + cls + '" style="width:' + pct + '%"></span></span>' +
        ' ' + pct + '% confidence',
        false
      );
    }).catch(function (err) {
      showPlaygroundResult('Could not reach the playground: ' + err.message, true);
    });
  });

  function showPlaygroundResult(html, isError) {
    playgroundResult.classList.remove('d-none', 'alert-info', 'alert-danger');
    playgroundResult.classList.add(isError ? 'alert-danger' : 'alert-info');
    playgroundResult.innerHTML = html;
  }

  // ── Insights ────────────────────────────────────────────────────────────────

  var insightsRefresh = document.getElementById('insights-refresh');
  var insightsSummary = document.getElementById('insights-summary');
  var insightsIntents = document.getElementById('insights-intents');

  function loadInsights() {
    fetch(api('/insights')).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (snap) {
      insightsSummary.innerHTML = [
        card('Messages', snap.totalMessages),
        card('Conversations', snap.totalConversations),
        card('Fallback rate', formatPct(snap.fallbackRate)),
        card('Avg confidence', formatPct(snap.averageConfidence)),
        card('Avg turns / conv.', snap.averageConversationLength.toFixed(2))
      ].join('');

      insightsIntents.innerHTML = (snap.intents || []).map(function (i) {
        var pct = Math.round(i.averageConfidence * 100);
        var cls = confidenceClass(i.averageConfidence);
        return '<tr>' +
          '<td>' + escapeHtml(i.intentName) + '</td>' +
          '<td class="text-right">' + i.count + '</td>' +
          '<td class="text-right">' +
          '<span class="confidence-bar"><span class="fill ' + cls + '" style="width:' + pct + '%"></span></span> ' +
          pct + '%' +
          '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="3" class="text-muted text-center">No turns recorded yet.</td></tr>';
    }).catch(function (err) {
      insightsSummary.innerHTML = '<div class="col-12 text-danger">Could not load insights: ' +
        escapeHtml(err.message) + '</div>';
    });
  }

  function card(label, value) {
    return '<div class="col-md mb-2"><div class="insights-card">' +
      '<div class="value">' + escapeHtml(String(value)) + '</div>' +
      '<div class="label">' + escapeHtml(label) + '</div>' +
      '</div></div>';
  }

  function formatPct(v) {
    return Math.round((v || 0) * 100) + '%';
  }

  insightsRefresh.addEventListener('click', loadInsights);

  // Auto-load insights the first time the tab is shown.
  var insightsLoaded = false;
  $('a[data-toggle="tab"][data-tabname="insights"]').on('shown.bs.tab', function () {
    if (!insightsLoaded) {
      insightsLoaded = true;
      loadInsights();
    }
  });
})();
