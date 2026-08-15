export interface BatchItemResult {
  id: string;
  success: boolean;
  error?: string;
  code?: string;
}

export interface BatchResult {
  total: number;
  success: number;
  failed: number;
  results: BatchItemResult[];
}

