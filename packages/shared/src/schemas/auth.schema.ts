import { z } from 'zod';

/**
 * Login backoffice : accepte email OU telephone dans le champ `email`
 * (legacy nommage). Validation lache : on accepte tout string non vide.
 * La resolution email/telephone se fait cote API (LoginUseCase ->
 * userRepo.findByIdentifier).
 */
export const loginSchema = z.object({
  email: z.string().min(4, 'Telephone ou email requis'),
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
  // .strict() : rejette tout champ inconnu (ex. organizationId injecte par un
  // client malveillant). L'organizationId est derive du user authentifie cote API.
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const verify2FASchema = z.object({
  code: z.string().length(6, 'Le code doit contenir 6 chiffres'),
});

// Politique mot de passe partagee (alignee sur l'inscription).
const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caracteres')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const resetPasswordSchema = z
  .object({
    email: z.string().email('Email invalide'),
    code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type Verify2FAInput = z.infer<typeof verify2FASchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
