import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:3001';
const STALE_MS = 5 * 60 * 1000;
const FOLLOWUP_MS = 2 * 60 * 1000;

function App() {
  const [threads, setThreads] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [newTags, setNewTags] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('loose-ends-theme') || 'dark');
  const [showStats, setShowStats] = useState(false);
  const [listening, setListening] = useState(false);
  const [followupTarget, setFollowupTarget] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => { loadThreads(); }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('loose-ends-theme', theme);
  }, [theme]);

  const loadThreads = async () => {
    const res = await fetch(`${API}/threads`);
    setThreads(await res.json());
  };

  const createThread = async () => {
    if (!newTitle.trim()) return;
    const tags = newTags.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    const res = await fetch(`${API}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, tags })
    });
    const thread = await res.json();
    setNewTitle('');
    setNewTags('');
    await loadThreads();
    setCurrentId(thread.id);
  };

  const deleteThread = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this thread?')) return;
    await fetch(`${API}/threads/${id}`, { method: 'DELETE' });
    await loadThreads();
  };

  const startEdit = (t, e) => {
    e.stopPropagation();
    setEditingId(t.id);
    setEditValue(t.title || '');
  };

  const saveEdit = async (id) => {
    if (editValue.trim()) {
      await fetch(`${API}/threads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editValue })
      });
      await loadThreads();
    }
    setEditingId(null);
  };

  const togglePin = async (t, e) => {
    e.stopPropagation();
    await fetch(`${API}/threads/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !t.pinned })
    });
    await loadThreads();
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentId) return;
    setLoading(true);
    const content = input;
    setInput('');
    await fetch(`${API}/threads/${currentId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    await loadThreads();
    setLoading(false);
  };

  const wrapUp = async () => {
    if (!currentId) return;
    setLoading(true);
    await fetch(`${API}/threads/${currentId}/wrapup`, { method: 'POST' });
    await loadThreads();
    setLoading(false);
    setCurrentId(null);
  };

  const sendFollowup = async (id, answer) => {
    await fetch(`${API}/threads/${id}/followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer })
    });
    setFollowupTarget(null);
    await loadThreads();
  };

  const exportThread = (thread) => {
    let text = `${thread.title}\n${'='.repeat((thread.title || '').length)}\n\n`;
    if (thread.summary) text += `Summary: ${thread.summary}\n\n`;
    (thread.messages || []).forEach(function(m) {
      text += `${m.role === 'user' ? 'You' : 'Loose Ends'}: ${m.content}\n\n`;
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(thread.title || 'thread').replace(/[^a-z0-9]/gi, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (listening) {
      recognitionRef.current && recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(function(prev) { return prev ? prev + ' ' + transcript : transcript; });
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const currentThread = threads.find(function(t) { return t.id === currentId; });
  const resolvedCount = threads.filter(function(t) { return t.status === 'resolved'; }).length;
  const openCount = threads.filter(function(t) { return t.status === 'open'; }).length;
  const totalMessages = threads.reduce(function(sum, t) { return sum + (t.messages ? t.messages.length : 0); }, 0);
  const avgMessages = threads.length ? Math.round(totalMessages / threads.length) : 0;

  const tagCounts = {};
  threads.forEach(function(t) {
    (t.tags || []).forEach(function(tag) {
      if (!tag) return;
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  const topTags = Object.entries(tagCounts).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 6);
  const maxTagCount = topTags.length ? topTags[0][1] : 1;

  const staleOpen = threads.filter(function(t) {
    return t.status === 'open' && (Date.now() - t.updatedAt) > STALE_MS;
  });
  const dueForFollowup = threads.filter(function(t) {
    return t.status === 'resolved' && !t.followedUp && (Date.now() - t.updatedAt) > FOLLOWUP_MS;
  });

  const filteredThreads = threads
    .filter(function(t) {
      const q = search.toLowerCase();
      const inTitle = (t.title || '').toLowerCase().includes(q);
      const inTags = (t.tags || []).some(function(tag) { return (tag || '').toLowerCase().includes(q); });
      return inTitle || inTags;
    })
    .sort(function(a, b) {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

  if (currentThread) {
    return (
      <div className="app">
        <div className="back-row">
          <button className="back-btn" onClick={() => setCurrentId(null)}>&larr; all threads</button>
          <button className="export-btn" onClick={() => exportThread(currentThread)}>Export</button>
        </div>
        <h1 className="chat-title">{currentThread.title}</h1>
        {currentThread.tags && currentThread.tags.length > 0 && (
          <div className="tags-row">
            {currentThread.tags.map(function(tag, i) {
              return <span key={i} className="tag-chip">{tag}</span>;
            })}
          </div>
        )}
        {currentThread.summary && (
          <div className="recall-banner"><strong>Last time:</strong> {currentThread.summary}</div>
        )}
        <div className="notebook">
          {(currentThread.messages || []).map(function(msg, i) {
            return (
              <div key={i} className={`msg ${msg.role}`}>
                <div className="who">{msg.role === 'user' ? 'you' : 'loose ends'}</div>
                <div className="body">{msg.content}</div>
              </div>
            );
          })}
          {loading && <div className="tagline">thinking…</div>}
        </div>
        <div className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Think out loud…"
          />
          <button className={`mic-btn ${listening ? 'listening' : ''}`} onClick={toggleListening} title="Voice input">
            🎤
          </button>
          <button className="send-btn" onClick={sendMessage} disabled={loading}>Send</button>
        </div>
        <button className="wrap-btn" onClick={wrapUp} disabled={loading}>Wrap up & save to memory</button>
      </div>
    );
  }

  if (showStats) {
    return (
      <div className="app">
        <div className="back-row">
          <button className="back-btn" onClick={() => setShowStats(false)}>&larr; all threads</button>
        </div>
        <h1 className="chat-title">Your patterns</h1>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{threads.length}</div>
            <div className="stat-label">Total threads</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{resolvedCount}</div>
            <div className="stat-label">Resolved</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{openCount}</div>
            <div className="stat-label">Still open</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{avgMessages}</div>
            <div className="stat-label">Avg messages / thread</div>
          </div>
        </div>
        {topTags.length > 0 && (
          <>
            <div className="section-label">Most common tags</div>
            {topTags.map(function([tag, count]) {
              return (
                <div className="tag-bar-row" key={tag}>
                  <div className="tag-bar-label">{tag}</div>
                  <div className="tag-bar-track">
                    <div className="tag-bar-fill" style={{ width: `${(count / maxTagCount) * 100}%` }}></div>
                  </div>
                  <div className="tag-bar-label" style={{ width: '30px', textAlign: 'right' }}>{count}</div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <h1 className="brand">Loose <span>Ends</span></h1>
          <p className="tagline">a thinking partner that remembers where you left off</p>
        </div>
        <div className="topbar-actions">
          <button className="stats-btn" onClick={() => setShowStats(true)}>stats</button>
          <button className="theme-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'light mode' : 'dark mode'}
          </button>
        </div>
      </div>

      {resolvedCount > 0 && (
        <div className="streak">{resolvedCount} loose end{resolvedCount === 1 ? '' : 's'} tied up so far</div>
      )}

      {staleOpen.length > 0 && (
        <div className="nudge-banner">
          <b>Still open:</b> {staleOpen.map(function(t) { return t.title; }).join(', ')} — pick back up whenever you're ready.
        </div>
      )}

      {dueForFollowup.map(function(t) {
        return (
          <div className="followup-banner" key={t.id}>
            <p><b>{t.title}</b> — you marked this resolved a while ago. Did it actually work out?</p>
            {followupTarget === t.id ? (
              <div className="followup-row">
                <button onClick={() => sendFollowup(t.id, 'Yes, it worked out well.')}>Yes, it worked</button>
                <button onClick={() => sendFollowup(t.id, 'No, it did not really work out.')}>Not really</button>
                <button onClick={() => setFollowupTarget(null)}>Skip</button>
              </div>
            ) : (
              <div className="followup-row">
                <button onClick={() => setFollowupTarget(t.id)}>Answer</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="new-row">
        <div className="new-row-fields">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createThread()}
            placeholder="What are you stuck on?"
          />
          <button onClick={createThread}>Start</button>
        </div>
        <input
          value={newTags}
          onChange={(e) => setNewTags(e.target.value)}
          placeholder="Tags, comma separated (optional)"
        />
      </div>

      {threads.length > 0 && (
        <div className="search-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads or tags…"
          />
        </div>
      )}

      {filteredThreads.map(function(t) {
        return (
          <div key={t.id} className={`thread-card ${t.status}`} onClick={() => setCurrentId(t.id)}>
            <div className={`pin ${t.status}`}></div>
            <div className="card-top">
              {editingId === t.id ? (
                <input
                  className="title-input"
                  value={editValue}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit(t.id)}
                  onBlur={() => saveEdit(t.id)}
                />
              ) : (
                <span className="title">
                  {t.title}
                  {t.followedUp && <span className="followed-tag">✓ followed up</span>}
                </span>
              )}
              <div className="card-icons">
                <button className={`pin-star ${t.pinned ? 'active' : ''}`} onClick={(e) => togglePin(t, e)}>★</button>
                <button className="icon-btn" onClick={(e) => startEdit(t, e)}>rename</button>
                <button className="icon-btn" onClick={(e) => deleteThread(t.id, e)}>delete</button>
              </div>
            </div>
            <hr className="stitch" />
            <span className="status">{t.status}</span>
            <div className="summary">{t.summary || 'No recap yet — open to continue.'}</div>
            {t.tags && t.tags.length > 0 && (
              <div className="tags-row">
                {t.tags.map(function(tag, i) {
                  return <span key={i} className="tag-chip on-card">{tag}</span>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default App;