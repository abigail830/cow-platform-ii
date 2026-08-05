import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api/auth.ts';
import { AppLayout } from './layouts/AppLayout.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { AgentPlaygroundPage } from './pages/AgentPlaygroundPage.tsx';
import { AssetMarketPage } from './pages/AssetMarketPage.tsx';
import { SessionExplorerPage } from './pages/SessionExplorerPage.tsx';
import { ApiKeysSettingsPage } from './pages/ApiKeysSettingsPage.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { HybridSearchPage } from './pages/HybridSearchPage.tsx';
import { KnowledgeBaseDetailRouter } from './pages/KnowledgeBaseDetailRouter.tsx';
import { KnowledgeBasesListPage } from './pages/KnowledgeBasesListPage.tsx';
import { ModelsConfigPage } from './pages/ModelsConfigPage.tsx';
import { BuiltinAgentsPage } from './pages/BuiltinAgentsPage.tsx';
import { BuiltinAgentEditPage } from './pages/BuiltinAgentEditPage.tsx';
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
          <Route index element={<HomePage />} />
          <Route path="/settings/api-keys" element={<ApiKeysSettingsPage />} />
          <Route path="/agents/playground" element={<AgentPlaygroundPage />} />
          <Route path="/agents/asset-market" element={<AssetMarketPage />} />
          <Route path="/agents/session-explorer" element={<SessionExplorerPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/admin/models" element={<ModelsConfigPage />} />
          <Route path="/admin/builtin-agents" element={<BuiltinAgentsPage />} />
          <Route path="/admin/builtin-agents/new" element={<BuiltinAgentEditPage />} />
          <Route path="/admin/builtin-agents/:id" element={<BuiltinAgentEditPage />} />
          <Route path="/admin/pipelines" element={<PipelinesConfigPage />} />
          <Route path="/admin/storage" element={<ObjectStoragePage />} />
          <Route path="/knowledge/hybrid-search" element={<HybridSearchPage />} />
          <Route path="/knowledge/knowledge-bases" element={<KnowledgeBasesListPage />} />
          <Route path="/knowledge/knowledge-bases/:knowledgeBaseId" element={<KnowledgeBaseDetailRouter />} />
          <Route path="/knowledge/documents" element={<DocumentsLayout />}>
            <Route index element={<DocumentsListPage />} />
            <Route path=":documentId" element={<DocumentDetailPage />} />
          </Route>
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/roles" element={<RolesPage />} />
          <Route path="/admin/permissions" element={<PermissionsPage />} />
        </Route>
        <Route path="*" element={<Navigate to={getToken() ? '/' : '/login'} replace />} />
      </Routes>
    </FlueAuthProvider>
  );
}
