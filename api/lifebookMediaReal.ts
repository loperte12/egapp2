/**
 * Life Book · SUBIDA REAL DE MEDIA (Parte 50) — cliente de la subida FIRMADA.
 *
 * Rutas (bajo `/wallet/api/v1`, que es el base de `httpClient`):
 *   POST   /lifebook/commerce/media/upload-url   → billete de subida (URL firmada + tope)
 *   POST   /lifebook/commerce/media/complete     → cierra y VERIFICA el archivo real
 *   POST   /lifebook/commerce/media/sign-read    → lectura firmada (documentos privados)
 *   GET    /lifebook/commerce/media/quota        → cuota de 24 h y material pendiente
 *   DELETE /lifebook/commerce/media?key=…        → borra una subida propia
 *
 * ── POR QUÉ EXISTE ESTE CAMINO ──────────────────────────────────────────────────────────
 * El endpoint viejo (`POST /lifebook/media/upload`, multipart contra el API) hace que
 * el archivo pase por Node: la petición entra por nginx, se copia en memoria/temporal y
 * desde ahí va a MinIO. Con un vídeo de 50 minutos eso son ~900 MB atravesando el proceso
 * del API… y sin forma de saber por dónde va (ni de reanudar). Aquí el archivo va **directo
 * del móvil al almacenamiento** con una URL firmada, y el API solo firma y luego verifica.
 *
 * ── LO QUE ESTE MÓDULO **NO** HACE (a propósito) ──────────────────────────
 *   · No decide topes: los devuelve el servidor (`maxBytes` / `maxSec`) y además los
 *     impone MinIO en la política de la URL firmada. Aquí solo se avisa antes.
 *   · No confía en lo que declara el cliente: `complete` re-lee el archivo con ffprobe y
 *     responde la duración/tamaño reales. Si el archivo no está donde se dijo, falla.
 *   · No manda el token JWT a MinIO: la URL firmada es autosuficiente.
 *
 * 02/10/2026 — MODO DUAL MinIO/R2: el backend con Cloudflare R2 firma un **PUT directo**
 * y devuelve `method:'PUT'` + `headers`. En PUT el body es el archivo EN BRUTO (no
 * multipart) con el Content-Type EXACTO firmado; XHR conserva `upload.onprogress`.
 */
import { http, httpRequest } from './httpClient';
import { mimeToExt } from '../constants/lifebook';

/** Uso de la subida: decide el bucket y la visibilidad en el servidor. */
export type LbMediaPurpose = 'post' | 'product' | 'docs';
/** Perfil de duración del vídeo (espejo del backend: 60 s vs 3000 s). */
export type LbDurationKind = 'short' | 'long';

/** Billete de subida tal cual lo devuelve `upload-url`. */
export interface LbTicketSubida {
  /** URL firmada (POST multipart en MinIO; PUT directo en R2). */
  uploadUrl: string;
  /** Campos del formulario que hay que enviar TAL CUAL, antes del archivo (modo POST). */
  fields: Record<string, string>;
  /** Clave del objeto reservada ya en la base (sirve para cerrar y para borrar). */
  key: string;
  bucket: string;
  visibility: 'public' | 'private';
  /** URL pública definitiva (null si el bucket es privado). */
  publicUrl: string | null;
  /** Tope de bytes que impone el almacenamiento para ESTA subida. */
  maxBytes: number;
  /** Tope de segundos (solo vídeo/audio); null si no aplica. */
  maxSec: number | null;
  durationKind: LbDurationKind;
  expiresIn: number;
  /** POST multipart (MinIO) o PUT directo (R2). */
  method: 'POST' | 'PUT';
  /** Cabeceras obligatorias en modo PUT (Content-Type firmado: igual o 403). */
  headers?: Record<string, string>;
  fileField: string;
  restantesHoy: number;
}

/** Respuesta de `complete`: el archivo ya verificado de verdad. */
export interface LbMediaVerificada {
  key: string;
  bucket: string;
  visibility: 'public' | 'private';
  url: string;
  signedUrl: string | null;
  posterUrl: string | null;
  bytes: number;
  contentType: string;
  durationSec: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  verified: true;
}

/** Cuota y material pendiente. */
export interface LbCuotaMedia {
  usadasHoy: number;
  maxHoy: number;
  pendienteBytes: number;
  maxPendienteBytes: number;
  totalBytes: number;
  huerfanos: number;
  buckets: { media: string; docs: string };
}

