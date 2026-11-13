# Study Planner

A spaced-revision study planner. Add what you studied, and the app schedules
when to revise each topic (by default after 4, 7, 15, 30, 60 and 90 days),
tracks what is due today, and keeps mock-test scores. It consists of an
Android app and an Express + MongoDB API.

## Running the API locally

```sh
cp apps/api/.env.example apps/api/.env   # then fill in the values
npm install
npm run build:shared
npm run dev -w @planner/api
```

Set `DEV_GOOGLE_STUB=true` in `.env` to sign in locally with
`dev:<sub>:<email>` tokens. With the server running, `npm run smoke -w
@planner/api` exercises the main flow end to end.

## Tests

```sh
npm test              # all workspaces
npm run typecheck
npm run lint
```

See `CLAUDE.md` for the repository layout and working rules.
