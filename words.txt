import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL      = 'https://nmxciifpqfnyujtingnd.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5teGNpaWZwcWZueXVqdGluZ25kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MDM5MDMsImV4cCI6MjA5MzE3OTkwM30.zB2pRG_T-41QNn3-Md5IV4ooDsNOoXMdKvCY9R60KC8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: username } },
  });
  if (error) throw error;
  return data.user;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function saveScore({ score, wordsused, maxcombo }) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const username =
    user.user_metadata?.username ||
    user.user_metadata?.display_name ||
    user.email.split('@')[0];

  const { error } = await supabase.from('leaderboard').insert({
    userid:    user.id,
    username,
    score,
    wordsused,
    maxcombo,
  });

  if (error) throw error;
}

export async function getLeaderboard(limit = 15, sortBy = 'score') {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('username, score, wordsused, maxcombo, createdat')
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getMyGames(since = null) {
  const user = await getCurrentUser();

  let query = supabase
    .from('leaderboard')
    .select('score, wordsused, maxcombo, createdat')
    .eq('userid', user.id)
    .order('createdat', { ascending: false });

  if (since) query = query.gte('createdat', since);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function logTrigramPlay({
  trigram,
  solved,
  wordlength,
  timetaken,
}) {
  const user = await getCurrentUser();

  const { error } = await supabase.from('trigramplays').insert({
    userid:     user.id,
    trigram,
    solved,
    wordlength: wordlength ?? null,
    timetaken:  timetaken ?? null,
  });

  if (error) throw error;
}

export async function getMyTrigramPlays(since = null) {
  const user = await getCurrentUser();

  let query = supabase
    .from('trigramplays')
    .select('trigram, solved, wordlength, timetaken, createdat')
    .eq('userid', user.id);

  if (since) query = query.gte('createdat', since);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
