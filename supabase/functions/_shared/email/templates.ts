import { type AppLocale, type EmailCodePurpose, isRtlLocale } from '@studexa/shared';

import type { EmailMessage } from './types.ts';

type Copy = { subject: string; intro: string; expiry: (minutes: number) => string; ignore: string };

const COPY: Record<AppLocale, Record<EmailCodePurpose, Copy>> = {
  en: {
    verify_email: {
      subject: 'Your Studexa verification code',
      intro: 'Enter this code in the Studexa app to verify your email address:',
      expiry: (m) => `The code expires in ${m} minutes.`,
      ignore: 'If you did not create a Studexa account, you can ignore this email.',
    },
    reset_password: {
      subject: 'Your Studexa password reset code',
      intro: 'Enter this code in the Studexa app to choose a new password:',
      expiry: (m) => `The code expires in ${m} minutes.`,
      ignore:
        'If you did not ask to reset your password, you can ignore this email — your password has not changed.',
    },
  },
  fr: {
    verify_email: {
      subject: 'Votre code de vérification Studexa',
      intro: 'Saisissez ce code dans l’application Studexa pour vérifier votre adresse e-mail :',
      expiry: (m) => `Le code expire dans ${m} minutes.`,
      ignore: 'Si vous n’avez pas créé de compte Studexa, ignorez cet e-mail.',
    },
    reset_password: {
      subject: 'Votre code de réinitialisation Studexa',
      intro: 'Saisissez ce code dans l’application Studexa pour choisir un nouveau mot de passe :',
      expiry: (m) => `Le code expire dans ${m} minutes.`,
      ignore:
        'Si vous n’avez pas demandé de réinitialisation, ignorez cet e-mail — votre mot de passe n’a pas changé.',
    },
  },
  ar: {
    verify_email: {
      subject: 'رمز التحقق الخاص بك في Studexa',
      intro: 'أدخل هذا الرمز في تطبيق Studexa لتأكيد بريدك الإلكتروني:',
      expiry: (m) => `تنتهي صلاحية الرمز خلال ${m} دقائق.`,
      ignore: 'إذا لم تنشئ حسابًا في Studexa، يمكنك تجاهل هذه الرسالة.',
    },
    reset_password: {
      subject: 'رمز إعادة تعيين كلمة المرور في Studexa',
      intro: 'أدخل هذا الرمز في تطبيق Studexa لاختيار كلمة مرور جديدة:',
      expiry: (m) => `تنتهي صلاحية الرمز خلال ${m} دقائق.`,
      ignore: 'إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة — لم تتغير كلمة مرورك.',
    },
  },
};

export function codeEmail(params: {
  to: string;
  code: string;
  purpose: EmailCodePurpose;
  locale: AppLocale;
  ttlMinutes: number;
}): EmailMessage {
  const copy = COPY[params.locale][params.purpose];
  const dir = isRtlLocale(params.locale) ? 'rtl' : 'ltr';
  // The only dynamic values are the numeric code and minutes, so no HTML escaping is needed.
  const html = `<!doctype html><html lang="${params.locale}" dir="${dir}"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f7fb;padding:24px;color:#0b1220">
<div style="max-width:480px;margin:auto;background:#fff;border-radius:16px;padding:32px">
<p style="font-size:20px;font-weight:700;color:#0066ff;margin:0 0 16px">Studexa</p>
<p style="font-size:16px;line-height:24px">${copy.intro}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0" dir="ltr">${params.code}</p>
<p style="font-size:14px;color:#5b6475">${copy.expiry(params.ttlMinutes)}</p>
<p style="font-size:13px;color:#5b6475">${copy.ignore}</p>
</div></body></html>`;
  const text = `${copy.intro}\n\n${params.code}\n\n${copy.expiry(params.ttlMinutes)}\n\n${copy.ignore}`;
  return { to: params.to, subject: copy.subject, text, html };
}
