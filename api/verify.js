// pages/api/verify.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(`
      <h2 style="color:red;">❌ Token manquant</h2>
      <p>Merci de vérifier que le lien est correct.</p>
    `);
  }

  try {
    const { data: row, error } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('token', token)
      .single();

    if (error || !row) {
      return res.send(`
        <h2 style="color:red;">❌ Token invalide ou introuvable.</h2>
        <p>Ce lien n’est plus valable ou n’a jamais existé.</p>
      `);
    }

    const now = new Date();
    const expiration = new Date(row.expires_at);

    if (expiration < now) {
      return res.send(`
        <h2 style="color:red;">⏰ Ce lien a expiré.</h2>
        <p>Merci de redemander un nouveau lien de vérification.</p>
      `);
    }

    const { error: updateError } = await supabase
      .from('email_verifications')
      .update({ verified: true })
      .eq('token', token);

    if (updateError) {
      return res.send(`
        <h2 style="color:red;">❌ Erreur lors de la validation</h2>
        <p>${updateError.message}</p>
      `);
    }

    return res.send(`
      <h2 style="color:green;">✅ Ton e-mail a bien été vérifié !</h2>
      <p>Tu peux désormais utiliser l'application.</p>
      <a href="https://aloregion.com" style="display:inline-block; margin-top:20px; background-color:#3ec28f; padding:10px 20px; color:white; text-decoration:none; border-radius:5px;">
        Retour à Alo Région
      </a>
    `);

  } catch (err) {
    console.error('Erreur de vérification :', err);
    return res.status(500).send(`
      <h2 style="color:red;">❌ Une erreur s'est produite.</h2>
      <p>Merci de réessayer plus tard.</p>
    `);
  }
}
