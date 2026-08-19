# Points/layers parity deployment — 2026-08-19

Commit `fd2cf8b` (`Unify layer and point controls`) was pushed to `origin/main`. At the first check, GitHub CI and Pages build were in progress for this commit. Render service `hm-server` remained healthy and showed the previous `9ef58a7` deployment as live while the new commit was not yet listed.

The Render dashboard was re-opened and the service event list confirmed `9ef58a7` live at 05:19 AM. No manual deploy or configuration change was performed at that point; the normal auto-deploy for the pushed GitHub commit was allowed to proceed.


After the GitHub workflows completed successfully for `fd2cf8b`, two Render checks still showed only `9ef58a7` as live and no new `fd2cf8b` event. A separate health request timed out once during this wait; no manual deploy, rollback or environment change was performed. The next safe action is to inspect whether Render auto-deploy is delayed or trigger the already-reviewed latest commit from the service dashboard only if needed.
