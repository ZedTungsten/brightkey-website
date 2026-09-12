-- The installer portal can share an origin with an authenticated dashboard
-- session. The opaque installer token remains the row-level authorization
-- boundary inside the function for both Data API roles.
grant execute on function public.get_installer_custom_credits(uuid)
  to anon, authenticated;
