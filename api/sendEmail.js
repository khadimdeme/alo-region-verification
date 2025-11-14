// api/sendEmail.js
import { Resend } from 'resend';

// ✅ Initialisation du client Resend avec ta clé API stockée dans Vercel
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // ✅ Encodage UTF-8 global (évite les caractères bizarres dans Gmail)
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Champs manquants dans la requête.' });
    }

    // ✅ Envoi via Resend (avec header UTF-8 pour l'HTML)
    const data = await resend.emails.send({
      from: 'Alo Region <contact@aloregion.com>',
      to: Array.isArray(to) ? to : [to], // sécurise même si "to" n'est pas un tableau
      subject,
      html,
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      },
    });

    console.log('✅ Email envoyé à', to, 'avec sujet :', subject);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('❌ Erreur envoi mail Resend:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
