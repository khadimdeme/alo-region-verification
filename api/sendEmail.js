import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { to, subject, html } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Champs manquants dans la requête.' });
    }

    // ✅ Envoi propre avec encodage UTF-8 garanti
    const email = await resend.emails.send({
      from: 'Alo Region <contact@aloregion.com>',
      to,
      subject,
      html,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });

    console.log(`✅ Email envoyé à ${to} avec sujet : ${subject}`);
    return res.status(200).json({ success: true, email });
  } catch (error) {
    console.error('❌ Erreur envoi mail Resend:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
