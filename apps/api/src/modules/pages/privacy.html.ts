export const PAGE_STYLES = `
body{font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1f2937}
h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:1.6rem}a{color:#2563eb}
`;

/** Public URL prefix: Vercel rewrites /api/server/* to /*. */
export function publicBasePath(env: NodeJS.ProcessEnv): string {
  return env.VERCEL ? '/api/server' : '';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderPrivacyPage(contactEmail: string | null): string {
  const contact = contactEmail
    ? `Email <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>.`
    : "Contact the developer through the app's listing.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Study Planner — Privacy Policy</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
<h1>Study Planner — Privacy Policy</h1>
<h2>What we collect</h2>
<p>When you sign in with Google we receive your name, email address and profile picture (the openid, email and profile scopes only). We store your name, email address and profile picture URL, together with the study data you create in the app: exams, subjects, topics, revision schedules, mock tests and your settings.</p>
<h2>How we use it</h2>
<p>Your data is used only to run the app: to sign you in and keep your study plan available on your devices. Reminders are scheduled on your device by the app; our server does not send reminders or push notifications. We do not sell your data, show ads or run analytics.</p>
<h2>Where it is stored</h2>
<p>Your data is stored in a database hosted on MongoDB Atlas. The API is served over HTTPS by Vercel.</p>
<h2>Deleting your data</h2>
<p>You can delete your account and all of its data at any time in the app using Delete account (in Settings). You can also request deletion using the contact details below.</p>
<h2>Contact</h2>
<p>${contact}</p>
</body>
</html>
`;
}
