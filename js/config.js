// Informations affichées dans l'en-tête. À modifier ici si le semestre ou le groupe change.
export const APP = {
  brand: 'BIO CAMPUS',
  formation: 'BUT Génie Biologique',
  year: '2ᵉ année',
  parcours: 'Biologie médicale et biotechnologique',
  semester: 'Semestre 3',
  semesterNo: 3,
  group: 'C2',
};
export const TYPE_META = {
  CM: { label: 'CM', long: 'Cours magistral', icon: 'book', cls: 'cm' },
  TD: { label: 'TD', long: 'Travaux dirigés', icon: 'users', cls: 'td' },
  TP: { label: 'TP', long: 'Travaux pratiques', icon: 'flask', cls: 'tp' },
  EX: { label: 'Examen', long: 'Examen', icon: 'flag', cls: 'ex' },
  AUTO: { label: 'Autonomie', long: 'Séance en autonomie', icon: 'user', cls: 'auto' },
  OTHER: { label: 'Autre', long: 'Autre événement', icon: 'info', cls: 'other' },
  OFF: { label: 'Congé', long: 'Congé', icon: 'sun', cls: 'off' },
  TT: { label: 'Tiers temps', long: 'Tiers temps', icon: 'clock', cls: 'other' },
};
export const VIEW_META = {
  dashboard: { label: 'Tableau de bord', short: 'Accueil', icon: 'home' },
  planning: { label: 'Emploi du temps', short: 'Planning', icon: 'calendar' },
  notes: { label: 'Notes', short: 'Notes', icon: 'award' },
  stats: { label: 'Statistiques', short: 'Stats', icon: 'chart' },
  sim: { label: 'Simulateur', short: 'Simulateur', icon: 'calc' },
  settings: { label: 'Paramètres', short: 'Réglages', icon: 'sliders' },
};
