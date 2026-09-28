# Sidekick — Complete Build Instructions for AI

These instructions are written for an AI assistant to rebuild Sidekick from scratch, including all infrastructure. Read everything before starting.

---

## What Sidekick Is

Sidekick is a single-page web app that listens to audio via the browser microphone (or system audio), transcribes speech in real time using the Web Speech API, sends transcript chunks to Claude via a backend proxy, and surfaces AI-generated insights in a live feed. The user can also ask questions about the transcript in a dedicated Ask tab.

The app has 6 modes, each with its own color, prompt, and feed behavior:

| Mode | Color | Purpose |
|------|-------|---------|
| Calm | #7daa80 (green) | Emotional coaching during difficult meetings |
| Thinker | #6a9cbf (blue) | Intellectual sparring — questions, challenges, viewpoints |
| Listener | #c9935a (amber) | Passive capture of lectures, podcasts, YouTube |
| Interview | #9b7fc7 (purple) | Real-time coaching during job/press interviews |
| Brainstorm | #c97faa (pink) | Captures and connects ideas when thinking out loud |
| Debate | #bf6a6a (red) | Devil's advocate — challenges claims, steelmans opposition |

---

## Architecture

```
Browser (sidekick.html)
    |
    | fetch POST (JSON: model, messages)
    v
Cloudflare Worker (calmpilot-proxy)   <-- keeps API key off the device
    |
    | fetch POST with x-api-key header
    v
Anthropic API (claude-sonnet-4-5)
```

The frontend is a single self-contained HTML file. There is no build step, no npm, no framework. Plain HTML, CSS, and vanilla JavaScript.

The backend is a single Cloudflare Worker script (~20 lines) that proxies requests to the Anthropic API and adds CORS headers.

---

## Part 1: Build the Cloudflare Worker Proxy

This must be done before the frontend will work. The proxy keeps the Anthropic API key off the client.

### Step 1: Create the project

```bash
mkdir sidekick-proxy && cd sidekick-proxy && npm init -y && npm install wrangler
```

### Step 2: Create worker.js

Create a file called `worker.js` with exactly this content:

```javascript
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST'
      }
    });
    const body = await request.text();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body
    });
    return new Response(await res.text(), {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    });
  }
}
```

### Step 3: Create wrangler.toml

```toml
name = "sidekick-proxy"
main = "worker.js"
compatibility_date = "2024-01-01"
```

### Step 4: Deploy

```bash
npx wrangler login
npx wrangler deploy
```

When prompted, register a workers.dev subdomain (e.g. `sidekick`). The deployed URL will be something like:

```
https://sidekick-proxy.sidekick.workers.dev
```

### Step 5: Add the Anthropic API key as a secret

```bash
npx wrangler secret put ANTHROPIC_KEY
```

Paste the `sk-ant-...` key when prompted. This stores it securely in Cloudflare — it never touches the frontend.

### Step 6: Test the proxy

```bash
curl -s -X POST https://YOUR-WORKER-URL.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":50,"messages":[{"role":"user","content":"say hi"}]}'
```

You should get back a JSON response with `"content"` containing text. If you get an auth error, re-run `npx wrangler secret put ANTHROPIC_KEY` with a fresh key.

---

## Part 2: Build sidekick.html

This is the entire application. Create a file called `sidekick.html` with the content below.

**Important:** Replace `https://calmpilot-proxy.calmpilot.workers.dev` on the `const PROXY =` line with your actual Cloudflare Worker URL from Part 1.

```html
[PASTE FULL sidekick.html SOURCE HERE — see Part 2 Source below]
```

---

## Part 2 Source: Complete sidekick.html

The following is the complete, current source of sidekick.html. Every character matters. Do not modify it except for the PROXY URL on the line that reads `const PROXY = 'https://calmpilot-proxy.calmpilot.workers.dev';` — replace that URL with your own worker URL.

Key architectural decisions embedded in the source:

