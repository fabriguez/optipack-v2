'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@optipack/shared';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useLogin } from '@/lib/hooks/useAuth';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const loginMutation = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500">
            <span className="text-2xl font-bold text-white">OP</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">OptiPack</h1>
          <p className="mt-1 text-sm text-gray-500">Connectez-vous a votre compte</p>
        </div>

        {/* Form */}
        <div className="rounded-2xl bg-white p-8 shadow-card border border-gray-100">
          {/* Erreur globale */}
          {loginMutation.isError && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{loginMutation.error.message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <AppInput
              label="Email"
              type="email"
              placeholder="votre@email.com"
              {...register('email')}
              error={errors.email?.message}
              disabled={loginMutation.isPending}
            />

            {/* Password with toggle */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  disabled={loginMutation.isPending}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white px-4 pr-11 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Votre mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <AppButton
              type="submit"
              className="w-full"
              loading={loginMutation.isPending}
              disabled={loginMutation.isPending}
            >
              <LogIn className="h-4 w-4" />
              {loginMutation.isPending ? 'Connexion en cours...' : 'Se connecter'}
            </AppButton>
          </form>
        </div>
      </div>
    </div>
  );
}
