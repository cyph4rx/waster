# Wäster

Run the app with Node.js 22 or newer. It uses Node's built-in HTTP server and has no package dependencies.

## Run locally

In PowerShell, open this folder and run:

```powershell
$groqSecret = Read-Host 'Groq API key' -AsSecureString
$env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $groqSecret).Password
node server.mjs
```

Open http://127.0.0.1:3000. The app connects automatically using the server's key. Click the model badge to change models or pause the background.

## Host on the web

Use a host that runs a Node process and streams responses. Set the start command to `node server.mjs` and configure these environment variables on the host:

- `GROQ_API_KEY` — your Groq API key, stored as a server secret.
- `WASTER_PASSWORD` — a separate strong password for site access.
- `HOST` — `0.0.0.0`.
- `PORT` — use the port provided by the host, or leave the default of 3000.

Open the host's HTTPS URL, click **Sign in**, and enter `WASTER_PASSWORD`. The sign-in stays inside Wäster and grants access to model requests, which use your Groq account. The session is kept in memory and ends when you reload the page or after 12 hours. Use HTTPS for any non-local access. Static-only hosting cannot run the Groq connection.

## Google Sites

1. Push this folder to your Git repository and deploy it as a [free Render Web Service](https://render.com/docs/your-first-deploy). Use `npm install` to build, `npm start` to start, and set the server environment variables above in Render.
2. In Google Sites, choose **Pages → + → Full page embed** and paste the Render HTTPS URL. To embed in an existing page, use **Insert → Embed → By URL**. Publish the changes. [Google Sites embed instructions](https://support.google.com/sites/answer/90569)
3. Open the published page and sign in inside the embedded Wäster app with your site password.

The picker shows each model's published context window. Wäster caps replies at 4,096 tokens and sends the newest conversation messages that fit its conservative context estimate. Older messages remain visible in the conversation.
