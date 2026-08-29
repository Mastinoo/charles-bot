# Revival Ranks

Charles automates only the middle rank in the GWR three-rank system:

- **Awakened** — baseline/new member rank. Charles does not assign or remove it.
- **Revivalist** — automatically earned through sustained server activity.
- **Ascended** — manual veteran/contributor rank. Charles never assigns or removes it.

## Default Revivalist requirements

- 50 qualifying messages
- Activity on at least 7 different UTC calendar days
- At least 7 days of server tenure
- Maximum 10 progression messages per day
- Revivalist is permanent once awarded

The defaults are configurable with `/revival thresholds`. Existing server configuration stored in SQLite is preserved across restarts.

## Setup

1. Put Charles' highest Discord role above the Revivalist role and give Charles `Manage Roles`.
2. Deploy the updated slash commands: `npm run deploy-commands`.
3. Restart Charles.
4. Run `/revival setup` and choose Awakened, Revivalist and Ascended.
5. Exclude spam/bot/ticket/staff areas with `/revival exclude-channel` and `/revival exclude-category`.
6. Confirm the historical baseline. Default: `2025-12-09`. Change it with `/revival baseline` if needed.
7. Run `/revival backfill`.
8. Check progress with `/revival status`. **Backfill is dry-run only and never assigns roles.**
9. Review the number of eligible members.
10. When satisfied, run `/revival apply confirm:true`.

After setup, Charles counts new qualifying messages automatically and awards Revivalist as soon as all requirements are met.

## Command access

Potentially destructive, bulk, or progression-changing `/revival` operations are restricted to the bot owner (`OWNER_ID`): setup, thresholds, baseline, exclusions, historical backfill, threshold simulation and bulk apply. Server administrators can still inspect `/revival status`, `/revival config` and `/revival member`.

## Public command

`/rank` shows your own progression. `/rank user:@member` can inspect another current member.

## Historical scan

The backfill reads message history Charles can access from the configured baseline up to the moment the scan starts. It scans readable message channels plus accessible active/archived threads. Deleted messages and channels Charles cannot read cannot be counted.

The scanner ignores bots, webhooks and Discord system messages. Exclusions configured before the scan are honored.

## Notes

- Message Content intent is **not required** because Charles only counts message metadata; it does not inspect message text.
- Guild Members intent is already enabled in Charles' client and should remain enabled in the Discord developer portal.
- The existing SQLite database file (`streamers.db`) is reused; the new rank tables are created automatically at startup.
- Existing Revivalist roles are never removed.
- Ascended members are skipped by Revivalist automation.
