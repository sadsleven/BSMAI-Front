export function getApiBaseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (!url) {
    console.warn('Falta VITE_API_BASE_URL en el entorno');
  }
  return (url ?? '').replace(/\/+$/, '');
}
