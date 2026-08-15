export type FieldType = 'text' | 'textarea' | 'html' | 'select' | 'toggle' | 'image' | 'list' | 'group';

export interface Validation {
  required?: boolean;
  email?: boolean;
  url?: boolean;
  min?: number;
  max?: number;
}

export interface FieldSchema {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  tokens?: boolean;
  options?: { value: string; label: string }[];
  fields?: FieldSchema[];
  validation?: Validation;
}

export interface SectionSchema {
  contentKey: string;
  title: string;
  fields: FieldSchema[];
}

export interface FieldError {
  field: string;
  message: string;
}
