# Loose Ends 🦆

A rubber-duck thinking partner that remembers where you left off.

🔗 **Live app:** https://loose-ends-yc93.vercel.app/

## What it does
Start a "thread" whenever you're stuck on something — a bug, a decision, a half-formed idea. Loose Ends asks clarifying questions to help you think it through (instead of just handing over answers), and remembers your progress across sessions so you never lose context.

## Features
- Persistent memory across sessions with AI-generated recaps
- Tags, pinning, search
- Follow-up loop: checks back in on resolved threads to see if they actually worked out
- Voice input, stats dashboard, custom Y2K theming, drag-and-drop stickers

## Tech stack
- Frontend: React + Vite
- Backend: Node.js + Express
- AI: Groq API (GPT-OSS 120B)
- Storage: JSON file
- Deployed on Render (backend) + Vercel (frontend)