import { Router } from 'express';
import { AuthController } from '../../controllers/AuthController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { authLimiter, forgotPasswordLimiter, resetPasswordLimiter } from '../../middleware/rateLimit';
import { loginSchema, registerSchema } from '@transitsoftservices/shared';

const router = Router();

// Creation de compte STAFF : reservee a un utilisateur authentifie. Le nouveau
// user est rattache a l'organizationId du caller (jamais lu depuis le body).
router.post('/register', authLimiter, authenticate, validate(registerSchema), AuthController.register);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', authLimiter, AuthController.refresh);
router.post('/logout', AuthController.logout);
router.get('/me', authenticate, AuthController.me);

// Mot de passe
router.post('/change-password', authenticate, AuthController.changePassword);
router.post('/forgot-password', forgotPasswordLimiter, AuthController.forgotPassword);
router.post('/reset-password', resetPasswordLimiter, AuthController.resetPassword);

export default router;
