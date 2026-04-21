export interface ServicePageSection {
  title: string;
  items: string[];
}

export interface ServicePagePricing {
  label: string;
  price: string;
  unit?: string;
  highlight?: boolean;
}

export interface ServicePageContent {
  headline: string;
  intro: string;
  forWhom: string[];
  sections: ServicePageSection[];
  pricing: ServicePagePricing[];
  faq?: Array<{ question: string; answer: string }>;
}

export interface HomepageService {
  slug: string;
  title: string;
  description: string;
  icon: string;
  features: string[];
  price: string;
  stripeServiceKey?: string;
  pageContent: ServicePageContent;
}

export interface LeistungService {
  key: string;
  name: string;
  price: string;
  unit: string;
  desc: string;
  highlight?: boolean;
  stundensatz_cents?: number;
  durationMin?: number;
}

export interface LeistungCategory {
  id: string;
  title: string;
  icon: string;
  description?: string;
  services: LeistungService[];
}

export interface LeistungPricingHighlight {
  label: string;
  price: string;
  note: string;
  highlight?: boolean;
}

export interface BrandConfig {
  brand: 'mentolder' | 'korczewski';
  meta: {
    siteTitle: string;
    siteDescription: string;
  };
  contact: {
    name: string;
    email: string;
    phone: string;
    city: string;
  };
  legal: {
    street: string;
    zip: string;
    jobtitle: string;
    chamber: string;
    ustId: string;
    website: string;
    tagline: string;
  };
  homepage: {
    stats: Array<{ value: string; label: string }>;
    servicesHeadline: string;
    servicesSubheadline: string;
    whyMeHeadline: string;
    whyMeIntro: string;
    whyMePoints: Array<{ iconPath: string; title: string; text: string }>;
    avatarType: 'image' | 'initials';
    avatarSrc?: string;
    avatarInitials?: string;
    quote: string;
    quoteName: string;
  };
  services: HomepageService[];
  leistungen: LeistungCategory[];
  leistungenPricingHighlight?: LeistungPricingHighlight[];
  uebermich: {
    pageHeadline: string;
    subheadline: string;
    introParagraphs: string[];
    sections: Array<{ title: string; content: string }>;
    milestones: Array<{ year: string; title: string; desc: string }>;
    notDoing: Array<{ title: string; text: string }>;
    privateText: string;
  };
  kontakt: {
    intro: string;
    sidebarTitle: string;
    sidebarText: string;
    sidebarCta: string;
    showPhone: boolean;
    showSteps?: boolean;
  };
  faq: Array<{ question: string; answer: string }>;
  leistungenCta: {
    href: string;
    text: string;
  };
  features: {
    hasBooking: boolean;
    hasRegistration: boolean;
    hasOIDC: boolean;
    hasBilling: boolean;
  };
}
