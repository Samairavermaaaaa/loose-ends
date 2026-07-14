const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'threads.json');

function readThreads() {
  if (!fs.existsSync(DB_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    return [];
  }
}
function writeThreads(threads) {
  fs.writeFileSync(DB_FILE, JSON.stringify(threads, null, 2));
}

const DUCK_SYSTEM = `You are the voice of "Loose Ends" — a sharp, warm rubber-duck thinking partner. Your personality: curious, a little playful, genuinely invested in helping the person think clearly, never condescending. You default to asking clarifying, Socratic questions rather than handing over answers outright — help them reason it out themselves. If they're genuinely stuck on a factual question, give a direct answer, but keep defaulting back to questions. When they make progress, briefly acknowledge it before continuing. Keep responses short: 2-5 sentences, conversational, no headers or bullet lists unless truly needed.`;

app.get('/', (req, res) => {
  res.send('Loose Ends backend is running!');
});

app.get('/threads', (req, res) => {
  res.json(readThreads());
});

app.delete('/threads/:id', (req, res) => {
  const { id } = req.params;
  let threads = readThreads();
  threads = threads.filter(t => t.id !== id);
  writeThreads(threads);
  res.json({ success: true });
});

app.put('/threads/:id', (req, res) => {
  const { id } = req.params;
  const { title, tags, pinned } = req.body;
  const threads = readThreads();
  const thread = threads.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (title !== undefined) thread.title = title;
  if (tags !== undefined) thread.tags = tags;
  if (pinned !== undefined) thread.pinned = pinned;
  writeThreads(threads);
  res.json(thread);
});

app.post('/threads', (req, res) => {
  const { title, tags } = req.body;
  const threads = readThreads();
  const thread = {
    id: Date.now().toString(),
    title: title || 'Untitled thread',
    tags: tags || [],
    status: 'open',
    pinned: false,
    followedUp: false,
    summary: '',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  threads.unshift(thread);
  writeThreads(threads);
  res.json(thread);
});

app.post('/threads/:id/message', async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const threads = readThreads();
  const thread = threads.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  thread.messages.push({ role: 'user', content });

  let system = DUCK_SYSTEM;
  if (thread.summary) {
    system += `\n\nContext from earlier on this thread: ${thread.summary}`;
  }

  const groqMessages = [{ role: 'system', content: system }, ...thread.messages];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: groqMessages })
    });
    const data = await response.json();
    console.log('GROQ RESPONSE:', JSON.stringify(data));
    const reply = data.choices?.[0]?.message?.content || 'No response';
    thread.messages.push({ role: 'assistant', content: reply });
    thread.updatedAt = Date.now();
    writeThreads(threads);
    res.json(thread);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong talking to Groq.' });
  }
});

app.post('/threads/:id/wrapup', async (req, res) => {
  const { id } = req.params;
  const threads = readThreads();
  const thread = threads.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  if (thread.messages.length === 0) return res.json(thread);

  const transcript = thread.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
  const sys = `Summarize this conversation for future recall. Respond with ONLY a JSON object, no markdown fences, no preamble: {"summary": "2-3 sentence recap of the problem and where things stand", "status": "open" or "resolved"}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: transcript }]
      })
    });
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let parsed = {};
    try { parsed = JSON.parse(cleaned); } catch {}
    thread.summary = parsed.summary || thread.summary || '';
    thread.status = parsed.status === 'resolved' ? 'resolved' : 'open';
    writeThreads(threads);
    res.json(thread);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not summarize.' });
  }
});

app.post('/threads/:id/followup', async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;
  const threads = readThreads();
  const thread = threads.find(t => t.id === id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const sys = `You are updating the memory record of a resolved problem-solving thread, based on the user's follow-up answer to "did it actually work out?". Original summary: "${thread.summary}". User's follow-up: "${answer}". Respond with ONLY a JSON object, no markdown fences: {"summary": "updated 2-3 sentence summary that blends the original resolution with this follow-up outcome"}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: answer }]
      })
    });
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    let parsed = {};
    try { parsed = JSON.parse(cleaned); } catch {}
    thread.summary = parsed.summary || thread.summary;
    thread.followedUp = true;
    writeThreads(threads);
    res.json(thread);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not process follow-up.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});