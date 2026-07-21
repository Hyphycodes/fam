-- Add Jerry to the family list. Seeded as owner: the account operator, and the
-- first passcode member who can manage the family + soundtrack.
insert into public.members (first_name, display_name, role)
values ('Jerry', 'Jerry', 'owner')
on conflict do nothing;
