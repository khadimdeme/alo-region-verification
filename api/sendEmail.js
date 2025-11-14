import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
      encoding: 'utf-8', // ✅ Force le décodage UTF-8 du body JSON
    },
  },
};

export default async function handler(req, res) {
  // ✅ Réponse toujours UTF-8
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    // 🔧 Vérifie et décode manuellement si le corps est du texte brut
    let { to, subject, html } = req.body;
    if (typeof req.body === 'string') {
      const decoded = Buffer.from(req.body, 'utf8').toString();
      const parsed = JSON.parse(decoded);
      to = parsed.to;
      subject = parsed.subject;
      html = parsed.html;
    }

    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'Champs manquants dans la requête.' });
    }

    // ✅ Envoi via Resend avec encodage UTF-8 explicite
    const email = await resend.emails.send({
      from: 'Alo Region <contact@aloregion.com>',
      to,
      subject,
      html,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Transfer-Encoding': 'quoted-printable',
      },
    });

    console.log('✅ Email envoyé à', to, 'avec sujet :', subject);
    return res.status(200).json({ success: true, email });
  } catch (error) {
    console.error('❌ Erreur envoi mail Resend:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