- **PROXY constant** (line ~3 of the script block): points to your Cloudflare Worker
- **MODES object**: defines all 6 modes. Each mode has color, c1 (background tint), c2 (border tint), feedLabel, feedHint, txHint, qaHint, showTone, showRules, showRulesFooter, speakerLabel, systemPrompt function, and tipTypes mapping
- **STYLES object**: 5 coaching style options that modify how Claude writes responses
- **S object**: all mutable app state — recording, analyzing, autoAnalyze, transcript array, tips array, rules array, userName, context, tipStyle, sensitivity, mode, txLimit, lastIdx, secs, timerID, recognition, setupRules
- **applyMode()**: called whenever mode changes, updates all CSS custom properties, badge, feed labels, tab visibility, and logo color
- **updateLogoColor()**: updates the SVG logo in the topbar and the favicon dynamically
- **analyze()**: the main AI call — sends last N lines of transcript (controlled by txLimit) plus the mode's systemPrompt to Claude, parses JSON response, adds cards to feed
- **askQuestion()**: separate AI call for the Ask tab — sends transcript + user question, streams response as a chat bubble
- **commitBuffer()**: inside startListen(), buffers speech recognition interim results and commits them as a line after 3.5 seconds of silence
- **getContextLines()**: returns last txLimit lines of transcript (or all lines if txLimit is 0)

---

## Part 3: Deploy to GitHub Pages

This gives you a public HTTPS URL, which is required for microphone access in Chrome.

### If starting fresh:

```bash
# Create a repo on GitHub first, then:
git init
git add sidekick.html
git commit -m "Initial Sidekick"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Then enable GitHub Pages: repo Settings → Pages → Source: Deploy from branch → Branch: main → folder: / (root) → Save.

Your app will be live at: `https://YOUR-USERNAME.github.io/YOUR-REPO/sidekick.html`

### To update an existing repo via GitHub API (no local git needed):

```bash
# Get current SHA of the file
SHA=$(gh api repos/OWNER/REPO/contents/sidekick.html --jq '.sha')

# Push updated file
gh api repos/OWNER/REPO/contents/sidekick.html \
  -X PUT \
  -f message="Update Sidekick" \
  -f sha="$SHA" \
  -f "content=$(base64 -i sidekick.html)"
```

Note: on macOS, `base64` requires the `-i` flag. On Linux, use `-w 0` to prevent line wrapping.

---

## Part 4: System Audio Setup (Mac)

To capture audio from YouTube, podcasts, Zoom calls etc. rather than just the microphone:

1. Install BlackHole: `brew install blackhole-2ch` then reboot
2. Open Audio MIDI Setup (Spotlight search)
3. Click + → Create Multi-Output Device
4. Check both BlackHole 2ch and your regular speakers/headphones
5. Right-click the Multi-Output Device → Use This Device For Sound Output
6. In System Settings → Sound → Output, select the Multi-Output Device
7. In Chrome, when Sidekick asks for mic permission, select BlackHole 2ch as the input

Now everything playing on your Mac feeds into Sidekick.

### Windows equivalent:

1. Right-click speaker icon → Sound settings → More sound settings → Recording tab
2. Right-click in the list → Show Disabled Devices
3. Right-click Stereo Mix → Enable → Set as Default Device
4. Open Sidekick in Chrome or Edge — it will pick up system audio automatically

---

## Part 5: Feature Reference

### Modes and what each does

**Calm** — Watches emotional dynamics. Returns tips typed as: alert (hostile moment detected), reminder (surface a user rule), quote (grounding philosophical quote, used sparingly), insight (coaching observation). Also returns a tone object with calm/tension/focus/reactivity scores and 5 emotion percentages. Tone tab is visible only in this mode.

**Thinker** — Watches content and logic. Returns tips typed as: question (sharp question the user could ask right now), challenge (logical gap or unexamined assumption), viewpoint (alternative perspective not yet raised), insight (strategic observation).

**Listener** — Passive capture mode. Speaker label is "Audio" not "You". Returns tips typed as: keypoint (important claim or fact), summary (synthesis of what was just covered), definition (a term explained), example (a concrete example given). Designed for lectures, YouTube, podcasts.

**Interview** — Coaches the user's spoken answers. Returns tips typed as: strength (something done well), weakness (gap or missed opportunity), pivot (better framing), suggestion (what to say next).

**Brainstorm** — Captures and connects ideas spoken aloud. Returns tips typed as: idea (specific idea worth capturing), theme (recurring pattern), connection (non-obvious link), gap (something not yet considered).

**Debate** — Devil's advocate mode. Returns tips typed as: counter (direct counterargument), steelman (strongest opposing view), fallacy (logical error spotted), evidence (undermining fact or consideration).

### Bottom bar controls

- **Waveform animation** — shows live/idle/paused state
- **Status text** — current mic state
- **Auto ✓ / Auto off toggle** — controls whether analysis runs automatically. When on, analysis fires every 8 seconds after new speech (scheduleAuto) and also on a longer interval (40s medium, 20s high sensitivity)
- **Analyze now** — manual trigger, always available when session is active
- **Start/Stop listening** — main session toggle

