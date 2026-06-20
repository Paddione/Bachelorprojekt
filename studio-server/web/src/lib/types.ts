export type TargetLangCode = 'fa' | 'ar' | 'tr' | 'en' | 'fr';

export interface TargetLang {
  code: TargetLangCode;
  label: string;
  rtl: boolean;
}

export interface Client {
  id: string;
  name: string;
  initials: string;
  since: string;
  lang: string;
  category: string;
  created_at: string;
}

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  type: 'text' | 'textarea';
  required: boolean;
  active: boolean;
}

export type SessionStatus = 'aktiv' | 'pausiert' | 'fertig';

export interface Session {
  id: string;
  client_id: string;
  title: string;
  status: SessionStatus;
  current_level: number;
  template_of: string | null;
  lang: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  paused_at: string | null;
}

export interface Level {
  session_id: string;
  level_no: number;
  prompt: string;
  prompt_is_default: boolean;
  answer: string | null;
  notes: string | null;
  done: boolean;
  clipboard: Array<{ id: string; text: string }>;
  generated_at: string | null;
}

export interface StandardLevel {
  level_no: number;
  no: string;
  name: string;
  goal: string;
  prompt: string;
}

export interface StandardProfileField extends ProfileField {
  sort: number;
}

export type Screen =
  | { kind: 'dashboard' }
  | { kind: 'akte'; client: Client }
  | { kind: 'profile'; client: Client }
  | { kind: 'workspace'; session?: Session; client: Client }
  | { kind: 'compare'; session: Session; client: Client }
  | { kind: 'admin' }
  | { kind: 'present'; sessionId: string }
  | { kind: 'export'; sessionId: string };

