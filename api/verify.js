// api/verify.js

import { createClient } from '@supabase/supabase-js';

// ✅ Ces variables doivent être présentes dans Vercel (onglet "Environment Variables")
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  const { token } = req.query;

  // ✅ Vérifie si le token est présent
  if (!token) {
    return res.send(`
      <html>
        <head><title>Token manquant</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:40px;">
          <h2 style="color:red;">❌ Token manquant.</h2>
          <p>Merci de vérifier que le lien est correct.</p>
          <a href="https://aloregion.com" style="display:inline-block; margin-top:20px; background-color:#3ec28f; padding:10px 20px; color:white; text-decoration:none; border-radius:5px;">
            Retour à Àlo Région
          </a>
        </body>
      </html>
    `);
  }

  try {
    // ✅ Vérifie si le token existe dans la table "email_verifications"
    const { data: row, error } = await supabase
      .from('email_verifications')
      .select('user_id')
      .eq('token', token)
      .single();

    if (error || !row) {
      return res.send(`
        <html>
          <head><title>Token invalide</title></head>
          <body style="font-family:sans-serif; text-align:center; padding:40px;">
            <h2 style="color:red;">❌ Token invalide ou expiré.</h2>
            <p>Ce lien n’est plus valable ou a déjà été utilisé.</p>
            <a href="https://aloregion.com" style="display:inline-block; margin-top:20px; background-color:#3ec28f; padding:10px 20px; color:white; text-decoration:none; border-radius:5px;">
              Retour à Àlo Région
            </a>
          </body>
        </html>
      `);
    }

    const { user_id } = row;

    // ✅ Met à jour le champ email_verifie_manuellement = true dans la table "clients"
    const { error: updateError } = await supabase
      .from('clients')
      .update({ email_verifie_manuellement: true })
      .eq('user_id', user_id);

    if (updateError) {
      throw updateError;
    }

    // ✅ Supprime le token de vérification
    await supabase
      .from('email_verifications')
      .delete()
      .eq('token', token);

    // ✅ Message de succès
    return res.send(`
      <html>
        <head><title>Succès</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:40px;">
          <h2 style="color:green;">✅ E-mail vérifié avec succès !</h2>
          <p>Tu peux maintenant utiliser pleinement ton compte.</p>
          <a href="https://aloregion.com" style="display:inline-block; margin-top:20px; background-color:#3ec28f; padding:10px 20px; color:white; text-decoration:none; border-radius:5px;">
            Ouvrir l'app Alo Région
          </a>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Erreur de vérification :', err);
    return res.status(500).send(`
      <html>
        <head><title>Erreur</title></head>
        <body style="font-family:sans-serif; text-align:center; padding:40px;">
          <h2 style="color:red;">❌ Une erreur s'est produite.</h2>
          <p>Merci de réessayer plus tard.</p>
          <a href="https://aloregion.com" style="display:inline-block; margin-top:20px; background-color:#3ec28f; padding:10px 20px; color:white; text-decoration:none; border-radius:5px;">
            Retour à l'accueil
          </a>
        </body>
      </html>
    `);
  }
}
