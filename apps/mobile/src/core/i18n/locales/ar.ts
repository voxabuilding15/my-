import type { Translations } from './en';

export const ar: Translations = {
  common: {
    appName: 'Studexa',
    comingSoon: 'قريبًا',
    retry: 'حاول مرة أخرى',
    cancel: 'إلغاء',
    save: 'حفظ',
    mockMode: 'الوضع التجريبي — بيانات نموذجية',
  },
  tabs: {
    home: 'الرئيسية',
    documents: 'المستندات',
    chat: 'المحادثة',
    study: 'المراجعة',
    profile: 'الملف الشخصي',
  },
  home: {
    greeting: 'مستعد للتعلّم؟',
    subtitle: 'مساعدك الذكي للدراسة',
  },
  documents: {
    title: 'المستندات',
    empty: 'ارفع ملف PDF أو DOCX أو TXT أو صورة للبدء.',
  },
  chat: { title: 'المحادثة', empty: 'اسأل أي شيء عن مستنداتك.' },
  study: { title: 'المراجعة', empty: 'ستظهر هنا الاختبارات والبطاقات والملاحظات.' },
  profile: { title: 'الملف الشخصي' },
  errors: {
    notFound: 'هذه الشاشة غير موجودة.',
    goHome: 'العودة إلى الرئيسية',
  },
};
