# Render free backend hosting

## Free-tier limits and idle behavior

### Takeaway
Render can run the project's Node/Express API on its free Web Service plan, but the free instance is small and may sleep, restart, or be suspended at usage limits. Render describes free instances as for hobby/testing/preview use and explicitly advises against production use.

### Cited Findings
- Render supports free Web Services for Node.js apps and says free instances are intended for testing, hobby projects, and previews, not production applications. [Render: Deploy for Free](https://render.com/docs/free)
- The free Web Service compute plan provides 0.1 CPU and 512 MB RAM. [Render: Compute Plans](https://render.com/docs/compute-plans)
- A workspace receives 750 free instance hours per calendar month, shared by its free services. Spun-down services do not consume hours; if the limit is exhausted, all free Web Services in the workspace are suspended until the next month. [Render: Deploy for Free](https://render.com/docs/free)
- A free Web Service spins down after 15 minutes without inbound HTTP requests or WebSocket messages. Waking it on a request or a new WebSocket connection takes about one minute. [Render: Deploy for Free](https://render.com/docs/free)
- Free Web Services have ephemeral local filesystems, cannot use persistent disks, cannot scale beyond one instance, and may be restarted by Render at any time. [Render: Deploy for Free](https://render.com/docs/free)
- Outbound bandwidth and build pipeline minutes have included amounts. If the workspace exceeds them, Render may bill when a payment method is attached; without one, services can be suspended or new builds paused for the rest of the month. Render also reserves the right to suspend unusually high service-initiated public traffic, including traffic to external databases. [Render: Deploy for Free](https://render.com/docs/free)

### Inferences
- For one low-traffic account, the 0.1 CPU / 512 MB service could be adequate for basic API requests, but this is an inference and should be checked with actual API memory/latency metrics.
- If the app is unused long enough for the service to sleep, its first API call after reopening can be delayed by roughly a minute. A daily call can wake it, but it does not guarantee it stays warm all day.

### Gaps
- The free bandwidth and build-minute quota is account/workspace-specific in the dashboard; the public docs refer users to the dashboard for current included amounts.

## Socket.IO and WebSocket fit

### Takeaway
Render supports public WebSocket connections, so it is compatible with the project's Socket.IO API. Connections can be interrupted by sleep, deployment, maintenance, or instance replacement, so the client must reconnect and the server must not rely on in-memory session state surviving.

### Cited Findings
- Render Web Services accept inbound public WebSocket connections. Render imposes no fixed maximum connection duration, but the connection closes when its instance shuts down or is replaced. [Render: WebSockets](https://render.com/docs/websocket)
- Instance shutdown sends `SIGTERM` and gives the process 30 seconds to shut down gracefully; this can be configured up to 300 seconds. [Render: WebSockets](https://render.com/docs/websocket)
- Free Web Services now count inbound WebSocket messages as activity for the 15-minute sleep timer (a change documented in Render's February 24, 2026 changelog). [Render changelog](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages)
- Render recommends keepalives and client reconnection with exponential backoff because connections can drop, and clients are not guaranteed to reconnect to the same instance. [Render: WebSockets](https://render.com/docs/websocket)
- The free Web Service plan cannot scale beyond one instance. [Render: Deploy for Free](https://render.com/docs/free)

### Inferences
- Socket.IO is a better fit than a pure serverless platform for this API's existing live-update path. The app can reconnect when it resumes, but the free service may sleep after the app disconnects, causing a cold start on the next open.
- A single user and one free instance avoid multi-instance Socket.IO coordination for now; this does not remove sleep/restart interruptions.

### Gaps
- The exact sleep behavior for the project's Socket.IO heartbeat cadence depends on its client/server ping traffic. Render documents that inbound WebSocket messages reset the idle timer but does not guarantee a connection stays live while a mobile app is backgrounded.

## MongoDB Atlas connectivity and IP restrictions

### Takeaway
A Render Free Web Service can make outbound database connections, and Atlas supports IP/CIDR allowlists. Render's normal outbound ranges are shared by all services in the same region; dedicated outbound IPs require a paid Pro workspace and an additional fee.

### Cited Findings
- Render assigns region-specific outbound IP ranges and notes that each range is shared across all Render services in that region. The service's applicable ranges are shown in its dashboard. [Render: Outbound IP Addresses](https://render.com/docs/outbound-ip-addresses)
- Dedicated outbound IPs require a Pro workspace plan or higher and cost extra. [Render: Dedicated IPs](https://render.com/docs/dedicated-ips)
- Atlas only accepts connections from entries in the project's IP access list, which can be a single address or a CIDR range. [MongoDB Atlas: Configure IP Access List Entries](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- Atlas recommends least-scope access; adding a `/0` range such as `0.0.0.0/0` triggers an alert to project users. [MongoDB Atlas: Configure IP Access List Entries](https://www.mongodb.com/docs/atlas/security/ip-access-list/)

### Inferences
- To connect safely, the Render service can use its region's documented shared CIDR ranges in the Atlas IP access list, with a least-privilege database user and the URI stored only in Render environment variables. This is broader at the network layer than dedicated IP allowlisting because other Render services in that region share the ranges.
- Do not solve a Render IP allowlist problem by setting Atlas to `0.0.0.0/0` for a production database.

### Gaps
- The exact outbound CIDRs are service/region-specific and must be copied from the Render dashboard after deployment; they are not a single fixed range listed on the general docs page.

## Free-tier permanence and reliability

### Takeaway
Render currently has a no-monthly-fee Hobby workspace and a free compute plan, but its official materials do not promise a lifetime-free production service. Render presents free compute as hobby/preview use and its terms reserve the right to change the service or usage limits.

### Cited Findings
- The currently published free quota is recurring, not a one-time trial credit: 750 instance hours per workspace per calendar month, reset monthly. The Hobby workspace has no monthly fee, while free instances have separate compute/usage limits. [Render: Deploy for Free](https://render.com/docs/free); [Render: Platform Features by Plan](https://render.com/docs/platform-features-by-plan)
- Render says free instances should not be used for production applications. [Render: Deploy for Free](https://render.com/docs/free)
- Render's Terms of Service say Render may change the service, stop providing the service or its features, or create usage limits. [Render Terms of Service](https://render.com/terms)

### Inferences
- Render is a reasonable no-cost prototype or early personal-use host, but it does not satisfy a strict “free forever with production-grade availability” requirement. If the app becomes relied on daily, the owner should expect a possible paid migration or a different host.

### Gaps
- No official lifetime-free guarantee was found. The free offering and its limits should be rechecked before deployment because Render can change service features and usage limits.

