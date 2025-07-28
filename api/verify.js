import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(`
      <html>
        <head><title>Token manquant</title></head>
        <body style="font-family:sans-serif; padding:2rem; text-align:center;">
          <h2 style="color:red">❌ Token manquant</h2>
          <p>Merci de vérifier que le lien est correct.</p>
        </body>
      </html>
    `);
  }

  const { data, error } = await supabase
    .from('email_verifications')
    .select('*')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(400).send(`
      <html>
        <head><title>Token invalide</title></head>
        <body style="font-family:sans-serif; padding:2rem; text-align:center;">
          <h2 style="color:red">❌ Token invalide</h2>
          <p>Ce lien est incorrect ou expiré.</p>
        </body>
      </html>
    `);
  }

  if (data.verified) {
    return res.status(200).send(`
      <html>
        <head><title>Déjà vérifié</title></head>
        <body style="font-family:sans-serif; padding:2rem; text-align:center;">
          <h2 style="color:green">✅ E-mail déjà vérifié !</h2>
          <p>Tu peux déjà utiliser l’application.</p>
          <a href="alo-region://email-verified?access_token=${token}" style="
            display:inline-block;
            margin-top:20px;
            padding:12px 24px;
            background-color:#3EC28F;
            color:white;
            text-decoration:none;
            border-radius:6px;
            font-weight:bold;
          ">Retour à Alo Région</a>
        </body>
      </html>
    `);
  }

  const now = new Date();
  if (new Date(data.expires_at) < now) {
    return res.status(400).send(`
      <html>
        <head><title>Token expiré</title></head>
        <body style="font-family:sans-serif; padding:2rem; text-align:center;">
          <h2 style="color:red">❌ Token expiré</h2>
          <p>Ce lien n’est plus valide. Veuillez en demander un nouveau.</p>
        </body>
      </html>
    `);
  }

  await supabase
    .from('email_verifications')
    .update({ verified: true })
    .eq('token', token);

  return res.status(200).send(`
    <html>
      <head><title>Succès</title></head>
      <body style="font-family:sans-serif; padding:2rem; text-align:center;">
        <h2 style="color:green">✅ Ton e-mail a bien été vérifié !</h2>
        <p>Tu peux désormais utiliser l'application.</p>
        <a href="alo-region://email-verified?access_token=${token}" style="
          display:inline-block;
          margin-top:20px;
          padding:12px 24px;
          background-color:#3EC28F;
          color:white;
          text-decoration:none;
          border-radius:6px;
          font-weight:bold;
        ">Retour à Alo Région</a>
      </body>
    </html>
  `);
}
