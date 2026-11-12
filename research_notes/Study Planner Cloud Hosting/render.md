# Render as the API Host

## Can Render host the Node.js API and Socket.IO live updates?

### Takeaway
Render is a good fit for one Node.js/Express web service that exposes normal HTTPS API routes and Socket.IO on the same HTTP server. Use Render's HTTPS endpoint and `wss://` for mobile clients; build client reconnection and server keepalive handling because deploys, maintenance, or network issues can end a socket.

### Cited Findings
- Render web services accept public inbound WebSocket connections, and Render recommends `wss://` for public internet clients. It does not impose a maximum WebSocket duration, but connections can be interrupted by shutdowns or network/platform events; clients and servers should send keepalives and clients should reconnect. [Render WebSockets](https://render.com/docs/websocket)
- Render routes public HTTP and WebSocket traffic to one service port. Web services should bind to `0.0.0.0` and use the `PORT` environment variable (default `10000`). [Render Web Services](https://render.com/docs/web-services)
- Render gives services free managed TLS for their `onrender.com` hostname and custom domains, redirects HTTP to HTTPS, and automatically renews custom-domain certificates. [Render TLS](https://render.com/docs/tls)
- A custom domain is optional: Render issues a certificate once the domain is verified. [Render Custom Domains](https://render.com/docs/custom-domains)
- The deployment path is to connect a Git repository as a Render Web Service, select Node, provide the build/start commands (for example `npm install` and `npm start`), and let pushes to the linked branch deploy automatically. Store credentials in Render environment variables rather than committed configuration. [Node/Express quickstart](https://render.com/docs/deploy-node-express-app), [Environment variables and secrets](https://render.com/docs/configure-environment-variables)
- Render sends `SIGTERM` on instance shutdown with 30 seconds to close gracefully (extendable to 300 seconds). The load balancer assigns new WebSocket connections randomly among service instances. [Render WebSockets](https://render.com/docs/websocket)

### Inferences
- One Render Web Service can serve the REST API and Socket.IO together; there is no need to pay for separate API and WebSocket processes at the initial scale.
- The mobile app should call `https://<service>.onrender.com` for API requests and `wss://<service>.onrender.com` for Socket.IO. Keep the Atlas URI and credentials only on the server, in Render's environment settings.

### Gaps
- The project repository's exact backend folder and npm scripts were not inspected in this host-only assignment; confirm its root directory/build/start commands before deployment.

## Can Render reach MongoDB Atlas securely, and which region should be used?

### Takeaway
Render can make outbound connections to external systems, and Atlas can restrict cluster access by IP/CIDR. For an economical start, allowlist the Render service's displayed shared outbound CIDR ranges in Atlas; dedicated egress IPs exist but are disproportionately expensive for this app.

### Cited Findings
- Render services use outbound IP ranges that are shared by services in the same region. The exact ranges for a service are shown in its Dashboard under Connect → Outbound. Dedicated outbound IP sets are available when fixed egress IPs are required. [Render outbound IP addresses](https://render.com/docs/outbound-ip-addresses)
- Atlas only permits cluster client connections from entries in the project's IP access list, which accepts individual IPs or CIDR ranges. Atlas supports up to 200 access-list entries per project. [MongoDB Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- Render lists Oregon, Ohio, Virginia, Frankfurt, and Singapore as service regions. Region is chosen at service creation; changing an existing service's region requires creating a replacement and migrating configuration/data. [Render regions](https://render.com/docs/regions)
- Dedicated IPs require a Pro workspace or higher and Render bills $100/month for each set of three IPv4 addresses. [Render dedicated IPs](https://render.com/docs/dedicated-ips), [Render changelog](https://render.com/changelog/add-dedicated-outbound-ips-to-your-workspace)
- Render's private network is for Render services in the same region; a Render service in one region cannot privately reach Render services in another region. [Render regions](https://render.com/docs/regions)

### Inferences
- If the user is in India, Singapore is the closest of Render's currently listed regions and is the sensible first region to evaluate for latency. Choose a nearby Atlas cluster region as well, subject to Atlas's available cloud/region choices; the Render-to-Atlas connection will use the public network, secured by TLS and Atlas's IP access list.
- For the initial deployment, add the service's outbound CIDR ranges from the Render Dashboard to Atlas. Avoid `0.0.0.0/0`; it removes the IP-level restriction. Dedicated IPs are not a cost-effective MVP choice at $100/month plus the required Pro workspace.
- Recheck the outbound ranges in Render after creating the service and compare their count with Atlas's access-list limit before launch.

### Gaps
- The live outbound ranges are specific to the created Render service and cannot be listed in advance; they must be copied from the account Dashboard. The selected Atlas cloud provider and cluster region are not yet known.

## What plan is practical, and what changes as the app grows?

### Takeaway
Use Free only for a temporary preview. For a responsive single-user app expected to remain online, begin with one paid Starter web service (current plan ID `0.5c-512mb`), listed at $7/month, and keep MongoDB Atlas as the persistent database. Revisit compute sizing and Socket.IO fan-out only when usage grows.

### Cited Findings
- Render's Free service sleeps after 15 minutes without inbound traffic and takes about a minute to wake; paid compute plans do not spin down. Free services can be restarted at any time, are intended for testing/hobby use rather than production, and have other limits such as no horizontal scaling. [Render Free services](https://render.com/docs/free), [Render FAQ](https://render.com/docs/faq)
- The current Render pricing page lists the `0.5c-512mb` web-service plan at $7/month (0.5 CPU, 512 MB RAM); Render's compute-plan documentation maps the legacy Starter name to this same plan ID and says the specs/pricing are identical. [Render pricing](https://render.com/pricing), [Render compute plans](https://render.com/docs/compute-plans)
- Render bills compute per service, and each instance uses the selected plan when scaling out. [Render pricing FAQ](https://render.com/pricing), [Render compute plans](https://render.com/docs/compute-plans)
- When running multiple Socket.IO servers, Socket.IO requires a non-default adapter for cross-server event broadcasts; sticky sessions are still required when HTTP long-polling is enabled. [Socket.IO adapters](https://socket.io/docs/v4/adapter), [Socket.IO Redis adapter](https://socket.io/docs/v4/redis-adapter)
- Render's load balancer assigns WebSocket connections randomly across instances. [Render WebSockets](https://render.com/docs/websocket)
- Render's pricing page lists contractual uptime SLAs among Enterprise features, rather than as a standard feature of the starter service. [Render pricing](https://render.com/pricing)

### Inferences
- Start with one paid web-service instance in Singapore, a Render-provided `onrender.com` HTTPS/WSS hostname, MongoDB Atlas in a nearby available region, and an Atlas allowlist containing the service's Render egress CIDRs. Expected base API hosting compute is about $7/month at the pricing page's current rate, before usage-based charges; no custom domain is needed to get HTTPS.
- One instance is enough for a small initial user base and avoids Socket.IO cross-instance coordination. If scaling horizontally later, add a shared Socket.IO adapter (commonly Redis) and ensure the chosen transport/load-balancing behavior supports session affinity where needed.
- The published features support the requested stack, but the plan is not a contractual high-availability guarantee. If contractual uptime becomes a requirement, review Render's Enterprise SLA terms or compare providers before launch.

### Gaps
- Pricing and plan names can change; confirm the displayed plan and total workspace/service charges in Render before committing to a budget. The current materials reviewed do not specify a numerical uptime commitment for the Starter service.
