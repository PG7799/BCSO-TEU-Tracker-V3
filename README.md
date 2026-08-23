# BCSO TEU Activity Tracker

Real-time monthly statistics dashboard for a GTA/FiveM BCSO Traffic Enforcement Unit.

## Included activity types

- Arrests
- PITs
- Pursuits
- Citations
- Crash Investigations
- Grappler Deployments
- Felony Stops
- Agency Assists
- DUI / DWI
- Other

## Supabase configuration

`config.js` is already configured for the Supabase project supplied for this deployment.

The browser uses the Supabase publishable/anon key. Do not replace it with a service-role or secret key.

## Database setup

1. Open the Supabase project.
2. Open **SQL Editor**.
3. Create a new query.
4. Paste the complete contents of `supabase.sql`.
5. Click **Run**.

This creates:
- `teu_events`
- `teu_admins`
- indexes
- Row Level Security policies
- the secure monthly reset function
- Realtime configuration

## Create the admin

In Supabase:

1. Go to **Authentication -> Users**.
2. Create a new user:
   - Email: `lc0628339@gmail.com`
   - Password: `zeAdrHgpnH1@`
3. Copy the user's UUID.
4. Run this SQL using the actual UUID:

```sql
insert into public.teu_admins (user_id)
values ('YOUR-ADMIN-USER-UUID');
```

The website's Admin page uses Supabase Authentication. It does not store the password in the website code.

The only admin operation exposed by the site is:

**Reset Current Month**

The database function independently checks that the authenticated user is present in `public.teu_admins`, so a normal user cannot invoke the reset function.

## Test the site

Open the site and submit an activity.

Then open the site in a second browser window. When an activity is submitted, Supabase Realtime should update both dashboards.

## Monthly behavior

The site automatically displays the current calendar month. Older records remain in the database.

The administrator can manually delete all records for the current month using the reset button.

## Hosting

This is a static frontend with Supabase providing the database, authentication, and realtime backend. It can be hosted on a static hosting provider such as Cloudflare Pages.

## TEU Roster

The tracker now includes a live TEU roster with:

- Callsign
- Name
- Rank
- Subdivision Rank: TEU Traffic Member, FTO, Co Commander, Commander
- Active / Inactive status

Everyone can view the roster. Only authenticated users listed in `public.teu_admins` can add, edit, or remove members.

Roster changes use Supabase Realtime, so connected users see changes immediately.

If your database already exists, run the **TEU ROSTER** section at the bottom of `supabase.sql` in Supabase SQL Editor. You do not need to delete the existing activity table.


## Roster RLS fix

The roster policies authorize the authenticated TEU administrator account
`lc0628339@gmail.com` in addition to users explicitly listed in `teu_admins`.
This prevents the "new row violates row-level security policy" error when the
admin UUID has not yet been inserted into `teu_admins`.

The database-side reset function uses the same authorization rule.


## Roster sorting

The roster automatically sorts by TEU subdivision rank:

1. Commander
2. Co Commander
3. FTO
4. TEU Traffic Member

Active members appear before inactive members. Members with the same TEU rank are sorted by callsign.


### Roster sorting behavior

The roster is sorted in the browser every time it renders, including after a
new member is added, an existing member is edited, a member is removed, or
Supabase Realtime sends an update.

Order:
1. Commander
2. Co Commander
3. FTO
4. TEU Traffic Member

Within each TEU rank, active members appear first, then callsign order.


## Monthly reports per roster member

Activity is now assigned from the active TEU roster rather than a free-text
member field. Each activity record stores the member's callsign. The roster
then counts that member's activity for the current calendar month and displays
the total next to their name.

When an activity is added, edited roster data changes, or Supabase Realtime
updates the activity table, the monthly report total is refreshed.

The SQL file also contains an optional `teu_monthly_member_reports` view for
database-side reporting.


## Secure TEU member authentication

The roster now supports one authenticated Supabase account per TEU member.

When an administrator adds a member:
1. The admin enters the member's login email and temporary password.
2. The `manage-teu-member` Supabase Edge Function securely creates the Auth account using the service-role key.
3. The returned Auth UUID is automatically stored in `teu_roster.auth_user_id`.
4. The member logs in with their own account.
5. The activity form is locked to that member's roster callsign.
6. Supabase RLS prevents the member from submitting activity for another callsign.

When an admin removes a member, the Edge Function disables their Auth account and removes them from the roster. Historical `teu_events` remain.

### Deploy the Edge Function

Install the Supabase CLI and log into your Supabase project, then from the project folder run:

```bash
supabase functions deploy manage-teu-member
```

The Edge Function automatically receives the Supabase URL, anon key, and service-role key from the Supabase runtime. Never put the service-role key in `config.js` or GitHub Pages.

For an existing database, run the **SECURE TEU MEMBER AUTHENTICATION** section in `supabase.sql` before using the new member login system.


## Current UI/auth fix

This build fixes several issues from the previous secure-auth build:

- The activity member field is now a roster-backed, disabled selector rather than a free-text callsign field.
- A member account can only submit activity for the roster record linked to its Auth UUID.
- Signing in as a TEU member no longer exposes admin roster controls.
- Admin controls are only shown to recognized admins.
- The public roster still loads even if the `auth_user_id` migration has not yet been run.
- The roster shows monthly report totals and remains sorted by TEU rank.

If the `auth_user_id` column has not yet been added to an existing database, run the **TEU AUTH MIGRATION SAFETY** section in `supabase.sql`.


## Connection troubleshooting

This build includes a fallback Supabase CDN and an explicit connection timeout.
If the header says `Supabase SDK failed`, the browser/CDN is blocked. If it
says `Connection timeout`, the Supabase project/network request did not return.


## Username-only TEU member accounts

Regular TEU members now use a username and password. They do not provide a
personal email address.

Internally, the secure Edge Function creates a Supabase Auth identity using
`<username>@teu.internal`. This is an internal identifier, not a real email
address and is never collected from the member.

Admins continue to use their normal administrator authentication.

Run the USERNAME-ONLY TEU MEMBER ACCOUNTS section of `supabase.sql` before
creating member accounts. Then deploy:

```bash
supabase functions deploy manage-teu-member
```

The admin roster workflow creates the Auth account and links it to the roster
automatically. Removing a member disables their login while historical activity
remains.

## Username/password member accounts

Regular TEU members now use username + password only. The secure Edge Function
creates an internal Supabase Auth identity as `<username>@teu.internal`; no
personal email is requested from the member. Admins create the account directly
from the roster form.

Deploy:
`supabase functions deploy manage-teu-member`

Run the username/password SQL section before testing.
