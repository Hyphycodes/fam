-- Jerry signed in via the legacy email path before a display_name was on file,
-- so handle_new_user() fell back to the email's local part ("jerrysanchezpro").
-- Fix the existing profile, and the allowlist row, so future/re-created
-- profiles get it right too.
update public.profiles
   set display_name = 'Jerry'
 where email = 'jerrysanchezpro@gmail.com';

update public.allowed_emails
   set display_name = 'Jerry'
 where email = 'jerrysanchezpro@gmail.com';

-- Add Alexis as a single member for now — only one last-initial variant known.
insert into public.members (first_name, display_name)
values ('Alexis', 'Alexis')
on conflict do nothing;
