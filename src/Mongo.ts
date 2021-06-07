import events from "events";
import {
  Db,
  MongoClient,
  MongoClientOptions,
  Logger as MongoLogger,
  ObjectId,
  ReadPreference,
  MongoServerSelectionError,
} from "mongodb";

export interface Server {
  host: string;
  port: number;
}

export interface AuthConfig {
  username: string;
  password: string;
  authSource?: string;
}

export interface UserConfig {
  db: string;
  auth?: AuthConfig;
  getServers(): Promise<Server[]>;
}

interface Mongo {
  log(message: string, data?: Record<string, any>): void;
  success(message: string, data?: Record<string, any>): void;
  error(err: Error, data?: Record<string, any>): void;
  connect(): Promise<Mongo>;
  reconnecting: Promise<Mongo>;
}

class MongoConnect implements Mongo {
  name: string;
  emitter: events.EventEmitter;
  mongoClient: MongoClient;
  client: Db;
  userConfig: UserConfig;
  config: MongoClientOptions;
  mode: string;
  reconnecting: Promise<Mongo>;

  constructor(
    name: string,
    emitter: events.EventEmitter,
    userConfig: UserConfig,
    mode: string
  ) {
    this.name = name;
    this.emitter = emitter;
    this.userConfig = userConfig;
    this.config = {
      keepAlive: true,
      poolSize: 5,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      serverSelectionTimeoutMS: 10000,
      useUnifiedTopology: true,
      connectWithNoPrimary: false,
      readPreference: ReadPreference.SECONDARY,
    };
    if (userConfig.auth) {
      this.config.auth = {
        user: userConfig.auth.username,
        password: userConfig.auth.password,
      };
      this.config.authSource = userConfig.auth.authSource;
    }
    this.mode = mode;
  }

  log(message: string, data?: Record<string, any>) {
    this.emitter.emit("log", {
      service: this.name,
      message,
      data,
    });
  }

  success(message: string, data?: Record<string, any>) {
    this.emitter.emit("success", {
      service: this.name,
      message,
      data,
    });
  }

  error(err: Error, data?: Record<string, any>) {
    this.emitter.emit("error", {
      service: this.name,
      data,
      err,
    });
  }

  private async getConnectionUrl() {
    const servers = await this.userConfig.getServers();
    const joiner = ["mongodb://"];

    if (this.userConfig.auth) {
      const { username, password } = this.userConfig.auth;
      joiner.push(`${username}:${password}@`);
    }

    joiner.push(
      servers.map((server) => `${server.host}:${server.port}`).join(",")
    );

    return joiner.join("");
  }

  async connect(): Promise<Mongo> {
    let connected = false;
    // Reconnection handler
    let attempt = 1;
    // Keep reference to old mongoClient, will need to close it later
    const oldMongoClient = this.mongoClient;
    while(!connected && attempt <= 10) {
      console.log({ action: 'connect', attempt });
      try {
        // Returns connection url with only healthy hosts
        const connectionUrl = await this.getConnectionUrl();
        console.log({ action: 'connecting', connectionUrl, attempt });
        const mongoClient = new MongoClient(connectionUrl, this.config); // 10 second -> 100 seconds
        await mongoClient.connect();
        // Update this.mongoClient ONLY after a valid client has been established; else topology closed error will
        // be thrown will is not being monitored/is valid error for reconnection
        this.mongoClient = mongoClient;
        connected = true;
      } catch(err) {
        console.log({ err, isServerSelectionError: err instanceof MongoServerSelectionError });
        if (err instanceof MongoServerSelectionError) {
          this.error(err);
          console.log({ err, action: 'error caught, reattempting' });
          // In case there is failure to select the server, sleep for few seconds and then retry
          await new Promise(res => setTimeout(res, 2 * attempt * 1000)); //  110 seconds
          attempt++;
        } else {
          throw new Error(err);
        }
      }
    }

    if (oldMongoClient instanceof MongoClient) {
      console.log('Closing older mongo client');
      await oldMongoClient.close();
    }

    console.log({ action: 'connection successful, updating db' });
    this.client = this.mongoClient.db(this.userConfig.db);
    this.success(`Successfully connected in ${this.mode} mode`);
    MongoLogger.setLevel("info");
    MongoLogger.setCurrentLogger((msg, context) => {
      this.log(msg, context);
    });
    return this;
  }
}

