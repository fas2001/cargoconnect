import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { tokenStorage } from './token-storage';

/**
 * URL de l'API. À définir dans `.env` : EXPO_PUBLIC_API_URL=http://192.168.x.x:8000/api
 * Par défaut : l'hôte du serveur Metro (téléphone réel sur le même Wi-Fi),
 * sinon 10.0.2.2 (émulateur Android) / localhost (simulateur iOS, web).
 */
function defaultApiUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split(':')[0]}:8000/api`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000/api' : 'http://localhost:8000/api';
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? defaultApiUrl()).replace(/\/$/, '');

const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Transforme les erreurs DRF ({detail}, {champ: [msg]}, [msg]) en un message lisible. */
function parseError(status: number, body: unknown): ApiError {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const data = body as Record<string, unknown>;
    if (typeof data.detail === 'string') {
      return new ApiError(data.detail, status, typeof data.code === 'string' ? data.code : undefined);
    }
    const fieldErrors: Record<string, string> = {};
    for (const [field, value] of Object.entries(data)) {
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string') fieldErrors[field] = first;
    }
    const first = fieldErrors.non_field_errors ?? Object.values(fieldErrors)[0];
    return new ApiError(first ?? 'Requête invalide.', status, undefined, fieldErrors);
  }
  if (Array.isArray(body) && typeof body[0] === 'string') return new ApiError(body[0], status);
  if (status >= 500) return new ApiError('Le serveur rencontre un problème. Réessayez dans un instant.', status);
  return new ApiError(`Erreur ${status}`, status);
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null | (string | number)[]>;
  auth?: boolean;
};

let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

// Une seule requête de rafraîchissement à la fois, partagée par les appels concurrents.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await tokenStorage.getRefresh();
  if (!refresh) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access: string; refresh?: string };
    await tokenStorage.setTokens(data.access, data.refresh);
    return data.access;
  } catch {
    return null;
  }
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

async function send(url: string, init: RequestInit, token: string | null): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Accept-Language', 'fr');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  try {
    return await fetch(url, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError('Connexion impossible. Vérifiez votre réseau et réessayez.', 0, 'network');
  } finally {
    clearTimeout(timer);
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const init: RequestInit = {
    method,
    headers: isForm || body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  };
  const url = buildUrl(path, query);

  let token = auth ? await tokenStorage.getAccess() : null;
  let res = await send(url, init, token);

  if (res.status === 401 && auth) {
    refreshing ??= refreshAccessToken().finally(() => {
      refreshing = null;
    });
    token = await refreshing;
    if (!token) {
      await tokenStorage.clear();
      onSessionExpired?.();
      throw new ApiError('Votre session a expiré. Reconnectez-vous.', 401, 'session_expired');
    }
    res = await send(url, init, token);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : undefined;
  if (!res.ok) throw parseError(res.status, data);
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Une erreur inattendue est survenue.';
}
