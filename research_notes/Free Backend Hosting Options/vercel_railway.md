# Hosting research: Vercel, Railway, and a free alternative

Research checked 2026-11-12. Provider documentation and official pricing/terms only.

## Vercel Hobby: current cost, limits, and Socket.IO fit

### Takeaway

Vercel Hobby is an ongoing $0 plan today, and Vercel WebSockets are generally available as of 2026-10-20; Vercel’s June 2026 announcement explicitly names Socket.IO as supported. It can fit a small personal app if its backend is packaged as Vercel Functions and clients reconnect at the 5-minute Hobby duration boundary. It does not provide an always-running Express process, and its free plan is not guaranteed for life.

### Cited Findings

- Vercel Hobby is free with no billing cycle. Current included allowances are 1 million Function invocations, 4 Active CPU hours, and 360 GB-hours of provisioned memory per month. If usage limits are exceeded, most features pause until 30 days have passed; Hobby is restricted to personal, non-commercial use. [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- The Hobby maximum Function duration with Fluid Compute is 300 seconds (5 minutes). Vercel Functions terminate at their configured maximum duration. [Hobby plan limits](https://vercel.com/docs/plans/hobby), [Function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration)
- Vercel announced general availability for WebSockets on 2026-10-20. Its earlier launch page gives an Express/Node WebSocket Function example and says higher-level libraries including Socket.IO are supported. WebSockets use the same Function limits and pricing; Active CPU is charged while processing messages, not idle waiting. [WebSocket GA announcement](https://vercel.com/changelog/websocket-support-is-now-generally-available), [Socket.IO support and Express example](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
- A Vercel WebSocket stays pinned to the Function instance that accepted it and closes at the Function’s maximum duration. Clients should reconnect. Shared durable state, presence, rooms, and pub/sub coordination should live outside Function memory. [Vercel real-time guide](https://vercel.com/i/websocket-vs-server-sent-events), [Vercel WebSocket FAQ](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- With Fluid Compute, provisioned memory is billed until the last in-flight request completes; an idle WebSocket avoids active CPU charges but can keep an invocation in flight. The Hobby plan includes 360 GB-hours of memory. [Vercel Function usage and pricing](https://vercel.com/docs/functions/usage-and-pricing), [WebSocket pricing model](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
- Vercel’s Terms say the free Hobby plan is offered at its sole discretion, may be changed or discontinued at any time, and deployments may be disabled or removed. [Vercel Terms, Hobby Plan](https://vercel.com/legal/terms)
- There is a documentation inconsistency: the generic Vercel Limits page still says Functions do not support WebSocket servers, but the later 2026-10-20 changelog announces GA. For current support status, the dated GA announcement and the newer real-time docs are the stronger evidence. [Generic Limits page](https://vercel.com/docs/limits), [GA announcement](https://vercel.com/changelog/websocket-support-is-now-generally-available)

### Inferences

- For one user with light traffic, Vercel is the strongest candidate here for strict $0 hosting, provided the app fits the Hobby rules and usage quotas. This is a current free offering, not a lifetime price guarantee.
- A Socket.IO connection must be able to reconnect at least every five minutes on Hobby. Persist important data in MongoDB; do not rely on process memory for rooms, presence, or cross-user broadcasts. For future multi-user fanout across instances, use a shared pub/sub or Socket.IO adapter such as Redis, because Vercel does not guarantee that future connections reach the same Function.
- The existing API likely needs a Vercel Function-compatible entry point rather than simply launching the existing process with app.listen. Vercel’s sample exports an Express/HTTP server from a Function; verify the project’s actual layout before committing to migration.
- A WebSocket that remains open consumes provisioned-memory allowance while in flight, even though idle wait does not consume Active CPU. Thus, Vercel’s zero price depends on traffic/connection patterns staying within monthly quotas.

### Gaps

- No project-specific deployment or load test was performed. Quota consumption for this app depends on function memory, number and duration of connections, and messages.
- The generic Limits page contradicts the newer GA announcement. The exact Vercel setup for this project’s current Socket.IO server must be proven with a small deployment.
- Vercel does not promise that Hobby will remain free indefinitely; the Terms explicitly reserve the right to change or discontinue it.
- Future public or commercial distribution should be checked against Hobby’s personal/non-commercial eligibility before choosing it as a long-term production host.

## Railway Free and Hobby: current price and persistent Socket.IO suitability

### Takeaway

Railway is a good technical match for a conventional long-running Node/Express plus Socket.IO service, but its current pricing does not meet a strict ongoing $0 requirement: its pricing page labels a Free plan “$0 per month” but says the 30-day $5 trial is followed by $1 per month. The separate Hobby plan has a $5 monthly minimum.

### Cited Findings

- Railway’s pricing page lists a Free plan with up to 1 vCPU, 0.5 GB RAM per service, and 0.5 GB of volume storage. The same plan card says “Start with a 30-day free trial with $5 credits, then $1 per month.” [Railway pricing](https://railway.com/pricing)
- Railway’s pricing page lists Hobby at $5 minimum usage and includes $5 of monthly usage credits; usage beyond those credits is billed. Its FAQ says trial credits are a one-time $5 grant expiring after 30 days and Hobby’s monthly included usage resets each billing cycle. [Railway pricing and FAQ](https://railway.com/pricing)
- Railway’s public networking supports WebSockets over HTTP/1.1. WebSocket connections are exempt from HTTP duration and inactivity limits and may remain open indefinitely, including while idle. [Railway networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits)
- The public price page’s “Free” card and its one-dollar-after-trial line are internally confusing; the same page separately labels Hobby as a $5 minimum. The public facts establish that the post-trial Free card is not strict $0, but do not fully explain whether the $1 is a base fee, minimum usage, or another charge. [Railway pricing](https://railway.com/pricing)

### Inferences

- A conventional always-on service is a more natural fit for the existing Express/Socket.IO server than Vercel Functions: Railway’s transport explicitly permits long-lived WebSockets without a five-minute network timeout. Socket.IO itself uses WebSockets when upgraded, so the protocol support is technically suitable.
- Railway may reduce migration work because the app can keep a normal Node server process, but the ongoing cost cannot be assumed to be $1 total: price depends on service resource usage, and Railway separately describes Hobby as a $5 minimum plan. Confirm the exact current Free plan checkout and expected runtime bill before deployment.
- If a persistent backend is required and the user relaxes the strict $0 constraint, Railway is the simpler technical option between these two. It is not the lifetime-free recommendation.

### Gaps

- Railway’s public pricing page does not explain what the post-trial $1/month covers or precisely how it combines with metered runtime use. The Free label should not be interpreted as free ongoing hosting.
- The cited WebSocket limits page establishes network behavior, not Socket.IO-specific support, restart behavior, or a no-cold-start promise.
- No official source promises Railway pricing will remain unchanged for the lifetime of the app.

## Zero-cost recommendation and Deno Deploy alternative

### Takeaway

No provider can be responsibly described as guaranteeing lifetime $0. Of these candidates, Vercel Hobby is the practical current $0 option for a small, personal backend if the app adapts to its serverless lifecycle and quotas. Deno Deploy currently lists a $0 tier but is scheduled to sunset in April 2027, so it is not a durable alternative. Railway is not strict $0 after its trial.

### Cited Findings

- Deno Deploy Free currently lists 1 million inbound requests/month, 20 GiB egress, 10 hours of Active CPU, and 150 GiB-hours of memory. Idle applications shut down after roughly 20–30 seconds to avoid memory billing. [Deno Deploy pricing](https://deno.com/deploy/pricing)
- Deno Deploy’s runtime docs say the platform is serverless and not always running; apps stop after inactivity. WebSocket connections that actively transmit data, including ping/pong frames, can keep the app alive. [Deno Deploy runtime lifecycle](https://docs.deno.com/deploy/reference/runtime/)
- Deno documents Node.js and npm package compatibility in its runtime. However, Deno Deploy itself is scheduled to sunset in April 2027, and Deno’s docs state existing applications run only until then. [Deno Node/npm compatibility](https://docs.deno.com/runtime/fundamentals/node/), [Deno Deploy sunset notice](https://docs.deno.com/deploy/reference/frameworks/)
- Vercel’s free-tier Terms reserve the right to change or discontinue Hobby. Railway’s current page lists a dollar-per-month post-trial amount. Deno Deploy is scheduled to end. These provider statements show that none of the reviewed plans is a lifetime $0 guarantee. [Vercel Terms](https://vercel.com/legal/terms), [Railway pricing](https://railway.com/pricing), [Deno Deploy sunset notice](https://deno.com/deploy/pricing)

### Inferences

- If strict $0 is the overriding constraint, deploy a small personal version on Vercel Hobby after confirming that the existing server can be adapted and that its reconnect and quota behavior is acceptable. Keep MongoDB credentials on the server and let the mobile app call the API, never MongoDB directly.
- Plan for a migration or paid tier if the app becomes a public, commercial, or multi-user service. Future multi-user live updates require durable shared application data and cross-instance message coordination; the API instance’s in-memory Socket.IO rooms are not enough.
- Deno Deploy is only a short-term experiment candidate, not a sensible foundation when the service is scheduled to end within months.

### Gaps

- “Lifetime free” is a future guarantee no pricing page or terms reviewed here supplies. Prices and plan limits may change, so recheck provider pages before making a deployment decision.
- These notes compare provider-hosting behavior only. They do not establish the price, uptime, or free limits of MongoDB Atlas, Redis, a domain, or any push-notification provider.
