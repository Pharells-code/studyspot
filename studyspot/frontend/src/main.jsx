import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';          // Bootstrap: layout and components
import '@fortawesome/fontawesome-free/css/all.min.css'; // Font Awesome: icons
import './styles.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
