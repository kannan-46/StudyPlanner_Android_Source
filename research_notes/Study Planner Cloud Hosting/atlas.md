# MongoDB Atlas options for the Surgical Study Planner

Research checked 12 November 2026. Prices are USD and may vary by region and configuration.

## Free and shared tiers

### Takeaway

Atlas Free (`M0`) is enough to prototype this low-volume app, but its small hard limits and no dependable backup make it a poor place to keep the only copy of important user data. Flex is the practical low-traffic paid option if daily snapshots are useful; it costs $8–$30/month and is still a shared, capped tier.

### Cited Findings

- Free has 512 MB maximum data-plus-index storage, shared/unconfigurable memory, a 100-read/write-operations-per-second limit, 10 GB inbound and 10 GB outbound transfer per rolling seven days, and at most one Free cluster per Atlas project. [Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- Free and Flex each allow at most 500 connections; both also cap databases at 100 and collections at 500. [Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/); [Flex limitations](https://www.mongodb.com/docs/atlas/reference/flex-limitations/)
- Free clusters with zero connections for 30 days are automatically paused. A paused cluster cannot serve requests until resumed. [Pause, resume, or terminate a cluster](https://www.mongodb.com/docs/atlas/pause-terminate-cluster/)
- Flex has a hard 5 GB storage limit and 500 ops/s ceiling. Its base price includes 100 ops/s and unlimited transfer; usage is billed hourly from $8 to a maximum of $30 per 30 days. Atlas describes it as suitable for development, testing, and low-traffic production. [Flex costs](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/); [Flex limitations](https://www.mongodb.com/docs/atlas/reference/flex-limitations/)
- Flex is always backed up with one daily snapshot, retaining the latest eight; snapshots start 24 hours after cluster creation. It does not support custom schedules or on-demand snapshots. [Flex backups](https://www.mongodb.com/docs/atlas/backup/cloud-backup/flex-cluster-backup/)
- Current documentation conflicts on Free backups: the Free limits page says backups cannot be enabled and suggests manual `mongodump`/`mongorestore`, while the separate backup and billing pages say a paid private-preview option offers one daily snapshot and retains four, for $0.10/day up to $3/month. Preview availability is gradual and may change, so check the Atlas UI and do not assume Free backups are available. [Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/); [Free backup preview](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/); [Atlas additional services billing](https://www.mongodb.com/docs/atlas/billing/additional-services/)
- Atlas says dedicated M10+ clusters start at about $60/month in its Flex cost comparison; exact price depends on configuration and region. MongoDB’s public pricing page currently shows a $56.94/month base example, so use the create-cluster estimate for the selected Indian region. [Atlas Flex cost comparison](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/); [MongoDB pricing](https://www.mongodb.com/pricing)

### Inferences

- For this app, M0 is a sensible development tier if the data is disposable or separately exported. Move to Flex before relying on Atlas-managed backups for low-traffic use; move to M10+ if predictable dedicated resources, configurable point-in-time recovery, private networking, or an applicable uptime SLA becomes important.
- Having three replica-set nodes helps recover from node failure, but replication is not a backup against accidental deletion or bad writes. Free has no guaranteed cloud backup under the limits page; Flex's daily snapshots leave up to roughly a day of changes at risk and no fine-grained restore.

### Gaps

- MongoDB's pages disagree about whether Free backup is currently available to a given account; only the Atlas UI/account can settle that. The preview has no documented general-availability commitment.

## Backups and availability

### Takeaway

Free and Flex provide a three-node replica set and automatic node failover, but Free may pause after inactivity and neither shared tier provides the controls or assurances of a dedicated tier. Flex adds daily backups; M10+ is the documented threshold for Atlas's 99.995% uptime SLA and configurable point-in-time backup features.

### Cited Findings

- Atlas describes clusters as at least three replica-set nodes and says it automatically elects a secondary when a primary is unavailable; drivers can reconnect across the election. [Atlas high availability](https://www.mongodb.com/docs/atlas/architecture/current/high-availability/)
- Free clusters have a fixed three-node replication factor, but Free does not support primary-failover testing and Atlas manages its maintenance timing. [Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
- Flex snapshots are daily, retain eight days, and do not support on-demand snapshots or custom snapshot policies. Continuous backup and point-in-time restore are unsupported on Flex. [Flex backups](https://www.mongodb.com/docs/atlas/backup/cloud-backup/flex-cluster-backup/); [Flex limitations](https://www.mongodb.com/docs/atlas/reference/flex-limitations/)
- Atlas production notes specify its 99.995% uptime SLA for Atlas clusters of M10 and larger. They recommend Free/Flex and M10/M20 primarily for development, while noting Flex can serve low-traffic production apps. [Production notes](https://www.mongodb.com/docs/atlas/production-notes/)
- Atlas documents Cloud Backup for M10+ and notes that finer-grained backup policy options require M10 or larger. [Back up and restore data](https://www.mongodb.com/docs/atlas/backup-restore-cluster/); [Flex backups](https://www.mongodb.com/docs/atlas/backup/cloud-backup/flex-cluster-backup/)

### Inferences

- A single-user pilot can start on Free if the owner accepts manual exports and occasional interruption. Flex is a better fit once study plans matter because it gives automatic daily restore points for a modest monthly fee, while still lacking point-in-time recovery and an M10+ uptime commitment.
- For future multiple users, the app should handle temporary database elections/reconnects regardless of tier. Atlas replication helps infrastructure failures; a tested backup-and-restore path is needed for deletion, corruption, or mistakes.

### Gaps

- A formal SLA is documented for M10+, not Free/Flex; MongoDB’s public SLA landing page does not expose detailed tier text in the browser extraction. Confirm applicable contract terms before treating any paid tier as an availability commitment.
- The suitable retention period and acceptable data-loss window depend on how important users consider their planner data; no such requirement was specified.

## India regions and secure Node.js API access

### Takeaway

Place Atlas and the Node.js API near the user, ideally in the same cloud provider and region. The Android app should call the API; only the API server should hold the Atlas URI and connect to MongoDB. Allowlist the API host's stable egress IP and give the API a dedicated database user with access only to the planner database.

### Cited Findings

- Atlas documents these India region options: AWS Mumbai (`ap-south-1`) and Hyderabad (`ap-south-2`); Google Cloud Mumbai (`asia-south1`) and Delhi (`asia-south2`); Azure Pune (`centralindia`), Chennai (`southindia`), and Mumbai (`westindia`). Free/Flex are available only in subsets of provider regions, so verify the chosen tier/region is selectable when creating the cluster. [AWS region reference](https://www.mongodb.com/docs/atlas/reference/amazon-aws/); [Google Cloud region reference](https://www.mongodb.com/docs/atlas/reference/google-gcp/); [Azure region reference](https://www.mongodb.com/docs/atlas/reference/microsoft-azure/)
- Atlas says client connections must come from IPs in the project IP access list; it recommends allowing the smallest practical range, such as one `/32` IP. It warns that `0.0.0.0/0` permits connections from anywhere and can expose the deployment. [IP access lists](https://www.mongodb.com/docs/atlas/security/ip-access-list/); [Atlas network security guidance](https://www.mongodb.com/docs/atlas/architecture/current/network-security/)
- Atlas enforces TLS for database connections. Free and Flex do not support private endpoints or network peering, so an API using those tiers connects over the public network with TLS plus the IP allowlist. [Network security guidance](https://www.mongodb.com/docs/atlas/architecture/current/network-security/); [Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/); [Flex limits](https://www.mongodb.com/docs/atlas/reference/flex-limitations/)
- MongoDB recommends RBAC, fine-grained roles, and least privilege for application users. Atlas database users are distinct from Atlas UI users. [Authorization guidance](https://www.mongodb.com/docs/atlas/architecture/current/auth/authorization/); [Atlas database users](https://www.mongodb.com/docs/manual/reference/database-users/)
- MongoDB recommends storing the connection string in an environment variable or secret manager. [Atlas connection-string guidance](https://www.mongodb.com/resources/products/fundamentals/atlas-connection-strings)
- Atlas says snapshots for clusters located in India, Singapore, and Taiwan are stored in “Asia”; the public page does not identify a specific snapshot country. [Free backup locations](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/); [Flex backup locations](https://www.mongodb.com/docs/atlas/backup/cloud-backup/flex-cluster-backup/)

### Inferences

- Choose the nearest supported Indian region for the actual user and host the API in or near that same region. The precise best choice depends on where the user lives and which Indian regions Atlas offers for the selected tier; AWS Mumbai is a reasonable starting candidate, not a confirmed choice for this account.
- Use one backend service database identity (for example, an app-specific user with `readWrite` on only the app database), not a MongoDB login per app user. Future user accounts should authenticate to the API; the API should derive `userId` from the authenticated session/token and enforce ownership checks on every read/write. Keep the Atlas URI out of the APK because a mobile binary can be inspected.
- When choosing an API host, prefer one with static outbound egress IP so Atlas can allowlist just that address. If the host cannot provide stable egress, pick an architecture with private networking on a suitable paid tier or understand that a wide public allowlist weakens the network boundary.

### Gaps

- The official region reference tables make Free/Flex availability tier-specific, but current browser text extraction does not expose the checkmark values in each table. Verify Mumbai/Hyderabad (or another Indian region) in Atlas cluster creation before committing to a provider.
- The user's exact Indian city and preferred API host are not yet selected, so the lowest-latency region and exact allowlist approach remain undecided.
- If the planner will hold identifiable patient or clinical data rather than personal study tasks, confirm data-residency/privacy requirements separately; the backup-location documentation says only “Asia.”
