import {
  declareType,
  Driver,
  IDriverSettings,
  TypedData,
  Types,
  withRetries,
} from "ydb-sdk";
import { defaults } from "./defaults";
import { SessionStore } from "./types";
export const SYNTAX_V1 = "--!syntax_v1";

export class RequestTypedData extends TypedData {
  @declareType(Types.UTF8)
  public key: string;

  @declareType(Types.UTF8)
  public session: string;

  constructor(data: { key: string; session?: string }) {
    super(data);
    this.key = data.key;
    this.session = data.session ?? "";
  }
}

interface NewClientOpts {
  /**
   * YDB YDB Driver Config; required.
   *
   * Remember to install the db driver `'YDB'`.
   *
   * */
  config: IDriverSettings;
  /** YDB table name to use for sessions. Defaults to "telegraf-sessions". */
  table?: string;
  /** Called on fatal connection or setup errors */
  onInitError?: (err: unknown) => void;
}

interface ExistingClientOpts {
  /** If passed, we'll reuse this driver instead of creating our own. */
  driver: Driver;
  /** YDB table name to use for sessions. Defaults to "telegraf-sessions". */
  table?: string;
  /** Called on fatal connection or setup errors */
  onInitError?: (err: unknown) => void;
}

/** @unstable */
export async function YDB<Session>(
  opts: NewClientOpts
): Promise<SessionStore<Session>>;
export async function YDB<Session>(
  opts: ExistingClientOpts
): Promise<SessionStore<Session>>;
export async function YDB<Session>(
  opts: NewClientOpts | ExistingClientOpts
): Promise<SessionStore<Session>> {
  let driver: Driver;

  if ("driver" in opts) driver = opts.driver;
  else {
    try {
      driver = new Driver(opts.config);
      const timeout = 10000;
      if (!(await driver.ready(timeout))) {
        throw new Error(`Driver has not become ready in ${timeout}ms!`);
      }
    } catch (error) {
      if (!opts.onInitError) {
        throw error;
      }

      opts.onInitError(error);
    }
  }

  const tableName = opts.table ?? defaults.table;

  return {
    async get(key) {
      return await driver.tableClient.withSession(async (driverSession) => {
        const query = `
        ${SYNTAX_V1}
        DECLARE $key as Utf8;
        
        SELECT *
        FROM ${tableName}
        WHERE key = $key;`;

        async function execute(): Promise<string> {
          const preparedQuery = await driverSession.prepareQuery(query);
          const requestTypedData = new RequestTypedData({
            key: key,
          });
          const { resultSets } = await driverSession.executeQuery(
            preparedQuery,
            {
              $key: requestTypedData.getTypedValue("key"),
            }
          );
          const result = RequestTypedData.createNativeObjects(resultSets[0]);
          if (result.length == 0) {
            return "";
          } else {
            return result[0].session;
          }
        }

        const value = await withRetries(execute);

        return value ? JSON.parse(value) : undefined;
      });
    },
    async set(key: string, session: Session) {
      return await driver.tableClient.withSession(async (driverSession) => {
        const query = `
        ${SYNTAX_V1}
        DECLARE $key AS Utf8;
        DECLARE $session AS Utf8;
        
        UPSERT INTO ${tableName} (key, session) VALUES ($key, $session);
        `;

        const dataMapper = new RequestTypedData({
          key: key,
          session: JSON.stringify(session),
        });

        async function execute(): Promise<boolean> {
          const preparedQuery = await driverSession.prepareQuery(query);

          await driverSession.executeQuery(preparedQuery, {
            $key: dataMapper.getTypedValue("key"),
            $session: dataMapper.getTypedValue("session"),
          });

          return true;
        }

        return await withRetries(execute);
      });
    },
    async delete(key: string) {
      return await driver.tableClient.withSession(async (driverSession) => {
        const query = `
        ${SYNTAX_V1}
        DECLARE $key AS Utf8;
        
        DELETE FROM ${tableName} 
        WHERE key == ${key};
        COMMIT;
        `;

        const dataMapper = new RequestTypedData({
          key: key,
        });

        async function execute(): Promise<boolean> {
          const preparedQuery = await driverSession.prepareQuery(query);

          await driverSession.executeQuery(preparedQuery, {
            $key: dataMapper.getTypedValue("key"),
          });

          return true;
        }

        return await withRetries(execute);
      });
    },
  };
}
