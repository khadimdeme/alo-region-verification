// pages/api/verify.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(renderErrorPage("Token manquant."));
  }

  const { data, error } = await supabase
    .from('email_verifications')
    .select('user_id')
    .eq('token', token)
    .single();

  if (error || !data) {
    return res.status(400).send(renderErrorPage("Lien invalide ou expiré."));
  }

  const { user_id } = data;

  const { error: updateError } = await supabase
    .from('clients')
    .update({ email_verifie_manuellement: true })
    .eq('user_id', user_id);

  if (updateError) {
    return res.status(500).send(renderErrorPage("Erreur lors de la validation de l’e-mail."));
  }

  // ✅ Succès : on renvoie une vraie page HTML stylée
  return res.send(renderSuccessPage());
}

// ✅ PAGE EN CAS DE SUCCÈS
function renderSuccessPage() {
  return `
    <html>
      <head>
        <title>Email vérifié - Alo Région</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body {
            background-color: #f2fdfb;
            font-family: 'Arial', sans-serif;
            text-align: center;
            padding-top: 80px;
            color: #333;
          }
          h1 {
            color: #2f9e7f;
            font-size: 28px;
          }
          p {
            font-size: 16px;
            margin-bottom: 30px;
          }
          .button {
            background-color: #3EC28F;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <h1>✅ Email vérifié avec succès !</h1>
        <p>Bienvenue sur Alo Région. Tu peux maintenant retourner dans l'application.</p>
        <a class="button" href="https://aloregion.com/email-verified">Ouvrir Alo Région</a>
      </body>
    </html>
  `;
}

// ❌ PAGE EN CAS D’ERREUR
function renderErrorPage(message) {
  return `
    <html>
      <head>
        <title>Erreur de vérification</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body {
            background-color: #fff3f3;
            font-family: 'Arial', sans-serif;
            text-align: center;
            padding-top: 80px;
            color: #b00020;
          }
          h1 {
            font-size: 26px;
            margin-bottom: 20px;
          }
          p {
            font-size: 16px;
            margin-bottom: 30px;
          }
          .button {
            background-color: #3EC28F;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <h1>❌ ${message}</h1>
        <p>Merci de vérifier que le lien est correct.</p>
        <a class="button" href="https://aloregion.com">Retour à Alo Région</a>
      </body>
    </html>
  `;
}
