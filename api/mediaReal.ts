/**
 * mediaReal — SUBIDA DE ARCHIVOS DE LA PARTE 41 (la que exige el módulo hotelero).
 *
 * POR QUÉ HACE FALTA ESTE FICHERO, y no sirve el subidor que ya había:
 *
 * En la app había dos caminos de subida y **ninguno de los dos vale para una habitación**:
 *
 *   1. `lifebookMediaApi.uploadFile` → `POST /lifebook/media/upload` (Parte 4). Guarda en
 *      MinIO con clave `covers/<uuid>.jpg` y devuelve `…/storage/<bucket>/covers/…`.
 *      **No escribe ninguna fila en `lifebook.media_uploads`.** El módulo de hotel valida
 *      cada foto contra esa tabla y además exige que la URL contenga `/lifebook-media/`:
 *      con la URL de la Parte 4 responde `IMAGE_INVALID` y **la habitación no se puede
 *      guardar con fotos**. (Se puede comprobar: la tabla tiene 5 filas y ninguna es de
 *      una habitación — las fotos del hotel de demostración se metieron por SQL a mano.)
 *
 *   2. `StepMedia` (publicar un producto) usa ese mismo endpoint, así que el comercio
 *      tampoco pasa por la verificación real.
 *
 * El camino correcto es el de la Parte 41, en tres pasos, y es el único que deja la fila
 * en `media_uploads` con `status='ready'` y la URL con la forma que el hotel acepta:
 *
 *   1. `POST …/commerce/media/upload-url` → firma una **POST policy** (el tope de tamaño lo
 *      impone el almacenamiento, no el cliente) y **reserva la clave** en la base antes de
 *      firmar, para poder cobrar cuota real y borrar huérfanos.
 *   2. `POST <uploadUrl>` con multipart: primero los campos firmados y **el archivo al
 *      final** (el almacenamiento exige que el campo del archivo sea el último).
 *   3. `POST …/commerce/media/complete` → verifica que el objeto existe, que pesa lo
 *      declarado y que es del tipo declarado; marca la fila `ready` y devuelve la **URL
 *      pública** definitiva. Esa URL es la que se guarda en la habitación.
 *
 * La URL resultante es `https://…/lifebook-media/products/<usuario>/<uuid>.jpg`, que es
 * exactamente lo que el servidor del hotel espera.
 *
 * 02/10/2026 — MODO DUAL MinIO/R2: el backend con Cloudflare R2 firma un **PUT directo**
 * (R2 no implementa el S3 POST Object API) y devuelve `method:'PUT'` + `headers`. Este
 * cliente decide por `method`: POST multipart contra MinIO, PUT en bruto contra R2 con el
 * Content-Type EXACTO que firmó el servidor (otro tipo = 403 SignatureDoesNotMatch).
 */
import { getInfoAsync } from 'expo-file-system';
import { API_BASE } from './config';
import { ApiError, httpRequest } from './httpClient';

const MEDIA = '/lifebook/commerce/media';

export interface SignUploadInput {
  /** `product` = material de catálogo (público). La carpeta de la clave sale de aquí. */
  purpose: 'product' | 'post' | 'docs';
  kind: 'image' | 'video' | 'audio' | 'file';
  mimeType: string;
  fileSizeBytes: number;
  durationKind?: 'short' | 'long';
  durationSec?: number;
}

export interface SignUploadResult {
  uploadUrl: string;
  /** Campos que hay que reenviar TAL CUAL en el multipart (modo POST). */
  fields: Record<string, string>;
  key: string;
  bucket: string;
  visibility: 'public' | 'private';
  publicUrl: string | null;
  maxBytes: number;
  maxSec: number | null;
  /** Cómo subir: POST multipart (MinIO) o PUT directo con `headers` (R2). */
  method: 'POST' | 'PUT';
  /** Cabeceras obligatorias en modo PUT (el Content-Type va FIRMADO: enviarlo igual o hay 403). */
  headers?: Record<string, string>;
  /** Nombre del campo del archivo (hoy siempre `file`). */
  fileField: string;
  expiresIn: number;
  restantesHoy: number;
}

export interface CompleteUploadResult {
  key: string;
  bucket: string;
  visibility: 'public' | 'private';
  url: string;
  signedUrl: string | null;
  posterUrl: string | null;
  bytes: number;
  contentType: string;
  durationSec: number | null;
  verified: boolean;
}