export interface LbEntradaSubida {
  purpose?: LbMediaPurpose;
  kind: 'image' | 'video' | 'audio' | 'file';
  /** Solo vídeo: 'short' (≤60 s) o 'long' (≤3000 s). */
  durationKind?: LbDurationKind;
  mimeType: string;
  fileSizeBytes?: number;
  durationSec?: number;
}

/** Progreso de la subida, en unidades que se pueden pintar sin calcular nada. */
export interface LbProgreso {
  enviados: number;
  total: number;
  /** 0…1 (cuando el total no se conoce, se queda en 0). */
  fraccion: number;
  /** MB/s medidos desde el arranque de ESTA subida. */
  mbps: number;
  /** Segundos que faltan según la velocidad media; null si aún no se puede estimar. */
  restanteSec: number | null;
}

export const lifebookMediaRealApi = {
  /** Pide el billete de subida (reserva la clave y devuelve la URL firmada). */
  billete: (input: LbEntradaSubida) =>
    httpRequest<LbTicketSubida>('/lifebook/commerce/media/upload-url', { method: 'POST', body: input }),

  /** Cierra la subida: el servidor verifica tamaño, tipo, duración y saca el póster. */
  cerrar: (key: string, durationSec?: number) =>
    httpRequest<LbMediaVerificada>('/lifebook/commerce/media/complete', {
      method: 'POST',
      body: durationSec === undefined ? { key } : { key, durationSec },
    }),

  /** Cuota de las últimas 24 h + bytes pendientes de publicar. */
  cuota: () => http.get<LbCuotaMedia>('/lifebook/commerce/media/quota'),

  /** Lectura firmada (documentos privados). */
  lecturaFirmada: (key: string) =>
    httpRequest<{ key: string; signedUrl: string; expiresIn: number }>('/lifebook/commerce/media/sign-read', {
      method: 'POST',
      body: { key },
    }),

  /** Borra una subida propia (y su póster). */
  borrar: (key: string) =>
    httpRequest<{ deleted: boolean; key: string }>(`/lifebook/commerce/media?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),
};

/**
 * Sube el archivo por la URL firmada, con PROGRESO, y lo cierra (`complete`).
 *
 * El orden del formulario NO es cosmético: MinIO exige que el campo del archivo vaya
 * **el último** (todo lo que va detrás se ignora y la firma deja de cuadrar).
 */
export async function subirArchivoFirmado(
  archivo: { uri: string; name: string; mimeType: string; sizeBytes?: number },
  opts: {
    purpose?: LbMediaPurpose;
    kind?: 'image' | 'video' | 'audio' | 'file';
    durationKind?: LbDurationKind;
    durationSec?: number;
    onProgreso?: (p: LbProgreso) => void;
    onBillete?: (t: LbTicketSubida) => void;
    /** 0 = sin límite (una subida de 900 MB por red lenta tarda lo que tarde). */
    timeoutMs?: number;
    /** Verificación local ANTES de gastar datos: lanza Error con mensaje claro. */
    comprobarAntes?: (t: LbTicketSubida) => void;
  } = {},
): Promise<LbMediaVerificada> {
  const kind = opts.kind ?? 'video';
  const mimeType = archivo.mimeType || (kind === 'video' ? 'video/mp4' : 'application/octet-stream');
  const fileSizeBytes = Number(archivo.sizeBytes ?? 0) || undefined;

  const billete = await lifebookMediaRealApi.billete({
    purpose: opts.purpose ?? 'post',
    kind,
    ...(kind === 'video' ? { durationKind: opts.durationKind ?? 'short' } : {}),
    mimeType,
    ...(fileSizeBytes ? { fileSizeBytes } : {}),
    ...(opts.durationSec ? { durationSec: Math.round(opts.durationSec) } : {}),
  });
  opts.onBillete?.(billete);
  opts.comprobarAntes?.(billete);

  const total = fileSizeBytes ?? 0;
  const inicio = Date.now();
  await enviarAlAlmacen(billete, archivo, total, inicio, opts.onProgreso, opts.timeoutMs);

  // Solo ahora se cierra: si la verificación falla, el objeto queda 'pending' con dueño
  // y fecha (lo barre `purge-orphans`), no publicado a medias.
  return lifebookMediaRealApi.cerrar(billete.key, opts.durationSec);
}

/** Subida a la URL firmada con `upload.onprogress`. DOS MODOS:
 *  - POST multipart (MinIO): campos firmados primero, el ARCHIVO AL FINAL.
 *  - PUT directo (R2): el body es el archivo en bruto con el Content-Type EXACTO
 *    que firmó el servidor (otro tipo = 403 SignatureDoesNotMatch). XHR permite
 *    enviar un Blob como body y conserva `upload.onprogress` para el progreso. */
async function enviarAlAlmacen(
  billete: LbTicketSubida,
  archivo: { uri: string; name: string; mimeType: string },
  totalDeclarado: number,
  inicio: number,
  onProgreso?: (p: LbProgreso) => void,
  timeoutMs = 0,
): Promise<void> {
  // En modo PUT se prepara ANTES el Blob del archivo (el mime exacto firmado):
  // el Blob del runtime puede traer otro Content-Type implícito.
  const blobPut =
    (billete.method || 'POST') === 'PUT'
      ? new Blob([await (await fetch(archivo.uri)).blob()], { type: archivo.mimeType })
      : null;

  return new Promise<void>((resolve, reject) => {
    const esPut = blobPut !== null;
    let form: FormData | null = null;
    if (!esPut) {
      form = new FormData();
      // 1) Todos los campos de la política, en el orden que los devolvió el servidor.
      Object.entries(billete.fields).forEach(([k, v]) => form!.append(k, String(v)));
      // 2) El archivo, SIEMPRE el último.
      form.append(billete.fileField || 'file', {
        uri: archivo.uri,
        name: archivo.name || `subida.${mimeToExt(archivo.mimeType)}`,
        type: archivo.mimeType,
      } as unknown as Blob);
      // 3) El Content-Type del formulario lo pone el runtime con su boundary: si se fija a
      //    mano (como en el camino multipart del API) la política `eq $Content-Type` de
      //    MinIO compara contra el VALOR del campo, no contra la cabecera.
    }

    const xhr = new XMLHttpRequest();
    xhr.open(billete.method || 'POST', billete.uploadUrl, true);
    if (timeoutMs > 0) xhr.timeout = timeoutMs;
    if (esPut) {
      // En PUT las cabeceras van firmadas: se envían TAL CUAL las manda el servidor.
      Object.entries(billete.headers ?? { 'Content-Type': archivo.mimeType }).forEach(([k, v]) =>
        xhr.setRequestHeader(k, v),
      );
    }

    xhr.upload.onprogress = (e: ProgressEvent) => {
      if (!onProgreso) return;
      const total = e.lengthComputable ? e.total : totalDeclarado;
      const seg = Math.max(0.15, (Date.now() - inicio) / 1000);
      const mbps = e.loaded / (1024 * 1024) / seg;
      onProgreso({
        enviados: e.loaded,
        total,
        fraccion: total > 0 ? Math.min(1, e.loaded / total) : 0,
        mbps: Number(mbps.toFixed(2)),
        restanteSec: mbps > 0.05 && total > e.loaded ? Math.round((total - e.loaded) / (1024 * 1024) / mbps) : null,
      });
    };

    xhr.onload = () => {
      // MinIO responde 204 sin cuerpo al aceptar un POST de formulario.
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const cuerpo = String(xhr.responseText ?? '').slice(0, 300);
      reject(new Error(
        xhr.status === 403
          ? 'El almacenamiento rechazó la subida (la URL firmada caducó o el peso supera el tope). Vuelve a intentarlo.'
          : `La subida falló (HTTP ${xhr.status}). ${cuerpo}`.trim(),
      ));
    };

    xhr.onerror = () => reject(new Error('Se cortó la conexión durante la subida. Comprueba tu red y vuelve a intentarlo.'));
    xhr.ontimeout = () => reject(new Error('La subida tardó demasiado y se canceló. Prueba con una red más rápida.'));
    xhr.onabort = () => reject(new Error('Subida cancelada.'));

    try {
      xhr.send((esPut ? blobPut : form) as unknown as Document);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('No se pudo iniciar la subida.'));
    }
  });
}

/**
 * Borra un objeto que quedó subido pero sin publicar (best-effort).
 *
 * Se usa cuando algo falla DESPUÉS de subir (p. ej. crear el post): mejor liberar el
 * espacio ahora que dejar 900 MB colgando hasta el barrido de huérfanos.
 */
export async function limpiarSubida(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try { await lifebookMediaRealApi.borrar(key); } catch { /* best-effort */ }
}
