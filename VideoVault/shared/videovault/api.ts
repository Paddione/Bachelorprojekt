import { z } from 'zod';

// App settings endpoints
export const getSettingResponseSchema = z.object({
  key: z.string(),
  value: z.string().nullable(),
});
export type GetSettingResponse = z.infer<typeof getSettingResponseSchema>;

export const setSettingRequestSchema = z.object({
  value: z.any().nullable(),
});
export type SetSettingRequest = z.infer<typeof setSettingRequestSchema>;

export const setSettingResponseSchema = z.object({
  key: z.string(),
  value: z.string().nullable(),
});
export type SetSettingResponse = z.infer<typeof setSettingResponseSchema>;

