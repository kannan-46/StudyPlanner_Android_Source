# Hosting Alternatives: Railway vs Google Cloud Run

Checked 2026-11-12. Scope: a small Node.js/Express API with Socket.IO and MongoDB Atlas for one Android user at first, with possible later multi-user growth. All factual findings below cite provider documentation; recommendations are inferences from those findings.

## 1. Price, India regions, and deployment setup

### Takeaway

Railway is the lower-friction setup for a novice: connect a GitHub repository, deploy it, and get a Railway HTTPS domain. Cloud Run can be inexpensive on usage, and offers Mumbai and Delhi regions, but takes more Google Cloud account, billing, project, CLI/API setup; its published free tier should not be treated as “all features free.”

### Cited Findings
- Railway lists Free at $0/month with $1/month resource credit, Hobby at $5/month, and Pro at $20/month; paid subscription amounts count toward usage. Railway lists container RAM at $10/GB-month, CPU at $20/vCPU-month, and network egress at $0.05/GB. [Railway pricing plans](https://docs.railway.com/pricing/plans)
- Railway services can be created from GitHub; linked branches automatically build and deploy new commits. [Railway services](https://docs.railway.com/services)
- Railway's current deployment-region list has Singapore as its Asia-Pacific region. [Railway regions](https://docs.railway.com/deployments/regions)
- Cloud Run pricing is usage-based; its instance-billing free tier lists the first 240,000 vCPU-seconds and 450,000 GiB-seconds per month, based on us-central1 pricing. The pricing page lists Mumbai (`asia-south1`) and Delhi (`asia-south2`) among available regions, and says prices vary by region and billing configuration. [Cloud Run pricing](https://cloud.google.com/run/pricing)
- Google's Node.js quickstart requires an account, Google Cloud CLI installation/initialization, project selection or creation, and billing enabled; source deployment can build automatically and then show a service URL. [Cloud Run Node.js quickstart](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service)
- Cloud Run can deploy from source with buildpacks/Cloud Build, but requires enabling APIs and granting required roles. [Deploy from source](https://docs.cloud.google.com/run/docs/deploying-source-code)

### Inferences
- For a beginner who values a short path from code to a hosted API, Railway's GitHub connection is the simpler workflow.
- Cloud Run's India regions may reduce network distance for an India-based user compared with Railway's listed Singapore deployment region, but actual latency depends on the user's network and Atlas cluster location.
- Cloud Run's free CPU/RAM quotas can cover some small workloads, but do not imply that a WebSocket connection or the extra fixed-egress network resources are free.

### Gaps
- Exact monthly cost cannot be established without the selected CPU/RAM, time spent with a Socket.IO connection open, data transfer, region, Atlas location, and any fixed-egress configuration.
- Currency conversion and taxes are not estimated; provider billing pages quote USD and note that local-currency SKU prices may apply.

## 2. Socket.IO, HTTPS, and idle behavior

### Takeaway

Both providers support secure public endpoints and WebSockets. Railway is a better match for a persistent Socket.IO connection because its edge permits WebSockets to remain open indefinitely; Cloud Run closes WebSocket requests at a configurable timeout of at most 60 minutes, so the mobile client must reconnect.

### Cited Findings
- Railway's public-networking specification supports WebSockets over HTTP/1.1, says WebSockets are exempt from request duration and inactivity limits and may stay open indefinitely, and requires TLS 1.2 or above for inbound traffic. [Railway networking specs](https://docs.railway.com/networking/public-networking/specs-and-limits)
- Railway-provided domains can be generated in service settings; custom domains receive automatically provisioned SSL certificates and work over HTTPS. [Railway domains](https://docs.railway.com/networking/domains/working-with-domains)
- Cloud Run supports WebSockets without extra configuration, but its WebSocket requests follow the request timeout (default 5 minutes, maximum 60 minutes); Google instructs clients to reconnect after disconnection/timeouts. [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets) and [Cloud Run request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout)
- Cloud Run considers an instance with an open WebSocket active and bills it with instance-based billing. [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)
- Cloud Run provides an HTTPS endpoint for each service; services are private by default, and a mobile-facing public API must be configured for unauthenticated service invocation or provide supported Google identity credentials. Application-level user authentication is still needed for a mobile API. [HTTPS endpoint](https://docs.cloud.google.com/run/docs/triggering/https-request) and [authentication overview](https://docs.cloud.google.com/run/docs/authenticating/overview)
- Railway Serverless sleep requires no outbound packets for at least five minutes; active database connections or network traffic can keep a service awake. Sleeping can add cold-start delay, and the first request may return 502. [Railway Serverless](https://docs.railway.com/deployments/serverless)

### Inferences
- For this app, disable Railway Serverless at first or validate its behavior carefully: a persistent Socket.IO session and the Atlas connection are inconsistent with reliable sleep, while waking a slept service could add delay or a transient 502.
- Keep one API replica initially so in-memory Socket.IO broadcasts have one process; when scaling to multiple instances, add a shared Socket.IO adapter/pub-sub layer. Cloud Run explicitly documents that instances do not coordinate their WebSocket data by default. [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)
- With Cloud Run, normal REST use can scale down when idle, but any active Socket.IO connection consumes billed instance time and is forcibly interrupted at the configured timeout. For one user who needs live updates, this behavior adds reconnect and cost-management details.

### Gaps
- The exact socket reconnection experience depends on the React Native Socket.IO client options and app lifecycle behavior; those implementation details were not reviewed here.

## 3. MongoDB Atlas network access and recommendation

### Takeaway

Recommend starting with Railway Pro for this project. It combines the shortest novice deployment path with static outbound IPs that can be allowlisted in Atlas, while preserving long-lived Socket.IO connections. The tradeoff is a $20/month Pro subscription and a Singapore deployment region. Cloud Run is a credible alternative with India regions and usage pricing, but secure fixed egress requires extra VPC/Cloud NAT setup and separately billed networking resources.

### Cited Findings
- Atlas only permits client connections from addresses on the project's IP access list. MongoDB warns that `0.0.0.0/0` allows access from anywhere and recommends restricting entries to trusted IPs where possible. [Atlas IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
- Railway offers permanent outbound IPv4 addresses for services on the Pro plan specifically for third-party services such as MongoDB Atlas that require IP allowlisting. The Pro plan costs $20/month; its subscription counts toward resource usage. [Railway static outbound IPs](https://docs.railway.com/networking/static-outbound-ips) and [Railway pricing plans](https://docs.railway.com/pricing/plans)
- Railway static outbound IPs can prevent Serverless sleep and may be shared with other Railway customers; they change if the deployment region changes. [Railway static outbound IPs](https://docs.railway.com/networking/static-outbound-ips)
- By default, Cloud Run uses a dynamic regional pool of outbound IPs. Google documents that a static egress IP requires routing all outbound traffic through a VPC and Cloud NAT with a reserved static IP. [Cloud Run static outbound IP](https://docs.cloud.google.com/run/docs/configuring/static-outbound-ip)
- Cloud NAT has gateway-hour, processed-data, and external-IP charges. Its current published rate for up to 32 assigned VM instances is $0.0014 per instance-hour, $0.045/GiB processed, and $0.005 per external-IP-hour; network egress can add charges. [Google Cloud NAT pricing](https://cloud.google.com/vpc/network-pricing)

### Inferences
- Railway Pro is the most practical first deployment for this novice user if they accept the $20/month subscription. The $20 is a usage commitment/credit rather than necessarily $20 of compute on top, though usage above that amount is extra.
- Set Atlas's IP allowlist to the Railway service's static outbound address(es), keep the Atlas database password only in the API's server-side secret/configuration, and implement app authentication before exposing data to the Android app.
- For Cloud Run, a static IP plus Cloud NAT is the safer Atlas integration than a broad Atlas allowlist, but building and paying for VPC egress/NAT is extra operational work for a single-user first release.
- Use one deployment replica while Socket.IO state remains in memory. For future horizontal scale/multiple users across replicas, plan a shared Socket.IO adapter or message broker in addition to Atlas data storage.

### Gaps
- This recommendation assumes Railway's current $20 Pro tier is acceptable and that Singapore is an acceptable initial app-server region. If minimizing monthly baseline cost or placing the API in India is the overriding constraint, Cloud Run with a VPC/NAT setup merits a separate cost/configuration estimate.
- Railway documents static outbound IPv4 as potentially shared among its customers; Atlas network allowlisting alone is not user authentication. Keep DB credentials private and use narrowly scoped Atlas database access.
