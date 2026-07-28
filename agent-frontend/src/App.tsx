import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api/auth.ts';
import { ChatPage } from './pages/ChatPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ModelsConfigPage } from './pages/ModelsConfigPage.tsx';
import { FlueAuthProvider } from './providers/FlueAuthProvider.tsx';

function RequireAuth({ children }: { children: ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <FlueAuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/models"
          element={
            <RequireAuth>
              <ModelsConfigPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={getToken() ? '/chat' : '/login'} replace />} />
      </Routes>
    </FlueAuthProvider>
  );
}
