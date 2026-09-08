# Bringalong

A responsive shared gathering planner for camping, parties, BBQs, and potlucks.

- Create gatherings and join with an invite code.
- Add, edit, remove, and assign items, with quantities, units, categories, and notes.
- Claim unassigned items and mark assigned items packed.
- Assign an item to Everyone: quantities are per person, and packing is tracked separately for each member (including future joiners).
- Group creators are admins. Admins choose full member editing or assignment-and-packing-only access.
- Public groups can be joined with an invite; protected groups require a password. Passwords use salted PBKDF2 hashes and failed joins are limited per user/group.
- Existing groups keep their first member as admin. Only admins may change group settings.
- Dashboard filters and per-person packing counts.
- Custom member icons (emoji or short text plus a color), saved across groups. Members without custom icons receive distinct default colors within a group.
- Mobile item rows keep the claim action on its own row with a 44px touch target.
- Occasion templates and shared updates every 15 seconds.

Built with React/Vinext and Cloudflare D1. Identity comes from the Sites authenticated-user headers; group membership is enforced on every group API operation. An invite code grants membership to an authenticated visitor who already has site access; protected groups also require the group password. Public group access does not change the site-level access policy. The initial publication is owner-private; sharing access is required before friends can use invitations.

## Development

Use the package scripts for installation, development, and building. Generate database migrations with `npm run db:generate`. Production migrations are deployed by Sites, not at request time. Database declarations are in `db/schema.ts`; queries are prepared D1 statements in `app/api/planner/route.ts`.

Run the isolated SQLite-backed API workflow checks with `node --test tests/planner.test.mjs` (Node 22+). The checks cover authentication, group membership, joining, item CRUD, quantities, assignment, packing, and templates. No browser tests were performed.

## Open-source hosting

The application code is MIT licensed; third-party packages retain their own licenses.

Requested deployment target: a public GitHub repository for source and Cloudflare Workers + D1 on the free plan, with a free `workers.dev` hostname. GitHub Pages alone cannot run this app's API or shared database.

Standalone Cloudflare deployment is not configured yet. This version uses Sites-provided authenticated identity, so that integration must be adapted before a direct Cloudflare release. Do not expose this app directly and trust user-supplied `oai-authenticated-*` headers. The production D1 database identifier and CI credentials must come from the target Cloudflare account; no credentials are included in this source.


### Activity history

The Activity page shows the signed-in person's gathering activity and personal first-use/profile events. Each gathering also has an Activity tab. Events retain actor names, timestamps, and safe before/after snapshots, including deleted items, assignments, and individual Everyone packing changes. Templates log every item added. Group members can see their shared group's history; profile changes appear in existing groups and personal history. History starts when this feature is deployed; first use means first observed use of Bringalong, not creation of the external login account. Merely viewing a list is not logged. Password values, hashes, and invite codes are never stored in activity details.

SQLite triggers in migration 0003 capture successful row changes. The API sets and clears the acting user inside the same D1 batch transaction as each write, so history and changes commit or roll back together. Keep future mutations inside this audited wrapper and add triggers for future entities. Direct database maintenance without this context is not attributed as user activity. Activity is read-only in the app and uses ID-based pagination (40 events per page).


### Automatic group removal
Group settings start collapsed. Automatic removal is opt-in and stores an absolute timestamp chosen at the start of the admin's selected local date. Admins can reschedule or turn it off. An indexed server-side cleanup runs before every authenticated planner request, permanently deleting due groups, cascading memberships/items/packing/join attempts, and deleting their activity history. Former members retain a personal removal receipt. This hosting environment exposes no background scheduler: cleanup runs on the next request, not a guaranteed wall-clock cron job. No client timer is required; expired invite codes cannot join a removed group.
