import multer from 'multer';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024; // 25 MB pour pdf/xlsx/word/...

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const ALLOWED_DOCUMENT_TYPES = new Set<string>([
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/csv',
  'text/plain',
]);

/**
 * Middleware multer en memoire pour upload d'image.
 * - Stocke le fichier en buffer (req.file.buffer)
 * - Refuse les types non-image
 * - Limite a 5 MB
 */
export const uploadImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(new Error('Type de fichier non supporte. Utilisez JPG, PNG, WEBP ou GIF.'));
      return;
    }
    cb(null, true);
  },
}).single('image');

/** Upload generique de document : images + PDF + Excel + Word + CSV/TXT, max 25 MB. */
export const uploadDocumentMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOCUMENT_TYPES.has(file.mimetype)) {
      cb(new Error('Type de fichier non supporte (image, PDF, Word, Excel, CSV, TXT acceptes).'));
      return;
    }
    cb(null, true);
  },
}).single('file');

export function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'application/pdf':
      return 'pdf';
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx';
    case 'application/vnd.ms-excel':
      return 'xls';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    case 'application/msword':
      return 'doc';
    case 'text/csv':
      return 'csv';
    case 'text/plain':
      return 'txt';
    default:
      return 'bin';
  }
}
