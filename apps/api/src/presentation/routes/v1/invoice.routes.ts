import { Router } from 'express';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { PDFService } from '../../../application/services/PDFService';
import type { InvoiceData } from '../../../application/services/PDFService';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, sortOrder = 'desc' } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);
    const status = req.query.status as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const agencyId = req.query.agencyId as string | undefined;

    const where: any = {
      isActive: true,
      ...(status && { status }),
      ...(clientId && { clientId }),
      ...(agencyId && { agencyId }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' } },
          { client: { fullName: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: sortOrder },
        include: {
          client: { select: { id: true, fullName: true, phone: true } },
          agency: { select: { id: true, name: true, code: true } },
          parcel: { select: { id: true, trackingNumber: true, designation: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, fullName: true, phone: true, email: true } },
        agency: { select: { id: true, name: true, code: true, address: true, phone: true } },
        parcel: { select: { id: true, trackingNumber: true, designation: true, weight: true, destination: true, price: true } },
        payments: { orderBy: { createdAt: 'asc' }, include: { agency: { select: { name: true } }, receivedBy: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, message: 'Facture introuvable' });
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// Generate invoice PDF
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, fullName: true, phone: true, email: true } },
        agency: { select: { id: true, name: true, code: true, address: true, phone: true } },
        parcel: { select: { id: true, trackingNumber: true, designation: true, weight: true, destination: true, price: true } },
        payments: {
          orderBy: { createdAt: 'asc' },
          include: {
            agency: { select: { name: true } },
            receivedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Facture introuvable' });
    }

    const invoiceData: InvoiceData = {
      reference: invoice.reference,
      createdAt: invoice.createdAt,
      client: {
        fullName: invoice.client.fullName,
        phone: invoice.client.phone,
        email: invoice.client.email,
      },
      agency: invoice.agency
        ? { name: invoice.agency.name, code: invoice.agency.code, address: invoice.agency.address, phone: invoice.agency.phone }
        : null,
      parcel: Array.isArray(invoice.parcel)
        ? invoice.parcel.map((p: any) => ({
            trackingNumber: p.trackingNumber,
            designation: p.designation,
            weight: Number(p.weight),
            destination: p.destination,
            price: Number(p.price),
          }))
        : {
            trackingNumber: (invoice.parcel as any).trackingNumber,
            designation: (invoice.parcel as any).designation,
            weight: Number((invoice.parcel as any).weight),
            destination: (invoice.parcel as any).destination,
            price: Number((invoice.parcel as any).price),
          },
      payments: invoice.payments.map((p: any) => ({
        createdAt: p.createdAt,
        method: p.method,
        amount: Number(p.amount),
        agency: p.agency,
      })),
      totalAmount: Number((invoice as any).totalAmount ?? 0),
      discount: Number((invoice as any).discount ?? 0),
      tax: Number((invoice as any).tax ?? 0),
      netAmount: Number((invoice as any).netAmount ?? 0),
      paidAmount: Number((invoice as any).paidAmount ?? 0),
      balance: Number((invoice as any).balance ?? 0),
    };

    const pdfBuffer = await PDFService.generateInvoicePDF(invoiceData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="facture-${invoice.reference}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

export default router;
