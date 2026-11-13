import { z } from 'zod';

export const googleSignInSchema = z.object({
  idToken: z.string().min(1),
  deviceLabel: z.string().max(80).optional(),
});
export type GoogleSignInInput = z.infer<typeof googleSignInSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const logoutSchema = refreshSchema;
export type LogoutInput = RefreshInput;
