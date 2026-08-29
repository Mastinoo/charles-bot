# Official GWR Guild Leadership Applications

Charles workflow for the Official GWR Guild pilot leadership model.

This feature is intentionally separate from the existing `/postguildapply` guild-invite workflow. Existing member invite requests continue to use `cogs/guildApplications.js` and the existing `guildApplyConfig.json` / `guildApplications.json` files.

## What it adds

- Public Official GWR Guild application panel
- Private application ticket per applicant
- Persistent six-section application with save/resume
- Guild Leader / Founding Officer / Either position selection
- Guild Wars interest multi-select
- Leadership preference selects
- Formal GWR leadership agreement
- Progress dashboard and answer review
- Submission locking
- Private GWR Leadership review card
- Section-by-section application reading
- Private reviewer notes
- Review status workflow
- Applicant withdrawal and re-application support
- Reusable component/modal interaction router

## New slash command

`/officialguildapplication`

### Setup

Run:

`/officialguildapplication setup`

Provide:

- `apply_channel` — public channel for the application panel
- `review_channel` — private GWR Leadership review channel
- `ticket_category` — category where Charles creates private applicant channels
- `reviewer_role` — role that Mastino/Skitzo/GWR Leadership use to review applications

Then run:

`/officialguildapplication panel`

Charles will post the permanent public application panel in the configured application channel.

Use:

`/officialguildapplication config`

at any time to verify the current configuration.

## Required Charles permissions

Charles needs enough Discord permissions to:

- View Channels
- Send Messages
- Read Message History
- Embed Links
- Attach Files
- Manage Channels (to create the private applicant tickets)
- Manage Messages (inside application tickets/review workflow)

The configured reviewer role is explicitly granted access to each application ticket. `@everyone` is denied access.

## Application files

Question wording and agreement text:

`resources/officialGuildLeadershipApplication.json`

Server configuration:

`data/officialGuildLeadershipConfig.json`

Persistent applications:

`data/officialGuildLeadershipApplications.json`

The application question definition is data-driven so wording can be changed without rewriting the workflow logic.

## Review statuses

- Submitted
- Under Review
- Shortlisted
- Interview
- Guild Leader Candidate
- Founding Officer Candidate
- Future Candidate
- Accepted
- Unsuccessful
- Withdrawn

There is deliberately no automatic applicant score. Charles organises the process; GWR Leadership makes the judgement.

## Deployment

After pulling/copying the updated files:

```bash
npm install
npm run deploy-commands
# restart Charles using the normal production service/process
```

Then configure the workflow in Discord with `/officialguildapplication setup` and post the panel with `/officialguildapplication panel`.
