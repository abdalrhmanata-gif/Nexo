# Reporting a security problem

Thank you for looking. If you have found something, please tell us before you
tell anyone else, and we will work with you.

## How to report

Open a private advisory through GitHub:
**Security → Advisories → Report a vulnerability** on this repository. That
channel is private until we publish, and it lets us talk to you about the
details without them becoming public first.

If that is not possible for you, write to the privacy contact published in the
application's privacy notice and say that the message concerns security. Do not
open a public issue, and do not include a working exploit in a public place.

## What to expect

- We acknowledge within **3 working days**.
- We give an assessment, and a fix or a plan, within **14 days** for anything
  that can expose another person's data or take over an account.
- We will tell you when the fix ships, and credit you if you would like that.

## What is in scope

The application in `apps/web`, the database schema and policies in
`supabase/migrations`, and anything in this repository that runs in production.

Particularly interesting: a way for one account to read or change another
account's Missions, anything that bypasses row-level security, any path that
leaks a token or a session, and any way to make the page counter record
something about a visitor.

## What is out of scope

- Reports produced only by an automated scanner, with no demonstrated impact.
- Missing hardening headers with no exploitable consequence.
- Denial of service through sheer volume.
- Social engineering, and physical access.
- Anything requiring a person to already control the victim's device.

## Please do not

Access, modify or delete data that is not yours; degrade the service for other
people; or run automated scanning that generates significant load. If you reach
someone else's data by accident, stop, and tell us what happened.

We do not currently run a paid bounty. We will say so honestly rather than
imply otherwise.
