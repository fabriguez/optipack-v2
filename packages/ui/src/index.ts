// @transitsoftservices/ui - composants UI partages entre apps/web et apps/ops-admin.
// Phase 5 #35 — extraction initiale. Pour ajouter d'autres composants : creer dans
// `src/components/`, exporter ici, eviter les deps lourdes (Radix, lucide -- a charge
// de l'app consommatrice).

export { cn } from './utils/cn';
export { formatDate, formatBytes } from './utils/format';
export { StatusBadge } from './components/StatusBadge';
export {
  Field,
  TextInput,
  Textarea,
  Select,
  SubmitButton,
} from './components/Form';
