import axios from 'axios';

export function getApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred';
}
