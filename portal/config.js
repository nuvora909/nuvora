// Production settings for the portal. Both values are public by design: the anon key only allows what the
// database's row-level security and function grants allow. Filled in when the Supabase project is created.
// (The local dev server replaces this file with its own values.)
window.NUVORA_CONFIG = Object.freeze({
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  anonKey: 'YOUR-ANON-KEY',
  environment: 'production',
});
