import { z } from 'zod';

/**
 * Simulateur de prix public (site vitrine + app mobile, accessible sans login).
 *
 * Le visiteur choisit une route de transit puis saisit la masse OU le volume
 * selon le mode de facturation de la route (AIR -> kg, SEA -> m3, LAND -> les
 * deux). Si la requete porte un token client valide, l'API applique en plus le
 * tarif partenaire eventuel du client sur la route choisie. La validation fine
 * masse/volume-vs-type est faite cote API (elle depend du type de la route, donc
 * connue seulement apres lookup DB).
 */
export const simulatePriceSchema = z
  .object({
    transitRouteId: z.string().min(1, 'Route de transit requise.'),
    weight: z.coerce.number().positive('La masse doit etre superieure a 0.').optional(),
    volume: z.coerce.number().positive('Le volume doit etre superieur a 0.').optional(),
  })
  .refine((d) => d.weight !== undefined || d.volume !== undefined, {
    message: 'Renseignez une masse ou un volume.',
    path: ['weight'],
  });

export type SimulatePriceInput = z.infer<typeof simulatePriceSchema>;
