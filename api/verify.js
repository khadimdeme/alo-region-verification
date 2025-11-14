// api/verify.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).send(`
      <h2>❌ Token manquant</h2>
      <p>Le lien de vérification est invalide.</p>
    `);
  }

  try {
    // 1️⃣ On récupère la ligne correspondant au token
    const { data, error } = await supabase
      .from('email_verifications')
      .select('id, email, expires_at, verified')
      .eq('token', token)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Erreur lecture token:', error);
      return res.status(500).send('<h2>Erreur serveur</h2><p>Réessaie plus tard.</p>');
    }

    if (!data) {
      return res.status(400).send(`
        <h2>❌ Lien invalide</h2>
        <p>Ce lien de vérification n'existe pas ou a déjà été utilisé.</p>
      `);
    }

    const now = new Date();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;

    if (expiresAt && expiresAt < now) {
      return res.status(400).send(`
        <h2>❌ Lien expiré</h2>
        <p>Ce lien a expiré. Demande un nouvel e-mail de confirmation depuis l'application.</p>
      `);
    }

    // 2️⃣ On met verified = TRUE (idempotent)
    if (!data.verified) {
      const { error: updateError } = await supabase
        .from('email_verifications')
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq('id', data.id);

      if (updateError) {
        console.error('Erreur update verified:', updateError);
        return res.status(500).send('<h2>Erreur serveur</h2><p>Impossible de confirmer ton e-mail.</p>');
      }
    }

    // 3️⃣ Deep link vers l’app (facultatif mais tu l’aimes bien)
    const redirectUrl =
      `alo-region://email-verified?verified=1&email=${encodeURIComponent(data.email)}`;

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>E-mail confirmé – Alo Région</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
      </head>
      <body style="font-family: Arial, sans-serif; background:#f9fafb; padding:40px; text-align:center;">
        <h1 style="color:#10B981;">Adresse e-mail confirmée ✅</h1>
        <p>Merci, ton adresse <strong>${data.email}</strong> est maintenant vérifiée.</p>
        <p>Si l’application ne s’ouvre pas automatiquement, clique sur le bouton ci-dessous.</p>
        <p>
          <a href="${redirectUrl}">
            <button style="margin-top:20px;padding:12px 24px;background:#10B981;color:white;border:none;border-radius:6px;font-size:16px;">
              Ouvrir Alo Région
            </button>
          </a>
        </p>
        <p style="margin-top:12px"><a href="https://www.aloregion.com/">Retour au site</a></p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Erreur générale verify:', err);
    return res.status(500).send('<h2>Erreur serveur</h2><p>Réessaie plus tard.</p>');
  }
}
