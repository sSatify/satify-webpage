# Agent instructions

## Personal project instructions

Before starting work, read `AGENTS.local.md` in the repository root if it exists.
Apply its developer-specific instructions alongside this file. Keep that local
file out of version control.

## Local SATIFY app recordings

When the user asks to record the locally running SATIFY app, target
`http://127.0.0.1:3030` explicitly in every video-tool command (`login`, `setup`,
and `showcase`). Do not assume the production origin is the same app. The
recorder opens a separate Edge window on Windows with its own sign-in state;
let the user sign in there, then save that session before setup or recording. Confirm
the intended app version and that Tool videos are off before capture.
On this workstation, launch the interactive `login` command outside the Codex
app sandbox so Edge opens with normal Windows clipboard paste. Keep the user's
password in the browser; never request or read it in the tool session.
Before calling a selected recording finished, decode the whole MP4 and review
short frame sequences around every abrupt image change. One-second contact
sheets can miss a four-frame resize. Verify the selected MP4 in the built page.
