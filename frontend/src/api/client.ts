import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Send the httpOnly cookie on every request
  headers: { 'Content-Type': 'application/json' },
});

// If the server returns 401, redirect to login so the user can re-authenticate.
// This handles the case where a 90-day token quietly expires mid-session.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
