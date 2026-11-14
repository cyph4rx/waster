<div align="center">
  <h1>W<strong>ä</strong>ster</h1>
  <p>the water waster</p>
  <p>
    <img alt="Node.js 22" src="https://img.shields.io/badge/Node.js-22-333333?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white&amp;labelColor=161616">
    <img alt="AI via Groq" src="https://img.shields.io/badge/AI-Groq-333333?style=flat-square&amp;labelColor=161616">
    <img alt="Code highlighting by Prism" src="https://img.shields.io/badge/Code-Prism-333333?style=flat-square&amp;labelColor=161616">
  </p>
</div>

Wäster is a simple AI chat with a moving dotted background and a small message bar. Pick a model, send a message, and copy code straight from the reply.

- Switch between Qwen 3.8 27B, GPT-OSS 20B, and GPT-OSS 120B. The picker shows how much context each model can hold.
- Replies stream in as the model writes. Code gets its own box with syntax colors and a **Copy** button.
- Click the model badge to pause the background.

## Run it locally

You need Node.js 22 and a [Groq API key](https://console.groq.com/keys). Open this folder in PowerShell and run:

```powershell
$groqSecret = Read-Host 'Groq API key' -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $groqSecret).Password
npm start
```

Open [localhost:3000](http://127.0.0.1:3000). Wäster connects using the key you just set.

## Put it online for free

Push this folder to GitHub and connect it to a [free Render Web Service](https://render.com/docs/your-first-deploy). Set the build command to `npm install` and the start command to `npm start`.

| Render setting | Value |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `GROQ_API_KEY` | Your Groq key |
| `WASTER_PASSWORD` | A separate password for signing in to Wäster |

Add the key and password in Render’s **Environment** settings so they stay on the server. Open your Render HTTPS URL and click **Sign in**. Render’s free service can take a minute to wake up after sitting idle. [Render free limits](https://render.com/docs/free)

## Give the AI a personality

Add `WASTER_PERSONALITY` in Render’s **Environment** settings, then save and redeploy. It applies to every model in the picker. Leave it empty to use the models’ usual behavior.

> You are Wäster. Be casual, direct, and a little dry. Keep simple answers short. When you give code, put it in fenced code blocks and explain what to change.

For local use, run `$env:WASTER_PERSONALITY = 'Your personality instructions here'` in PowerShell before starting the server. Start a new chat to try it without earlier replies shaping the conversation.

## Use it in Google Sites

Go to **Pages → + → Full page embed**, paste your Render URL, and publish. For an existing page, use **Insert → Embed → By URL**.

Sign in with `WASTER_PASSWORD` inside the chat. It stays on the Google Sites page. [Google Sites embed guide](https://support.google.com/sites/answer/90569)

### Chat limits

Replies are capped at 4,096 tokens. If the chat gets too long, Wäster sends the newest messages that fit its context estimate. You can still scroll back to see the older ones.