### Settings tab controls

- **Mode** — shows current mode with a button to reopen setup modal
- **Behavioral rules** — only visible in Calm mode. Add/delete rules that get injected into the system prompt
- **Your name** — how you appear in transcript
- **AI response style** — concise, gentle, stoic, coach, or academic. Appended to every system prompt
- **Auto-analyze frequency** — low (manual only), medium (40s interval), high (20s interval)
- **Lines sent to AI per call** — 25, 50, 100, or full transcript. Controls cost
- **Trim transcript** — removes old lines from memory and DOM, resets lastIdx accordingly

### Ask tab

A chat interface. User types a question, it goes to Claude with the current transcript as context and the current mode name in the system prompt. Responses appear as chat bubbles. The Ask tab works in all modes and is the primary interface in Listener mode.

---

## Part 6: Known Limitations and Future Work

**Transcription quality**: The Web Speech API works well for direct speech into a microphone. For system audio (YouTube, Zoom), accuracy drops significantly. The intended future upgrade is OpenAI Whisper, which records audio in chunks via the Web Audio API, sends them to the Whisper endpoint, and returns much more accurate transcripts. Whisper costs ~$0.006/minute.

**Single speaker**: The Web Speech API does not do speaker diarization. All transcribed speech is attributed to one speaker (either "You" or "Audio" depending on mode). A future upgrade would use Whisper + a diarization service to label multiple speakers.

**Session persistence**: Transcript and tips are in-memory only. Refreshing the page loses everything. Export to .txt is the only persistence mechanism currently. Future work: save sessions to localStorage or a backend.

**API cost**: Each Analyze call sends up to txLimit lines to Claude Sonnet (~$0.003-0.01 per call). Each Ask call is similar. A one-hour meeting with Auto on and Medium sensitivity costs roughly $0.15-0.30 total.

**Browser support**: Transcription requires Chrome or Edge (Web Speech API). The rest of the app works in any browser but without transcription it falls back to demo mode.

---

## Part 7: Troubleshooting

**"Could not reach the AI"** — The Cloudflare Worker isn't responding. Check the worker URL in the PROXY constant, verify the worker is deployed (`npx wrangler deploy`), and verify the ANTHROPIC_KEY secret is set (`npx wrangler secret list`).

**"invalid x-api-key"** — The Anthropic key stored in the worker is wrong or expired. Get a fresh key from console.anthropic.com and run `npx wrangler secret put ANTHROPIC_KEY` again.

**"model not found"** — The model string is wrong. Use `claude-sonnet-4-5` (not claude-sonnet-4-20250514 or other variants). Test with the curl command in Part 1 Step 6.

**No mic permission prompt** — The page is being served from `file://` rather than `https://`. Must be on localhost or a real HTTPS URL. Use `python3 -m http.server 8080` in the directory and open `http://localhost:8080/sidekick.html`.

**Transcription not working** — Browser must be Chrome or Edge. Check that the correct input device is selected (padlock icon in address bar → Microphone). For system audio on Mac, BlackHole must be set as the input and a Multi-Output Device must be set as system output.

**Mode selection highlights multiple cards** — This was a bug where inline styles weren't being cleared. The fix is in `selectMode()`: loop all cards, remove `selected` class and clear `style.borderColor`, `style.background`, and `mc-name` color before applying to the chosen card.

**Logo not changing color** — `updateLogoColor()` must be defined before `applyMode()` in the script. If `applyMode` is called on init and `updateLogoColor` isn't defined yet, it silently fails.

---

## Part 8: The Complete sidekick.html Source

Copy everything between the triple backticks below into a file named `sidekick.html`. Then replace the PROXY URL.

```
[The AI building this should fetch the current source from:
https://raw.githubusercontent.com/colorlessgreenideas/groundwork/main/sidekick.html
That is the canonical, always-current version.]
```

If the GitHub URL is not accessible, the source can be reconstructed from these specifications:

1. A single HTML file, no external JS dependencies except Google Fonts
2. Dark theme with CSS custom properties for all colors
3. CSS grid layout: topbar (48px) / columns (1fr) / bottom bar (58px)
4. Columns: left (1fr, transcript/tone/ask/settings tabs) / right (270px, feed sidebar)
5. All state in a single `const S = {}` object
6. All modes in a single `const MODES = {}` object
7. All styles in a single `const STYLES = {}` object
8. No state persistence (in-memory only)
9. The PROXY constant must be set to the Cloudflare Worker URL
10. The model string must be `claude-sonnet-4-5`
