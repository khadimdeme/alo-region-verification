import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(`
      <h2 style="color:red">❌ Token manquant</h2>
      <p>Merci de vérifier que le lien est correct.</p>
    `);
  }

  // 1. Vérifie si le token existe
  const { data, error } = await supabase
    .from('email_verifications')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(400).send(`
      <h2 style="color:red">❌ Token invalide</h2>
      <p>Ce lien est incorrect ou expiré.</p>
    `);
  }

  const redirectUrl = `alo-region://email-verified?access_token=${token}`;

  if (data.verified) {
    return res.status(200).send(`
      <html>
        <head>
          <title>E-mail déjà vérifié</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <script>
            setTimeout(function() {
              window.location.href = "${redirectUrl}";
            }, 500);
          </script>
        </head>
        <body style="text-align:center; margin-top:100px; font-family:sans-serif;">
          <h2 style="color:green">✅ Ton e-mail a déjà été vérifié !</h2>
          <p>Si l’application ne s’ouvre pas automatiquement, clique ci-dessous.</p>
          <a href="${redirectUrl}" target="_blank">
            <button style="margin-top:20px;padding:12px 24px;background-color:#3EC28F;color:white;border:none;border-radius:6px;font-size:16px;">
              Ouvrir Alo Région
            </button>
          </a>
        </body>
      </html>
    `);
  }

  // 2. Vérifie expiration
  const now = new Date();
  if (new Date(data.expires_at) < now) {
    return res.status(400).send(`
      <h2 style="color:red">❌ Token expiré</h2>
      <p>Ce lien n’est plus valide. Veuillez en demander un nouveau.</p>
    `);
  }

  // 3. Marque comme vérifié
  await supabase
    .from('email_verifications')
    .update({ verified: true })
    .eq('token', token);

  // 4. Affiche page de confirmation + bouton
  return res.status(200).send(`
    <html>
      <head>
        <title>Vérification réussie</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script>
          setTimeout(function() {
            window.location.href = "${redirectUrl}";
          }, 500);
        </script>
      </head>
      <body style="text-align:center; margin-top:100px; font-family:sans-serif;">
        <h2 style="color:green">✅ Ton e-mail a bien été vérifié !</h2>
        <p>Si l’application ne s’ouvre pas automatiquement, clique ci-dessous.</p>
        <a href="${redirectUrl}" target="_blank">
          <button style="margin-top:20px;padding:12px 24px;background-color:#3EC28F;color:white;border:none;border-radius:6px;font-size:16px;">
            Ouvrir Alo Région
          </button>
        </a>
      </body>
    </html>
  `);
}
