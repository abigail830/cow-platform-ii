import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api/auth.ts';
import { AppLayout } from './layouts/AppLayout.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { AgentPlaygroundPage } from './pages/AgentPlaygroundPage.tsx';
import { SessionExplorerPage } from './pages/SessionExplorerPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ModelsConfigPage } from './pages/ModelsConfigPage.tsx';
import { PipelinesConfigPage } from './pages/PipelinesConfigPage.tsx';
import { DocumentsLayout } from './pages/DocumentsLayout.tsx';
import { DocumentDetailPage } from './pages/DocumentDetailPage.tsx';
import { DocumentsListPage } from './pages/DocumentsListPage.tsx';
import { ObjectStoragePage } from './pages/ObjectStoragePage.tsx';
import { PermissionsPage } from './pages/PermissionsPage.tsx';
import { RolesPage } from './pages/RolesPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';
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
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/agents/playground" element={<AgentPlaygroundPage />} />
          <Route path="/agents/session-explorer" element={<SessionExplorerPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/admin/models" element={<ModelsConfigPage />} />
          <Route path="/admin/pipelines" element={<PipelinesConfigPage />} />
          <Route path="/admin/storage" element={<ObjectStoragePage />} />
          <Route path="/knowledge/documents" element={<DocumentsLayout />}>
            <Route index element={<DocumentsListPage />} />
            <Route path=":documentId" element={<DocumentDetailPage />} />
          </Route>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/permissions" element={<PermissionsPage />} />
        </Route>
        <Route path="*" element={<Navigate to={getToken() ? '/agents/playground' : '/login'} replace />} />
      </Routes>
    </FlueAuthProvider>
  );
}
