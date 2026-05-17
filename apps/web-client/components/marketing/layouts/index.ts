import type { LayoutVariant } from '@transitsoftservices/skins';
import { ClassicLayout } from './ClassicLayout';
import { BoldLayout } from './BoldLayout';
import { MagazineLayout } from './MagazineLayout';
import { EditorialLayout } from './EditorialLayout';
import { MinimalLayout } from './MinimalLayout';

/**
 * Registry layoutVariant -> composant home. Le skin choisit son layout via
 * `layoutVariant` dans ses tokens. Pour ajouter un nouveau layout :
 *  1. Etendre `LayoutVariant` dans packages/skins/src/types.ts
 *  2. Creer le composant ici dans `layouts/`
 *  3. Enregistrer la cle dans HOME_LAYOUTS ci-dessous
 *  4. Assigner ce variant a un skin dans packages/skins/src/skins.ts
 */
export const HOME_LAYOUTS: Record<LayoutVariant, React.ComponentType> = {
  classic: ClassicLayout,
  bold: BoldLayout,
  magazine: MagazineLayout,
  editorial: EditorialLayout,
  minimal: MinimalLayout,
};

export const DEFAULT_HOME_LAYOUT: React.ComponentType = ClassicLayout;