export async function handleMongoError(err: Error, mongo: Mongo) {
  console.log({ action: 'handleMongoErrorTriggered', err });
  if (err instanceof MongoServerSelectionError) {
    console.log({ action: 'handleMongoErrorReconnecting', isMongoServerSelectionError: err instanceof MongoServerSelectionError, reconn: mongo.reconnecting });
    if (mongo.reconnecting === null) {
      console.log({ action: 'handleMongoErrorReconnectingPromise' });
      mongo.reconnecting = mongo.connect()
        .then(() => {
          console.log('Reconnection successfull');
          return null;
        })
        .catch(err => console.log({ action: 'handleMongoErrorReconnFailed', err }));
    }
    await (mongo.reconnecting || Promise.resolve());
    mongo.reconnecting = null;
    console.log({ action: 'handleMongoErrorFin' });
    return null
  }
  console.log({ action: 'handleMongoErrorInvalid, will throw', err });
  return err;
}

export enum MODES {
  SERVER = "server",
  REPLSET = "replset",
  SHARD = "shard",
}

export interface ServerConfig {
  host: string;
  port: number;
  db: string;
  auth?: AuthConfig;
}

export interface ReplicaConfig {
  db: string;
  replica: {
    name: string;
    servers: Server[];
  };
  auth?: AuthConfig;
}

export interface ShardConfig {
  db: string;
  shard: {
    getServers: () => Promise<Server[]>;
  };
  auth?: AuthConfig;
}

export function MongoFactory(
  mode: string,
  name: string,
  emitter: events.EventEmitter,
  config: ServerConfig | ReplicaConfig | ShardConfig,
) {
  switch (mode) {
    case MODES.SERVER:
      return new ServerMongo(name, emitter, config as ServerConfig);
    case MODES.REPLSET:
      return new ReplSet(name, emitter, config as ReplicaConfig);
    case MODES.SHARD:
      return new ShardMongo(name, emitter, config as ShardConfig);
    default:
      throw new Error("Invalid architecture");
  }
}

class ServerMongo extends MongoConnect {
  constructor(
    name: string,
    emitter: events.EventEmitter,
    config: ServerConfig,
  ) {
    const { db, host, port, auth } = config;
    const userConfig: UserConfig = {
      db,
      getServers: () => Promise.resolve([{ host, port }]),
      auth,
    };
    super(name, emitter, userConfig, MODES.SERVER);
  }
}

class ReplSet extends MongoConnect {
  constructor(
    name: string,
    emitter: events.EventEmitter,
    replicaConfig: ReplicaConfig
  ) {
    const { db, replica, auth } = replicaConfig;
    const config: UserConfig = {
      db: db,
      getServers: () => Promise.resolve(replica.servers),
      auth,
    };
    super(name, emitter, config, MODES.REPLSET);
    this.config.replicaSet = replica.name;
  }
}

class ShardMongo extends MongoConnect {
  constructor(
    name: string,
    emitter: events.EventEmitter,
    shardConfig: ShardConfig
  ) {
    const { db, shard, auth } = shardConfig;
    super(
      name,
      emitter,
      { db, getServers: shard.getServers, auth },
      MODES.SHARD
    );
  }
}

export function isValidObjectId(value: string | number | ObjectId) {
  const regex = /[0-9a-f]{24}/;
  const matched = String(value).match(regex);
  if (!matched) {
    return false;
  }

  return ObjectId.isValid(value);
}

export function castToObjectId(value: string) {
  if (isValidObjectId(value) === false) {
    throw new TypeError(`Value passed is not valid objectId, is [ ${value} ]`);
  }
  return ObjectId.createFromHexString(value);
}

export { ObjectId } from "mongodb";
