-- Add this function in Supabase SQL Editor
-- Run: Supabase Dashboard -> SQL Editor -> New Query -> paste and Run

create or replace function increment_balance(uid text, amount integer)
returns void
as $$
  update users
  set balance = coalesce(balance, 0) + amount
  where id = uid;
$$ language sql security definer;
