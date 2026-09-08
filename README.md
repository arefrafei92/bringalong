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
