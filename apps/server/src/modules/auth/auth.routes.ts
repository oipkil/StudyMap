import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/authGuard.js';
import * as authController from './auth.controller.js';

const router = Router();

const RegisterSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
  username: z.string().min(3, 'Tên người dùng tối thiểu 3 ký tự').max(30, 'Tên người dùng tối đa 30 ký tự').regex(/^[a-zA-Z0-9_]+$/, 'Tên người dùng chỉ được chứa chữ cái, số và dấu gạch dưới'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  displayName: z.string().min(2, 'Tên hiển thị tối thiểu 2 ký tự').max(50),
});

const LoginSchema = z.object({
  identifier: z.string().min(1, 'Vui lòng nhập email hoặc tên người dùng'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email('Email không đúng định dạng'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Mã token không hợp lệ'),
  newPassword: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự'),
});

router.post('/register', validateBody(RegisterSchema), authController.register);
router.get('/verify-email', authController.verifyEmail);
router.post('/login', validateBody(LoginSchema), authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', authController.getMe);
router.post('/forgot-password', validateBody(ForgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', validateBody(ResetPasswordSchema), authController.resetPassword);
router.get('/sessions', requireAuth, authController.getSessions);
router.post('/revoke-sessions', requireAuth, authController.revokeAllOtherSessions);

export default router;
