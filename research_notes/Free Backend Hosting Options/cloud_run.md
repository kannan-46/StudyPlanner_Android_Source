# Google Cloud Run for the Study Planner API (checked 2026-11-12)

## What the free tier includes, and what could cost money

### Takeaway

Cloud Run has ongoing monthly no-cost usage quotas, but it is not a promise of lifetime $0 hosting. For an API that uses WebSockets, the instance-based quota is the more relevant quota. A linked billing account is required for a normal user-managed Cloud Run project, so usage beyond free quotas or separately billed deployment/network services can incur charges.

### Cited Findings

- Cloud Run lists two monthly no-cost usage schedules: request-based billing includes 180,000 vCPU-seconds, 360,000 GiB-seconds of memory, and 2 million requests; instance-based billing includes 240,000 vCPU-seconds and 450,000 GiB-seconds of memory. These quotas are based on us-central1 prices, aggregate across projects on a billing account, and reset monthly. [Cloud Run pricing](https://cloud.google.com/run/pricing)
- Cloud Run lists Mumbai (asia-south1) as a supported region. Free quota amounts are stated in the pricing page, while actual prices vary by region and billing model. [Cloud Run pricing](https://cloud.google.com/run/pricing)
- The pricing page's 1 GiB/month no-cost outbound internet data transfer allowance is scoped to North America. Do not assume it covers an app serving users in India. [Cloud Run pricing](https://cloud.google.com/run/pricing)
- A source deployment can use Cloud Build and Artifact Registry; these are separately metered services with their own free allowances and potential charges. Network egress and usage beyond Cloud Run's free quotas can also be billed. [Cloud Run pricing](https://cloud.google.com/run/pricing)

### Inferences

- A typical small API can plausibly remain within Cloud Run's compute/request quotas, but that does not prove its total bill will be $0: long-lived sockets, data egress, builds, and stored container images must also be considered.
- There is no Google commitment in these quota descriptions that the free quota or product pricing will remain unchanged forever. Treat this as current ongoing free usage subject to Google's pricing terms, not a lifetime-price guarantee.

### Gaps

- Exact monthly cost cannot be estimated without the API's CPU/memory settings, hours with active sockets, region, response sizes, deployment frequency, and retained image storage.
- Cloud Billing account setup and payment method requirements may vary with account/country; confirm during project setup.

## Billing account and scale-to-zero

### Takeaway

A regular user-managed Cloud Run deployment needs a linked Cloud Billing account even when expected usage fits the no-cost quotas. With minimum instances set to zero, this Node API can scale down to zero while idle and start on the next request, with a possible cold-start delay.

### Cited Findings

- Google's documentation says deploying a web app to Cloud Run in a user-managed Google Cloud project requires a billing account. The separate Starter Tier is restricted to eligible personal projects and is Google-managed; it should not be assumed to be available for this existing API. [Google Cloud Starter Tier](https://docs.cloud.google.com/docs/starter-tier)
- Cloud Run services can scale to zero when idle. A request arriving after scale-to-zero can incur startup latency. [What is Cloud Run?](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)
- Minimum instances can keep instances ready to reduce cold starts, but ready instances can incur charges. [Set minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances)

### Inferences

- For one user's intermittent app usage, min instances of zero is the cost-conscious setting if occasional startup delay is acceptable.
- A billing account means “within free quota” is not the same as a hard $0 spending cap. Review billing controls and monitor usage after setup.

### Gaps

- Actual cold-start delay depends on image size, app startup work, region, and whether an instance is already available; the docs do not provide a guaranteed startup time for this app.

## WebSockets and Socket.IO compatibility

### Takeaway

Cloud Run supports WebSockets, so the existing Socket.IO API can run there. The key constraint is that each WebSocket connection is a long-running request with a finite timeout, and an open connection keeps an instance active and billed under instance-based pricing.

### Cited Findings

- Cloud Run supports WebSockets without special configuration. WebSocket requests have a default timeout of 5 minutes and can be configured up to 60 minutes; clients need to reconnect when a connection closes. Google's guide explicitly discusses Socket.IO disconnect handling. [Use WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)
- An open WebSocket keeps the instance active and is charged using instance-based billing. Cloud Run documents up to 1,000 concurrent connections per container. [Use WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)
- Instances are not a shared in-memory state store. If multiple Cloud Run instances serve sockets that must broadcast the same events, the service needs an external synchronization mechanism. [Use WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)

### Inferences

- For this one-user app, Socket.IO can work if the mobile client handles disconnect/reconnect and the server does not depend on in-memory state surviving between instances.
- If the app holds a socket open in the background for long periods, the instance may stay active and consume the instance-based free allowance even when few or no messages are exchanged. Staying within that quota is possible, but not assured.
- If multiple instances are allowed later, plan a shared Socket.IO adapter/backplane or another cross-instance event mechanism before relying on broadcasts across instances.

### Gaps

- Whether Socket.IO's current transport/configuration works unchanged depends on the project's exact server setup, especially polling fallback, sticky sessions, heartbeat intervals, and deployment instance limits. Those details require reviewing the code and deployment configuration.

## Fit for this app

### Takeaway

Cloud Run is a viable low-cost host for the Node/Express API and can preserve Socket.IO live updates. It is a reasonable starting point if the user accepts billing-account setup, possible cold starts, periodic socket reconnects, and the fact that lifetime $0 cannot be guaranteed.

### Cited Findings

- Cloud Run can run a containerized application and supports source-based deployments for common runtimes including Node.js. [What is Cloud Run?](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)
- Its WebSocket support, timeout limits, and instance-based billing behavior are described in Google's WebSocket guide. [Use WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)

### Inferences

- For one user, a practical configuration to evaluate is Mumbai (asia-south1), minimum instances zero, modest CPU/memory, and a client reconnect strategy that tolerates the 60-minute maximum connection lifetime. Test a real app session to measure cold starts and how often the socket stays connected in the background.
- MongoDB Atlas remains a separate hosted dependency; Cloud Run does not make Atlas free or remove its own region, connection, and network considerations.

### Gaps

- I have not inspected the project's backend source/configuration here, so compatibility and cost depend on implementation details.
- This note evaluates Cloud Run only; it does not compare providers.
