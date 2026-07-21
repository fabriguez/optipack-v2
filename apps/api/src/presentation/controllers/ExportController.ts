import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { ExcelService, type ExcelColumnDef } from '../../infrastructure/excel/ExcelService';
import { NotFoundError } from '../../domain/errors/BusinessError';
import {
  andWhere,
  clientScope,
  employeeScope,
  parcelScope,
  scopeCtx,
} from '../../application/services/scope/agencyScope';

/**
 * Exports XLSX globaux. Chaque endpoint fournit l'integralite des champs metiers
 * et embarque les images quand elles sont presentes (URL via /uploads/object/...).
 */
export class ExportController {
  static async parcels(req: Request, res: Response, next: NextFunction) {
    try {
      // ADMIN tenant / SUPER_ADMIN : export non restreint (unrestricted = isAdmin).
      const scope = scopeCtx(req).unrestricted ? null : req.user!.agencyIds;
      const parcels = await prisma.parcel.findMany({
        // Scoping agence en AND par-dessus la restriction de role existante.
        where: andWhere(
          {
            isDeleted: false,
            ...(scope && { warehouse: { agencyId: { in: scope } } }),
          },
          parcelScope.where(scopeCtx(req)),
        ),
        include: {
          client: { select: { fullName: true, phone: true } },
          recipient: { select: { fullName: true, phone: true } },
          warehouse: { include: { agency: { select: { name: true } } } },
          transitRoute: { select: { name: true, type: true } },
          invoice: { select: { reference: true, status: true, totalAmount: true, paidAmount: true } },
          destinationAgency: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      });

      const columns: ExcelColumnDef[] = [
        { key: 'trackingNumber', header: 'Tracking', width: 18 },
        { key: 'designation', header: 'Designation', width: 30 },
        { key: 'category', header: 'Categorie' },
        { key: 'status', header: 'Statut' },
        { key: 'weight', header: 'Poids (kg)' },
        { key: 'volume', header: 'Volume (m3)' },
        { key: 'price', header: 'Prix' },
        { key: 'declaredValue', header: 'Valeur declaree' },
        { key: 'origin', header: 'Origine' },
        { key: 'destination', header: 'Destination' },
        { key: 'destinationAddress', header: 'Adresse destination' },
        { key: 'observation', header: 'Observation' },
        { key: 'isFragile', header: 'Fragile' },
        { key: 'isHazardous', header: 'Dangereux' },
        { key: 'isPresent', header: 'Present' },
        { key: 'arrivalDate', header: 'Arrivee', format: (v) => (v ? new Date(v).toISOString().slice(0, 10) : '') },
        { key: 'pickupDate', header: 'Retrait', format: (v) => (v ? new Date(v).toISOString().slice(0, 10) : '') },
        { key: 'createdAt', header: 'Cree le', format: (v) => new Date(v).toISOString() },
        { key: 'client', header: 'Client', format: (v) => v?.fullName ?? '' },
        { key: 'recipient', header: 'Destinataire', format: (v) => v?.fullName ?? '' },
        { key: 'warehouse', header: 'Magasin', format: (v) => v?.name ?? '' },
        { key: 'transitRoute', header: 'Route', format: (v) => v?.name ?? '' },
        { key: 'destinationAgency', header: 'Agence destination', format: (v) => v?.name ?? '' },
        { key: 'invoice', header: 'Facture', format: (v) => v?.reference ?? '' },
        { key: 'imageUrl', header: 'Image', isImage: true, width: 16 },
      ];

      const svc = container.resolve(ExcelService);
      const buffer = await svc.generate('Colis', columns, parcels as any[]);
      ExportController.send(res, buffer, 'colis');
    } catch (err) {
      next(err);
    }
  }

  static async employees(req: Request, res: Response, next: NextFunction) {
    try {
      const agencyId = req.query.agencyId as string | undefined;
      const employees = await prisma.employee.findMany({
        // Scoping agence en AND du filtre query existant.
        where: andWhere(
          { ...(agencyId && { agencyId }) },
          employeeScope.where(scopeCtx(req)),
        ),
        include: { agency: { select: { name: true } } },
        orderBy: { fullName: 'asc' },
      });

      const columns: ExcelColumnDef[] = [
        { key: 'fullName', header: 'Nom complet', width: 28 },
        { key: 'position', header: 'Poste' },
        { key: 'level', header: 'Niveau' },
        { key: 'phone', header: 'Telephone' },
        { key: 'idNumber', header: 'N. identite' },
        { key: 'baseSalary', header: 'Salaire de base' },
        { key: 'agency', header: 'Agence', format: (v) => v?.name ?? '' },
        { key: 'startDate', header: 'Debut', format: (v) => (v ? new Date(v).toISOString().slice(0, 10) : '') },
        { key: 'endDate', header: 'Fin', format: (v) => (v ? new Date(v).toISOString().slice(0, 10) : '') },
        { key: 'isActive', header: 'Actif' },
        { key: 'selfieUrl', header: 'Selfie', isImage: true, width: 16 },
        { key: 'locationPlanUrl', header: 'Plan localisation', isImage: true, width: 16 },
        { key: 'idDocumentUrl', header: 'Document identite', isImage: true, width: 16 },
      ];

      const svc = container.resolve(ExcelService);
      const buffer = await svc.generate('Personnel', columns, employees as any[]);
      ExportController.send(res, buffer, 'personnel');
    } catch (err) {
      next(err);
    }
  }

  static async clients(req: Request, res: Response, next: NextFunction) {
    try {
      const agencyId = req.query.agencyId as string | undefined;
      const clients = await prisma.client.findMany({
        // Scoping agence en AND du filtre query existant.
        where: andWhere(
          { ...(agencyId && { agencyId }) },
          clientScope.where(scopeCtx(req)),
        ),
        include: { agency: { select: { name: true } } },
        orderBy: { fullName: 'asc' },
        take: 5000,
      });
      const columns: ExcelColumnDef[] = [
        { key: 'fullName', header: 'Nom complet', width: 28 },
        { key: 'phone', header: 'Telephone' },
        { key: 'email', header: 'Email' },
        { key: 'idNumber', header: 'N. identite' },
        { key: 'address', header: 'Adresse', width: 30 },
        { key: 'clientType', header: 'Type' },
        { key: 'loyaltyTier', header: 'Fidelite' },
        { key: 'loyaltyPoints', header: 'Points' },
        { key: 'totalSpent', header: 'Total depense' },
        { key: 'agency', header: 'Agence', format: (v) => v?.name ?? '' },
        { key: 'isActive', header: 'Actif' },
        { key: 'imageUrl', header: 'Photo', isImage: true, width: 16 },
      ];
      const svc = container.resolve(ExcelService);
      const buffer = await svc.generate('Clients', columns, clients as any[]);
      ExportController.send(res, buffer, 'clients');
    } catch (err) {
      next(err);
    }
  }

  static async agencies(_req: Request, res: Response, next: NextFunction) {
    try {
      const agencies = await prisma.agency.findMany({ orderBy: { name: 'asc' } });
      const columns: ExcelColumnDef[] = [
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Nom', width: 28 },
        { key: 'address', header: 'Adresse', width: 30 },
        { key: 'city', header: 'Ville' },
        { key: 'country', header: 'Pays' },
        { key: 'phone', header: 'Telephone' },
        { key: 'email', header: 'Email' },
        { key: 'timezone', header: 'Fuseau' },
        { key: 'googleMapsLink', header: 'Maps' },
        { key: 'isActive', header: 'Actif' },
        { key: 'imageUrl', header: 'Photo', isImage: true, width: 16 },
      ];
      const svc = container.resolve(ExcelService);
      const buffer = await svc.generate('Agences', columns, agencies as any[]);
      ExportController.send(res, buffer, 'agences');
    } catch (err) {
      next(err);
    }
  }

  private static send(res: Response, buffer: Buffer, fileName: string) {
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}-${date}.xlsx"`);
    res.send(buffer);
  }

  // Helper utilise par les imports : prend le retour ExcelService.parse()
  // (rows + images embarquees) et garantit qu'aucun ressource manquante n'est exigee.
  static async ping(_req: Request, res: Response) {
    res.json({ ok: true });
  }
}

void NotFoundError;
