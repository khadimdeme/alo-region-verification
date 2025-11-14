// api/verify.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.redirect('https://www.aloregion.com/erreur-token'); // fallback simple
  }

  try {
    // 🔍 Cherche la ligne correspondant à ce token
    const { data, error } = await supabase
      .from('email_verifications')
      .select('id, email, expires_at, verified')
      .eq('token', token)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error('Erreur lecture token:', error);
      return res.redirect('https://www.aloregion.com/erreur-token');
    }

    // 🕒 Vérifie expiration
    const now = new Date();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    if (expiresAt && expiresAt < now) {
      return res.redirect('https://www.aloregion.com/erreur-expire');
    }

    // ✅ Met à jour verified = true (idempotent)
    if (!data.verified) {
      const { error: updateError } = await supabase
        .from('email_verifications')
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq('id', data.id);

      if (updateError) {
        console.error('Erreur update verified:', updateError);
        return res.redirect('https://www.aloregion.com/erreur-confirmation');
      }
    }

    // 🚀 Redirection directe vers ton application mobile
    const redirectUrl = `alo-region://email-verified?verified=1&email=${encodeURIComponent(data.email)}`;
    return res.redirect(302, redirectUrl);

  } catch (err) {
    console.error('Erreur générale verify:', err);
    return res.redirect('https://www.aloregion.com/erreur-serveur');
  }
}
