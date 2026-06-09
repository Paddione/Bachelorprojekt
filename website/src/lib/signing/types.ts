export interface SignatureData {
  type: 'canvas' | 'checkbox';
  imageData?: string;       // data:image/png;base64,... (canvas only)
  signerName: string;
  ip: string;
  userAgent: string;
  signedAt: string;         // ISO 8601
}

export interface SigningResult {
  success: boolean;
  assignmentId: string;
}

export type AuditEvent = 'viewed' | 'signed' | 'revoked' | 'email_sent' | 'pdf_downloaded';
