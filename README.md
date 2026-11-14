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

Open the host's HTTPS URL and sign in as `waster` with `WASTER_PASSWORD`. Sign-in grants access to the site and its model requests, which use your Groq account. Use HTTPS for any non-local access. Static-only hosting cannot run the Groq connection.

## Google Sites

Google Sites can display a hosted URL. The Node server that connects to Groq needs a separate host, such as Google Cloud Run.

1. In Google Cloud, create or select a project with billing enabled. Follow the [Cloud Run Node.js quickstart](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service) from this folder. The included `package.json` gives the Node buildpack its start command.
2. Create two [Secret Manager secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets), `waster-groq-key` and `waster-password`. Grant the Cloud Run service account Secret Manager Secret Accessor on both. Use a separate, strong password for Wäster.
3. Deploy from this folder with the command below. It assumes both secrets are at version 1. Cloud Run supplies `PORT`; the server uses its own password prompt.

   ```sh
   gcloud run deploy waster --source . --allow-unauthenticated --set-env-vars HOST=0.0.0.0 --set-secrets GROQ_API_KEY=waster-groq-key:1,WASTER_PASSWORD=waster-password:1
   ```

4. Open the HTTPS URL that Cloud Run prints, sign in as `waster`, and send a test message.
5. In Google Sites, choose **Pages → + → Full page embed**, paste the HTTPS URL, then publish. You can also use **Insert → Embed** to put it inside an existing page. If the browser blocks the embedded password prompt, add an **Open Wäster** button that links directly to the Cloud Run URL. See [Google Sites embed instructions](https://support.google.com/sites/answer/90569).

The picker shows each model's published context window. Wäster caps replies at 4,096 tokens and sends the newest conversation messages that fit its conservative context estimate. Older messages remain visible in the conversation.
