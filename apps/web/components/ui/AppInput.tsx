import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';

interface AppInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  ({ className, label, error, id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    // Champ password : oeil pour basculer la visibilite (type password <-> text).
    const isPassword = type === 'password';
    const [visible, setVisible] = useState(false);
    const resolvedType = isPassword ? (visible ? 'text' : 'password') : type;

    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <Input
            ref={ref}
            id={inputId}
            type={resolvedType}
            className={cn(
              'h-11 rounded-xl',
              isPassword && 'pr-11',
              error && 'border-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/20',
              className,
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  },
);

AppInput.displayName = 'AppInput';
