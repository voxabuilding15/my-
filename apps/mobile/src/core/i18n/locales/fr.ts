import type { Translations } from './en';

export const fr: Translations = {
  common: {
    appName: 'Studexa',
    comingSoon: 'Bientôt disponible',
    retry: 'Réessayer',
    cancel: 'Annuler',
    save: 'Enregistrer',
    mockMode: 'Mode démo — données d’exemple',
  },
  tabs: {
    home: 'Accueil',
    documents: 'Documents',
    chat: 'Chat',
    study: 'Réviser',
    profile: 'Profil',
  },
  home: {
    greeting: 'Prêt à apprendre ?',
    subtitle: 'Votre assistant d’étude IA',
  },
  documents: {
    title: 'Documents',
    empty: 'Importez un PDF, DOCX, TXT ou une photo pour commencer.',
  },
  chat: { title: 'Chat', empty: 'Posez une question sur vos documents.' },
  study: { title: 'Réviser', empty: 'Vos quiz, fiches et notes apparaîtront ici.' },
  profile: { title: 'Profil' },
  errors: {
    notFound: 'Cet écran n’existe pas.',
    goHome: 'Retour à l’accueil',
  },
};
