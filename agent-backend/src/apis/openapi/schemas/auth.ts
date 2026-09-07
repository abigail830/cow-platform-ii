import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: z.enum(['user', 'operator', 'admin']),
  roles: z.array(z.string()),
  permissions: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      category: z.string(),
      accessLevel: z.enum(['read', 'write', 'manage']),
      routePatterns: z.array(z.string()),
      apiPatterns: z.array(z.string()),
    }),
  ),
});

export const loginResponseSchema = z.object({
  token: z.string(),
  user: authUserSchema,
});

export const meResponseSchema = z.object({
  user: authUserSchema,
});

export const errorResponseSchema = z.object({
  error: z.string(),
});
