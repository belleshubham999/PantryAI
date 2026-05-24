import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://pantry-ai-backend.onrender.com/api';

console.log('API Base URL:', API_BASE_URL);  // Debug log

const API = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,  // 10 second timeout
});

// Add token to every request automatically
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Handle responses
API.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout - Backend might be down');
    }
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

export default API;