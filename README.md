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
