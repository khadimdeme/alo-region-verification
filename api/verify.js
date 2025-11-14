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
      <h2>❌ Lien invalide</h2>
      <p>Le lien de vérification est incorrect ou expiré.</p>
    `);
  }

  try {
    // 1️⃣ Vérifie que le token existe
    const { data, error } = await supabase
      .from('email_verifications')
      .select('id, email, verified, expires_at')
      .eq('token', token)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error('❌ Token introuvable :', error);
      return res.status(400).send(`
        <h2>❌ Lien invalide</h2>
        <p>Ce lien n'existe plus ou a déjà été utilisé.</p>
      `);
    }

    // 2️⃣ Vérifie l’expiration
    const now = new Date();
    const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
    if (expiresAt && expiresAt < now) {
      return res.status(400).send(`
        <h2>❌ Lien expiré</h2>
        <p>Ce lien de vérification a expiré. Merci de demander un nouvel e-mail depuis l’application.</p>
      `);
    }

    // 3️⃣ Marque comme vérifié
    if (!data.verified) {
      const { error: updateError } = await supabase
        .from('email_verifications')
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
        })
        .eq('id', data.id);

      if (updateError) {
        console.error('Erreur update verified:', updateError);
        return res.status(500).send(`
          <h2>⚠️ Erreur interne</h2>
          <p>Impossible de confirmer ton e-mail pour le moment.</p>
        `);
      }
    }

    // 4️⃣ Redirige vers l’app Alo Région
    const redirectUrl = `alo-region://email-verified?verified=1&email=${encodeURIComponent(
      data.email
    )}`;

    // ✨ Page HTML légère et élégante (affichée seulement si l’app ne s’ouvre pas)
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Vérification réussie</title>
        <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
        <style>
          body { font-family: Arial, sans-serif; background: #f6f8fa; text-align: center; padding: 40px; }
          h1 { color: #10B981; }
          p { color: #333; }
          button { background: #10B981; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; margin-top: 20px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>✅ Adresse e-mail confirmée</h1>
        <p>Merci ! Ton adresse <strong>${data.email}</strong> est maintenant vérifiée.</p>
        <p>Si l’application ne s’ouvre pas automatiquement, clique sur le bouton ci-dessous :</p>
        <a href="${redirectUrl}"><button>Ouvrir Alo Région</button></a>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Erreur générale verify:', err);
    return res.status(500).send(`
      <h2>⚠️ Erreur serveur</h2>
      <p>Réessaie plus tard.</p>
    `);
  }
}
