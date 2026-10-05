import disclosures from './disclosures.json';

export type DisclosureLanguage = keyof typeof disclosures;

export function getDisclosure(langCode: string = 'en'): string {
  const normalized = langCode.toLowerCase().split('-')[0] as DisclosureLanguage;
  return disclosures[normalized] ?? disclosures.en;
}
