import { PAGE_STYLES } from './privacy.html';

export function renderHomePage(basePath = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Study Planner</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
<h1>Study Planner</h1>
<p>Study Planner is a spaced-revision planner that schedules when to revisit each topic you study.</p>
<p><a href="${basePath}/privacy">Privacy Policy</a></p>
</body>
</html>
`;
}
