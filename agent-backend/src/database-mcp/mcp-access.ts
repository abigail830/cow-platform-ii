import { DATASOURCE_ID_HEADER, type DatasourceType } from './constants.ts';
import type { UserDatasource } from './types.ts';

export type DatabaseMcpAccess =
  | { kind: 'unauthorized' }
  | { kind: 'missing_datasource_id' }
  | { kind: 'not_found' }
  | { kind: 'type_mismatch'; expected: DatasourceType; actual: DatasourceType }
  | { kind: 'ok'; user: { id: string }; source: UserDatasource };

export type ResolveDatabaseMcpAccessDeps = {
  resolveUser: (request: Request) => Promise<{ id: string } | null>;
  getSource: (datasourceId: string, userId: string) => Promise<UserDatasource | null>;
};

export async function resolveDatabaseMcpAccess(
  request: Request,
  engine: DatasourceType,
  deps: ResolveDatabaseMcpAccessDeps,
): Promise<DatabaseMcpAccess> {
  const user = await deps.resolveUser(request);
  if (!user) return { kind: 'unauthorized' };

  const datasourceId = request.headers.get(DATASOURCE_ID_HEADER)?.trim();
  if (!datasourceId) return { kind: 'missing_datasource_id' };

  const source = await deps.getSource(datasourceId, user.id);
  if (!source) return { kind: 'not_found' };
  if (source.type !== engine) {
    return { kind: 'type_mismatch', expected: engine, actual: source.type };
  }

  return { kind: 'ok', user, source };
}
