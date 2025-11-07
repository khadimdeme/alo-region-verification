// api/verify.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { token } = req.query;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!token) {
      return res.status(400).send(`
        <h2 style="color:red">❌ Token manquant</h2>
        <p>Merci de vérifier que le lien est correct.</p>
      `);
    }

    // 1) Lire le token dans ta table
    const { data, error } = await supabase
      .from('email_verifications')          // <-- ta table existante
      .select('*')
      .eq('token', token)
      .single();

    if (error || !data) {
      return res.status(400).send(`
        <h2 style="color:red">❌ Token invalide</h2>
        <p>Ce lien est incorrect ou expiré.</p>
      `);
    }

    // 2) Expiration ?
    if (new Date(data.expires_at) < new Date()) {
      return res.status(400).send(`
        <h2 style="color:red">❌ Token expiré</h2>
        <p>Ce lien n’est plus valide. Veuillez en demander un nouveau.</p>
      `);
    }

    // 3) Marquer vérifié si besoin (idempotent)
    if (!data.verified) {
      await supabase
        .from('email_verifications')
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq('token', token);
    }

    // 4) Deep link mobile — PAS d’access_token ici
    const redirectUrl =
      `alo-region://email-verified?verified=1&email=${encodeURIComponent(data.email)}`;

    return res.status(200).send(`
      <html>
        <head>
          <title>Vérification réussie</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta http-equiv="refresh" content="0; url=${redirectUrl}" />
        </head>
        <body style="text-align:center; margin-top:100px; font-family:system-ui,Segoe UI,Arial">
          <h2 style="color:green">✅ Ton e-mail a bien été vérifié !</h2>
          <p>Si l’application ne s’ouvre pas automatiquement, clique ci-dessous.</p>
          <p><a href="${redirectUrl}">
            <button style="margin-top:20px;padding:12px 24px;background:#10B981;color:white;border:none;border-radius:6px;font-size:16px;">
              Ouvrir Alo Région
            </button>
          </a></p>
          <p style="margin-top:12px"><a href="https://www.aloregion.com/">Retour au site</a></p>
        </body>
      </html>
    `);
  } catch (e) {
    console.error(e);
    return res.status(500).send(`<h2>Erreur serveur.</h2>`);
  }
}
