const SUPABASE_URL =
'https://lyqdjmkljqzpfhxvysav.supabase.co'

const SUPABASE_KEY =
'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5cWRqbWtsanF6cGZoeHZ5c2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNjc4MTIsImV4cCI6MjEwNjg0MzgxMn0.OZWOeeL0W4_zNNKkjvLk4IaDF3T0uek-xgOL6F3HyUI'

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
