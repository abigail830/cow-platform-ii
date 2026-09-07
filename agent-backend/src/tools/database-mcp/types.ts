import type { DatasourceType } from './constants.ts';

export type UserDatasource = {
  id: string;
  createdBy: string;
  name: string;
  displayTitle: string | null;
  type: DatasourceType;
  host: string;
  port: number;
  username: string;
  database: string;
  password: string;
  ssl: boolean;
  readonly: boolean;
  maxRows: number;
  statementTimeoutMs: number;
};
