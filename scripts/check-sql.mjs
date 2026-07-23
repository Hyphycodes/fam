/**
 * Runs the migrations against a real Postgres (PGlite — Postgres compiled to
 * WASM) so a typo in the schema surfaces here instead of in the Supabase SQL
 * editor at 11pm.
 *
 * We stub the bits of Supabase that PGlite doesn't have: the `auth` schema,
 * `auth.users`, and `auth.uid()`. Everything else is genuinely executed —
 * constraints, generated columns, RLS policies, triggers and functions.
 *
 *   npm run check:sql
 */
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(root, 'supabase', 'migrations')

const SUPABASE_STUBS = `
  create schema if not exists auth;
  create schema if not exists storage;

  create table if not exists auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text unique
  );

  create table if not exists storage.buckets (
    id     text primary key,
    name   text unique not null,
    public boolean not null default false
  );

  -- In Supabase this reads the JWT. Here it reads a session GUC so the RLS
  -- assertions below can pretend to be different people.
  create or replace function auth.uid() returns uuid
  language sql stable as $fn$
    select nullif(current_setting('test.uid', true), '')::uuid;
  $fn$;
`

function fail(message, detail) {
  console.error(`\n  \x1b[31m✗\x1b[0m ${message}`)
  if (detail) console.error(`    ${String(detail).split('\n').join('\n    ')}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`  \x1b[32m✓\x1b[0m ${message}`)
}

const db = new PGlite()
await db.exec(SUPABASE_STUBS)

const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
if (files.length === 0) {
  fail('No migrations found in supabase/migrations')
  process.exit(1)
}

console.log('\nMigrations')
for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8')
  try {
    await db.exec(sql)
    pass(file)
  } catch (error) {
    fail(`${file} failed to apply`, error.message)
    process.exit(1)
  }
}

// Re-running must be a no-op. Migrations get re-pasted into the SQL editor more
// often than anyone admits.
console.log('\nIdempotency (re-applying every migration)')
for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file), 'utf8')
  try {
    await db.exec(sql)
    pass(`${file} re-applies cleanly`)
  } catch (error) {
    fail(`${file} is not idempotent`, error.message)
  }
}

// ---------------------------------------------------------------------------
// Behavioural checks — the parts that would silently rot
// ---------------------------------------------------------------------------
console.log('\nSchema behaviour')

const expectedTables = [
  'profiles',
  'allowed_emails',
  'events',
  'media',
  'reactions',
  'comments',
  'voice_notes',
  'people',
  'media_people',
  'event_upload_links',
  'music_tracks',
  'members',
  'member_sessions',
]
const { rows: tables } = await db.query(
  `select table_name from information_schema.tables where table_schema = 'public'`,
)
const present = new Set(tables.map((t) => t.table_name))
const missing = expectedTables.filter((t) => !present.has(t))
if (missing.length) fail(`Missing tables: ${missing.join(', ')}`)
else pass(`All ${expectedTables.length} tables created`)

// RLS must actually be on — an unenabled table is a silently public table.
const { rows: rls } = await db.query(
  `select relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
)
if (rls.length) fail(`RLS not enabled on: ${rls.map((r) => r.relname).join(', ')}`)
else pass('RLS enabled on every public table')

const { rows: policies } = await db.query(
  `select count(*)::int as n from pg_policies where schemaname = 'public'`,
)
if (policies[0].n < 20) fail(`Only ${policies[0].n} RLS policies — expected 20+`)
else pass(`${policies[0].n} RLS policies defined`)

// Generated columns power "On this day"; if they drift, resurfacing breaks.
// The owner has to be on the guest list first — the trigger enforces that for
// everyone, including the person who built the place.
await db.exec(`insert into public.allowed_emails (email, role, display_name)
  values ('owner@example.com', 'owner', 'Owner')`)
await db.exec(`insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com')`)

await db.exec(`insert into public.media (id, uploader_id, type, r2_key, taken_at, status, content_hash)
  values ('22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111',
          'photo', 'originals/x.jpg', '2019-07-04T18:30:00Z', 'ready',
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')`)

const { rows: gen } = await db.query(
  `select taken_month, taken_day, taken_year from public.media
    where id = '22222222-2222-2222-2222-222222222222'`,
)
if (gen[0].taken_month === 7 && gen[0].taken_day === 4 && gen[0].taken_year === 2019) {
  pass('Generated taken_month/day/year columns compute correctly')
} else {
  fail(`Generated columns wrong: ${JSON.stringify(gen[0])}`)
}

const { rows: otd } = await db.query(
  `select count(*)::int as n from public.on_this_day('2024-07-04')`,
)
if (otd[0].n === 1) pass('on_this_day() finds the 4th of July memory')
else fail(`on_this_day() returned ${otd[0].n} rows, expected 1`)

const { rows: otdSameYear } = await db.query(
  `select count(*)::int as n from public.on_this_day('2019-07-04')`,
)
if (otdSameYear[0].n === 0) pass('on_this_day() excludes the current year')
else fail('on_this_day() should not resurface memories from the same year')

// A media row with neither a Stream uid nor an R2 key is a dead reference.
try {
  await db.exec(`insert into public.media (type, taken_at) values ('photo', now())`)
  fail('media_has_a_home constraint did not fire')
} catch {
  pass('media_has_a_home rejects a row with no file behind it')
}

// The invite gate is the whole security model for signup.
try {
  await db.exec(`insert into auth.users (email) values ('stranger@example.com')`)
  fail('Uninvited signup was allowed — the invite gate is not holding')
} catch (error) {
  if (/not been invited/i.test(error.message)) pass('Uninvited signup is rejected by the trigger')
  else fail('Signup failed for the wrong reason', error.message)
}

await db.exec(`insert into public.allowed_emails (email, role, display_name)
  values ('cousin@example.com', 'family', 'Cousin Ray')`)
await db.exec(`insert into auth.users (email) values ('Cousin@Example.com')`)
const { rows: invited } = await db.query(
  `select display_name, role from public.profiles where email = 'cousin@example.com'`,
)
if (
  invited.length === 1 &&
  invited[0].display_name === 'Cousin Ray' &&
  invited[0].role === 'family'
) {
  pass('Invited signup auto-creates the profile (case-insensitively)')
} else {
  fail(`Profile not created from invite: ${JSON.stringify(invited)}`)
}

const { rows: claimed } = await db.query(
  `select claimed_at from public.allowed_emails where email = 'cousin@example.com'`,
)
if (claimed[0].claimed_at) pass('Invite is marked claimed on first sign-in')
else fail('claimed_at was not stamped')

// is_family()/is_owner() drive every policy in the file.
await db.exec(`set test.uid = '11111111-1111-1111-1111-111111111111'`)
const { rows: asOwner } = await db.query(`select public.is_family() f, public.is_owner() o`)
if (asOwner[0].f === true && asOwner[0].o === true)
  pass('is_family()/is_owner() true for the owner')
else fail(`Owner check wrong: ${JSON.stringify(asOwner[0])}`)

await db.exec(`set test.uid = '99999999-9999-9999-9999-999999999999'`)
const { rows: asStranger } = await db.query(`select public.is_family() f, public.is_owner() o`)
if (asStranger[0].f === false && asStranger[0].o === false)
  pass('is_family()/is_owner() false for a stranger')
else fail(`Stranger check wrong: ${JSON.stringify(asStranger[0])}`)

// ---------------------------------------------------------------------------
// Privilege escalation
//
// RLS can permit an UPDATE on a row but cannot restrict which columns it
// touches, and the anon key ships to the browser. These triggers are the only
// thing standing between a curious relative and the guest list.
// ---------------------------------------------------------------------------
console.log('\nImmutable columns')

const cousinId = (
  await db.query(`select id from public.profiles where email = 'cousin@example.com'`)
).rows[0].id

await db.exec(`set test.uid = '${cousinId}'`)
await db.exec(`update public.profiles set role = 'owner' where id = '${cousinId}'`)
const { rows: escalated } = await db.query(
  `select role from public.profiles where id = '${cousinId}'`,
)
if (escalated[0].role === 'family') pass('A family member cannot promote themselves to owner')
else fail('PRIVILEGE ESCALATION: a member made themselves owner')

await db.exec(`set test.uid = '11111111-1111-1111-1111-111111111111'`)
await db.exec(`update public.profiles set role = 'owner' where id = '${cousinId}'`)
const { rows: promoted } = await db.query(
  `select role from public.profiles where id = '${cousinId}'`,
)
if (promoted[0].role === 'owner') pass('An owner can still promote someone')
else fail('The owner can no longer promote anyone')
await db.exec(`update public.profiles set role = 'family' where id = '${cousinId}'`)

// Repointing uploader_id would turn "the author may delete" into "anyone may
// delete anything"; repointing an r2 key would make the app sign a URL for an
// arbitrary object in the bucket.
await db.exec(`
  update public.media
     set uploader_id = '${cousinId}',
         r2_display_key = 'music/2024/01/some-track.mp3',
         stream_uid = 'stolen',
         content_hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
   where id = '22222222-2222-2222-2222-222222222222'`)

const { rows: media } = await db.query(
  `select uploader_id, r2_display_key, stream_uid, content_hash from public.media
    where id = '22222222-2222-2222-2222-222222222222'`,
)
if (media[0].uploader_id === '11111111-1111-1111-1111-111111111111') {
  pass('uploader_id cannot be rewritten after upload')
} else {
  fail('uploader_id was rewritten — delete permissions are bypassable')
}
if (media[0].r2_display_key === null && media[0].stream_uid === null) {
  pass('Storage pointers cannot be repointed at other objects')
} else {
  fail(`Storage pointers were rewritten: ${JSON.stringify(media[0])}`)
}
if (media[0].content_hash === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') {
  pass('The original content hash cannot be rewritten')
} else {
  fail('content_hash was rewritten — duplicate protection can be bypassed')
}

try {
  await db.exec(`insert into public.media (type, r2_key, content_hash)
    values ('photo', 'originals/duplicate.jpg',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')`)
  fail('Duplicate content hashes were allowed')
} catch {
  pass('Duplicate content hashes cannot create a second media row')
}

// Captions and stars still have to be editable, or the app does nothing.
await db.exec(`
  update public.media set caption = 'The water balloon incident', favorite = true
   where id = '22222222-2222-2222-2222-222222222222'`)
const { rows: edited } = await db.query(
  `select caption, favorite from public.media where id = '22222222-2222-2222-2222-222222222222'`,
)
if (edited[0].caption === 'The water balloon incident' && edited[0].favorite === true) {
  pass('Captions and favourites are still editable')
} else {
  fail('The media trigger froze columns it should not have')
}

// Re-tagging deletes then re-inserts. Without a DELETE policy the delete
// silently does nothing and the re-insert collides with the primary key.
await db.exec(`insert into public.people (id, name) values
  ('33333333-3333-3333-3333-333333333333', 'Ray')`)
await db.exec(`insert into public.media_people (media_id, person_id) values
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')`)
await db.exec(`delete from public.media_people
  where media_id = '22222222-2222-2222-2222-222222222222'`)
const { rows: tags } = await db.query(`select count(*)::int n from public.media_people`)
if (tags[0].n === 0) pass('Tags can actually be removed')
else fail('media_people DELETE is a silent no-op — re-tagging will break')

const { rows: versions } = await db.query(`select public.reel_schema_version() as version`)
if (versions[0].version === 8) pass('Production readiness can identify schema version 8')
else fail(`Unexpected schema version: ${versions[0].version}`)

await db.exec(`
  insert into public.members (id, first_name, last_initial, display_name) values
    ('44444444-4444-4444-4444-444444444444', 'Alex', 'R', 'Alex'),
    ('55555555-5555-5555-5555-555555555555', 'Alex', 'M', 'Alex');
  insert into public.people (id, name, member_id) values
    ('66666666-6666-6666-6666-666666666666', 'Alex', '44444444-4444-4444-4444-444444444444'),
    ('77777777-7777-7777-7777-777777777777', 'Alex', '55555555-5555-5555-5555-555555555555');
`)
const { rows: sameNames } = await db.query(
  `select count(*)::int n from public.people where name = 'Alex'`,
)
if (sameNames[0].n === 2) pass('Two relatives with the same name keep separate identities')
else fail('Person tags still collapse relatives who share a display name')

await db.close()

if (process.exitCode) {
  console.error('\n\x1b[31mSchema check failed.\x1b[0m\n')
} else {
  console.log('\n\x1b[32mSchema is sound.\x1b[0m\n')
}
