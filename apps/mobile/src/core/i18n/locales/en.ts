export const en = {
  common: {
    appName: 'Studexa',
    comingSoon: 'Coming soon',
    retry: 'Try again',
    cancel: 'Cancel',
    save: 'Save',
    mockMode: 'Demo mode — sample data',
  },
  tabs: {
    home: 'Home',
    documents: 'Documents',
    chat: 'Chat',
    study: 'Study',
    profile: 'Profile',
  },
  home: {
    greeting: 'Ready to learn?',
    subtitle: 'Your AI study assistant',
  },
  documents: { title: 'Documents', empty: 'Upload a PDF, DOCX, TXT or photo to get started.' },
  chat: { title: 'Chat', empty: 'Ask anything about your documents.' },
  study: { title: 'Study', empty: 'Quizzes, flashcards and notes will appear here.' },
  profile: { title: 'Profile' },
  errors: {
    notFound: 'This screen does not exist.',
    goHome: 'Go to home',
  },
};

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};
export type Translations = DeepStringRecord<typeof en>;
