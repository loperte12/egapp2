/**
 * Config de API y servicios compartida.
 * Todo apunta al servidor propio (Alibaba Cloud 106.14.104.146).
 * No hay claves de terceros ni APIs externas.
 */

// --- Host del backend NestJS ---
// ⚠️ ESPEJO HONG KONG activo (8.218.88.237 / hk.egrouteplan.com) mientras el
// servidor de Shanghai (egrouteplan.com) no sea accesible desde la red China
// (falta ICP 备案 en Alibaba). Los tiles/mapas siguen en Shanghai (WebView).
//
// WEB (Vercel): el host va VACÍO a propósito — las llamadas son RELATIVAS y Vercel las
// proxeea al backend (vercel.json). Motivo: el navegador impone CORS y el backend no
// manda Access-Control-Allow-Origin; con el mismo origen, el CORS desaparece sin tocar
// el servidor. En nativo (APK) no hay CORS: el host absoluto de siempre.
import { Platform } from 'react-native';

export const API_HOST = Platform.OS === 'web' ? '' : 'https://hk.egrouteplan.com';

// --- Backend NestJS (wallet + mobility auth + KYC) ---
export const API_BASE = `${API_HOST}/wallet/api/v1`;

// --- Mapa auto-hospedado (Protomaps PMTiles + OSRM) ---
// Los tiles se sirven via nginx reverse proxy en https://hk.egrouteplan.com/maps/
// (espejo HK: mbtiles-server :8081 + OSRM :5000 ya replicados).
export const MAP_TILES_BASE = `${API_HOST}/maps/tiles`;
export const MAP_STYLE_LIGHT = `${API_HOST}/maps/style-light.json`;
export const MAP_STYLE_DARK = `${API_HOST}/maps/style-dark.json`;

// OSRM: motor de rutas auto-hospedado (espejo HK :5000 vía /routing/)
export const OSRM_BASE = `${API_HOST}/routing/route/v1`;

/**
 * Resuelve una URL de imagen que el backend devuelve como ruta INTERNA
 * (p. ej. "/wallet/api/v1/mobility/driver/selfie/…"): React Native necesita una
 * URL completa para <Image>. Las URLs ya absolutas (https:// o data:) pasan
 * intactas; captured:// (marcador de prueba sin foto real) se devuelve tal cual
 * (el llamador decide no pintarla).
 */
export function absUrl(p?: string | null): string {
  if (!p) return '';
  if (p.startsWith('http') || p.startsWith('data:') || p.startsWith('captured://')) return p;
  return p.startsWith('/') ? `${API_HOST}${p}` : `${API_HOST}/${p}`;
}

// --- Centro por defecto: Malabo (Isla de Bioko) ---
// WGS84 — sin transformación GCJ-02 (GPS nativo del dispositivo)
export const DEFAULT_CENTER = {
  longitude: 8.7371,   // Malabo
  latitude: 3.7504,
  zoom: 12,
} as const;
