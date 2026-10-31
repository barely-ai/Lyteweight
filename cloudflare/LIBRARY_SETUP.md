# Setting up the Community library

The Community screens (shared programs, rankings, comments, coaches and the leaderboard) run as a Pages Function (`functions/library/`) in the same Cloudflare Pages project as the website. They store everything in one Cloudflare D1 database. The function creates its tables on the first request.

This takes about 5 minutes, once. Never paste the admin key into a chat or a commit.

## 1. Create the database

1. In the Cloudflare dashboard, go to Storage & Databases → D1 SQL Database. Click Create.
2. Name it `lyteweight-library`. Leave the location on automatic. Click Create.

## 2. Connect it to the site

1. Go to Workers & Pages → lyteweight → Settings → Bindings. Click Add.
2. Choose D1 database. Set the variable name to `LIBRARY_DB` and pick `lyteweight-library`. Save.

## 3. Add the admin key

1. Make a long random string. On a Mac, `openssl rand -hex 24` prints one. Keep it in your password manager.
2. Go to Settings → Variables and Secrets. Add `LIBRARY_ADMIN_KEY` as type Secret for Production, with that string as the value.

## 4. Redeploy

Bindings and secrets only apply to new deployments. Go to Deployments, open the latest one's menu, and choose Retry deployment.

Then open Me → Community in the app. An empty "This week" board means it works. "The community library isn't set up on the server yet" means the `LIBRARY_DB` binding is missing or the site wasn't redeployed.

## Owner commands

Run these in Terminal on the Mac. Replace `KEY` with your admin key.

Make a coach. The reply contains a `coachKey`. Send it to the coach privately. They paste it into Community → Coach key.

```
curl -X POST https://lyteweight.pages.dev/library/admin/coaches -H "x-admin-key: KEY" -H "content-type: application/json" -d '{"name":"Coach Name","bio":"One line about them"}'
```

Remove a program. The program id is the last part of its share link (`/p/AbCd1234`).

```
curl -X DELETE https://lyteweight.pages.dev/library/programs/AbCd1234 -H "x-admin-key: KEY"
```

Hide a comment. Comment ids appear in the program's data at `https://lyteweight.pages.dev/library/programs/AbCd1234`.

```
curl -X DELETE https://lyteweight.pages.dev/library/comments/COMMENTID -H "x-admin-key: KEY"
```

See lifts waiting for approval. A lift goes here when it beats that lifter's previous best by more than 15%.

```
curl https://lyteweight.pages.dev/library/admin/pending -H "x-admin-key: KEY"
```

Approve a lifter's waiting lifts, or hide a lifter from the leaderboard. The `lifter_id` comes from the pending list.

```
curl -X POST https://lyteweight.pages.dev/library/admin/approve/LIFTERID -H "x-admin-key: KEY"
curl -X POST https://lyteweight.pages.dev/library/admin/hide-lifter/LIFTERID -H "x-admin-key: KEY"
```

## Limits that apply

- 10 publishes per network per day, 20 new installs per network per day, 30 comments per install per day.
- Programs and comments with 3 reports are hidden until you remove them or the reports are cleared.
- Ratings need 3 finished workouts of that program.
- The Cloudflare free tier allows 100,000 database writes and 5 million row reads per day. Each finished workout writes about 3 rows per opted-in user.
