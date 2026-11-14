<div align="center">
  <h1>W<strong>ä</strong>ster</h1>
  <p>the water waster</p>
  <p>
    <img alt="Node.js 22.12+" src="https://img.shields.io/badge/Node.js-22.12%2B-333333?style=flat-square&amp;logo=nodedotjs&amp;logoColor=white&amp;labelColor=161616">
    <img alt="AI via Groq" src="https://img.shields.io/badge/AI-Groq-333333?style=flat-square&amp;labelColor=161616">
    <img alt="Code highlighting by Prism" src="https://img.shields.io/badge/Code-Prism-333333?style=flat-square&amp;labelColor=161616">
  </p>
</div>

Wäster is a simple AI chat with a moving dotted background. Pick Qwen or GPT-OSS, watch replies stream in, and copy code straight from the chat.

## Run it locally

You need Node.js 22.12 or newer and a [Groq API key](https://console.groq.com/keys). Open this folder in PowerShell and run:

```powershell
$groqSecret = Read-Host 'Groq API key' -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $groqSecret).Password
npm start
```

Open [localhost:3000](http://127.0.0.1:3000).

## Deploy to Cloudflare Workers

Run these commands from this folder:

```powershell
npm ci
npx wrangler login
npm run deploy
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put WASTER_PASSWORD
```

Enter your Groq key and a separate site password when prompted. Open the `workers.dev` URL and sign in with that password.

## Give the AI a personality

Run `npx wrangler secret put WASTER_PERSONALITY` and paste your instructions. For local use, set `$env:WASTER_PERSONALITY` before running `npm start`.

## Use it in Google Sites

Go to **Pages → + → Full page embed**, paste your `workers.dev` URL, and publish. [Google Sites embed guide](https://support.google.com/sites/answer/90569)
