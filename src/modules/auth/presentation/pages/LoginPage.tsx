import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/modules/auth/infrastructure/authApi';
import { useAuthStore } from '@/modules/auth/domain/store/authStore';
import { getAccessToken } from '@/modules/auth/infrastructure/tokenStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginSchema, type LoginValues } from '@/lib/validations/schemas';
import { notify } from '@/lib/notifications/toast';
import { notifyFormErrors } from '@/lib/notifications/formErrors';
import { getHttpErrorMessage } from '@/lib/api';
import { Mail, Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (getAccessToken()) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const onSubmit = async (values: LoginValues) => {
    try {
      const user = await authApi.login(values);
      setUser(user);
      notify.success('Inicio de sesión exitoso');
      navigate('/');
    } catch (err) {
      notify.error(getHttpErrorMessage(err) || 'Credenciales inválidas');
    }
  };

  const invalid = (k: 'email' | 'password') =>
    errors[k] ? 'border-destructive focus-visible:ring-destructive/30' : '';

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center px-4 py-10"
      style={{
        background:
          'linear-gradient(135deg, oklch(0.96 0.025 220) 0%, oklch(0.98 0.005 250) 50%, oklch(0.96 0.04 200) 100%)',
      }}
    >
      {/* Ambient gradients */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 w-[480px] h-[480px] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, oklch(0.74 0.13 210 / 0.45), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full opacity-50 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, oklch(0.50 0.13 255 / 0.40), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-[420px] bg-card rounded-2xl shadow-lg border border-border/60 p-9">
        {/* Brand */}
        <div className="flex flex-col items-center text-center space-y-3 mb-7">
          <div
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center overflow-hidden"
            style={{ boxShadow: '0 8px 24px -8px oklch(0.50 0.13 255 / 0.55)' }}
          >
            <img
              src="/logo-afmi-cuadrado.png"
              alt="AFMI"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-[22px] font-bold tracking-[-0.01em] leading-tight">
              Bienvenido a AFMI
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Iniciá sesión para acceder al sistema de gestión.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit, (errs) => notifyFormErrors(errs))} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                autoComplete="email"
                {...register('email')}
                className={cn('h-10 pl-9', invalid('email'))}
              />
            </div>
            {errors.email ? (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                {...register('password')}
                className={cn('h-10 pl-9 pr-10', invalid('password'))}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.password ? (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3 h-3" />
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-input accent-[var(--brand-blue)]"
              />
              <span className="text-foreground">Recordarme</span>
            </label>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full h-11"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          Sistema de gestión médica de AFMI · Acceso restringido
        </p>
      </div>
    </div>
  );
}
