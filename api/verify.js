// pages/api/verify.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Token manquant.');
  }

  const { data, error } = await supabase
    .from('email_verifications')
    .select('user_id')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(400).send('Lien invalide ou expiré.');
  }

  const { user_id } = data;

  const { error: updateError } = await supabase
    .from('clients')
    .update({ email_verifie_manuellement: true })
    .eq('user_id', user_id);

  if (updateError) {
    return res.status(500).send('Erreur lors de la validation de l’e-mail.');
  }

  return res.send(`
    <html>
      <head><title>Vérification réussie</title></head>
      <body style="font-family:sans-serif;text-align:center;margin-top:100px">
        <h1>✅ Email vérifié avec succès</h1>
        <p>Tu peux retourner dans l’application Alo Région.</p>
      </body>
    </html>
  `);
}
