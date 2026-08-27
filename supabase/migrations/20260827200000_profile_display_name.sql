-- Minimal, user-owned TubeMilestones profile identity.
-- Derived Auth metadata remains presentation-only unless the user explicitly saves a name.

alter table public.profiles
  add column display_name text;

alter table public.profiles
  add constraint profiles_display_name_check check (
    display_name is null
    or (
      char_length(display_name) between 1 and 80
      and display_name !~ '^[[:space:]]|[[:space:]]$'
    )
  );

grant update (display_name) on table public.profiles to authenticated;

comment on column public.profiles.display_name is
  'Optional user-saved TubeMilestones display name; Auth metadata fallbacks are not persisted automatically.';
