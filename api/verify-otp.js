import { createClient } from '@supabase/supabase-js';
import argon2 from 'argon2';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ error: 'email & code required' });

    // récupérer le dernier OTP non utilisé / non expiré
    const { data: rows, error } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'query failed' });
    }
    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Code expiré ou invalide' });
    }

    // comparer avec les 3 derniers (tolérance)
    let matchedId = null;
    for (const row of rows) {
      const ok = await argon2.verify(row.code_hash, code);
      if (ok) { matchedId = row.id; break; }
    }
    if (!matchedId) return res.status(400).json({ error: 'Code invalide' });

    // marquer comme utilisé
    await supabase.from('email_otps').update({ used_at: new Date().toISOString() }).eq('id', matchedId);

    // créer / récupérer l’utilisateur auth et démarrer une session
    // 1) s’il existe déjà par email -> start session avec generateLink type magiclink désactivé, on utilise OTP :
    const authAdmin = supabase.auth.admin;
    // chercher user
    const { data: list } = await authAdmin.listUsers({ email });
    let user = list?.users?.[0];

    if (!user) {
      // créer un compte "passwordless" avec un mot de passe aléatoire
      const pwd = cryptoRandom(32);
      const { data: created, error: cErr } = await authAdmin.createUser({
        email,
        password: pwd,
        email_confirm: true    // on valide directement (OTP a validé l’adresse)
      });
      if (cErr) {
        console.error(cErr);
        return res.status(500).json({ error: 'create user failed' });
      }
      user = created.user;
    }

    // créer une session
    const { data: token, error: tErr } = await authAdmin.generateSession({ user_id: user.id });
    if (tErr) {
      console.error(tErr);
      return res.status(500).json({ error: 'session failed' });
    }

    // retourner les tokens au client Web (il fera supabase.auth.setSession)
    return res.json({ ok: true, session: token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}

function cryptoRandom(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