export const mediaRealApi = {
  signUpload: (input: SignUploadInput) =>
    httpRequest<SignUploadResult>(`${MEDIA}/upload-url`, { method: 'POST', body: input }),

  complete: (key: string) =>
    httpRequest<CompleteUploadResult>(`${MEDIA}/complete`, { method: 'POST', body: { key } }),

  /** Cuota y material pendiente (útil para avisar antes de que el servidor corte). */
  quota: () => httpRequest<Record<string, unknown>>(`${MEDIA}/quota`, { method: 'GET' }),
};

const MB = 1024 * 1024;

/** Tamaño real del archivo local. La firma lo EXIGE: sin él no hay URL de subida. */
async function tamanoDe(uri: string): Promise<number> {
  try {
    const info = await getInfoAsync(uri);
    const size = (info as { exists?: boolean; size?: number }).exists === false
      ? undefined
      : (info as { size?: number }).size;
    if (typeof size === 'number' && size > 0) return size;
  } catch {
    // Cae al respaldo de abajo.
  }
  // Respaldo: leer el archivo y medirlo (funciona con `content://` donde getInfo no da tamaño).
  const blob = await (await fetch(uri)).blob();
  return blob.size;
}

/**
 * Sube una imagen local por el camino de la Parte 41 y devuelve su **URL pública**,
 * que es la que se puede guardar en un tipo de habitación.
 *
 * Lanza `ApiError` con el código del servidor cuando algo no cuadra (`MEDIA_TOO_LARGE`,
 * `MEDIA_QUOTA_DAY`, `UPLOAD_MISSING`…), para poder enseñárselo al hotelero tal cual.
 */
export async function uploadImageReal(local: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<string> {
  const mime = (local.mimeType ?? 'image/jpeg').toLowerCase();
  const size = await tamanoDe(local.uri);
  if (!size) throw new ApiError('MEDIA_SIZE_REQUIRED', 'No se pudo leer el tamaño de la foto');

  // 1) Firma. El servidor decide si cabe en su cuota ANTES de entregar la URL.
  const firma = await mediaRealApi.signUpload({
    purpose: 'product', kind: 'image', mimeType: mime, fileSizeBytes: size,
  });

  // Comprobación en el cliente para no subir en balde algo que se va a rechazar.
  if (Number(firma.maxBytes) > 0 && size > Number(firma.maxBytes)) {
    throw new ApiError('MEDIA_TOO_LARGE',
      `La foto pesa ${(size / MB).toFixed(1)} MB y el máximo es ${Math.round(Number(firma.maxBytes) / MB)} MB`);
  }

  // 2) Subida. DOS MODOS, según lo que firmó el servidor:
  //    - POST multipart (MinIO): campos firmados primero y el ARCHIVO AL FINAL —
  //      el almacenamiento rechaza la subida si el campo del archivo no es el último.
  //    - PUT directo (R2): el body es el archivo en bruto con el Content-Type
  //      EXACTO que firmó el servidor (otro tipo = 403 SignatureDoesNotMatch).
  let res: Response;
  if (firma.method === 'PUT') {
    const crudo = await (await fetch(local.uri)).blob();
    // El Blob del runtime puede traer otro Content-Type implícito: se reconstruye
    // con el mime exacto firmado para no romper la firma.
    const archivo = crudo.type === mime ? crudo : new Blob([crudo], { type: mime });
    res = await fetch(firma.uploadUrl, {
      method: 'PUT',
      headers: firma.headers ?? { 'Content-Type': mime },
      body: archivo,
    });
  } else {
    const form = new FormData();
    for (const [k, v] of Object.entries(firma.fields ?? {})) form.append(k, String(v));
    form.append(firma.fileField || 'file', {
      uri: local.uri,
      name: local.fileName || `habitacion-${Date.now()}.jpg`,
      type: mime,
    } as unknown as Blob);
    res = await fetch(firma.uploadUrl, { method: 'POST', body: form });
  }
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    // El almacenamiento responde XML con el motivo (<Code>EntityTooLarge</Code>…).
    const code = /<Code>([^<]+)<\/Code>/.exec(cuerpo)?.[1] ?? `HTTP_${res.status}`;
    throw new ApiError('UPLOAD_FAILED', `No se pudo subir la foto (${code})`);
  }

  // 3) Cierre: verifica tamaño y tipo reales y devuelve la URL definitiva.
  const cerrado = await mediaRealApi.complete(firma.key);
  const url = cerrado?.url || firma.publicUrl || '';
  if (!url) throw new ApiError('UPLOAD_FAILED', 'La foto se subió pero el servidor no devolvió su dirección');
  return url;
}

/** Base absoluta, por si hace falta montar una URL a mano. */
export const MEDIA_API_BASE = `${API_BASE}${MEDIA}`;
