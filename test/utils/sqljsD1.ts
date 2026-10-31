import initSqlJs from "sql.js";
import { ILibraryDb } from "../../cloudflare/libraryServer";

type ISqlValue = string | number | null | Uint8Array;

export async function SqljsD1_create(): Promise<ILibraryDb> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const exec = (): Record<string, unknown>[] => {
            const statement = db.prepare(sql);
            statement.bind(values.map((v) => (v === undefined ? null : (v as ISqlValue))));
            const rows: Record<string, unknown>[] = [];
            while (statement.step()) {
              rows.push(statement.getAsObject());
            }
            statement.free();
            return rows;
          };
          return {
            all: async <T>() => ({ results: exec() as T[] }),
            first: async <T>() => (exec()[0] as T | undefined) ?? null,
            run: async () => {
              exec();
              return {};
            },
          };
        },
      };
    },
  };
}
