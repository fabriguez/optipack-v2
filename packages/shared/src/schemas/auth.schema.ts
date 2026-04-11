import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caracteres'),
});

export const registerSchema = z
  .object({
    email: z.string().email('Email invalide'),
    password: z
      .string()
      .min(8, 'Le mot de passe doit contenir au moins 8 caracteres')
      .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
      .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre'),
    confirmPassword: z.string(),
    firstName: z.string().min(2, 'Le prenom doit contenir au moins 2 caracteres'),
    lastName: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
    phone: z.string().min(8, 'Numero de telephone invalide'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const verify2FASchema = z.object({
  code: z.string().length(6, 'Le code doit contenir 6 chiffres'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type Verify2FAInput = z.infer<typeof verify2FASchema>;
