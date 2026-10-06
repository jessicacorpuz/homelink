const SUPABASE_URL =
'https://jdtwbiiuimbhozdqrcvn.supabase.co'

const SUPABASE_KEY =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdHdiaWl1aW1iaG96ZHFyY3ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MTE5NDIsImV4cCI6MjA5NzM4Nzk0Mn0.8qDaxtDB7H0lr3bkIdZpMIC7Mwqx2BtMXiIbGIv8fa0'

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
