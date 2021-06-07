/// <reference types="node" />
import events from "events";
import { Db, MongoClient, MongoClientOptions, ObjectId } from "mongodb";
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
declare class MongoConnect implements Mongo {
    name: string;
    emitter: events.EventEmitter;
    mongoClient: MongoClient;
    client: Db;
    userConfig: UserConfig;
    config: MongoClientOptions;
    mode: string;
    reconnecting: Promise<Mongo>;
    constructor(name: string, emitter: events.EventEmitter, userConfig: UserConfig, mode: string);
    log(message: string, data?: Record<string, any>): void;
    success(message: string, data?: Record<string, any>): void;
    error(err: Error, data?: Record<string, any>): void;
    private getConnectionUrl;
    connect(): Promise<Mongo>;
}
export declare function handleMongoError(err: Error, mongo: Mongo): Promise<Error>;
export declare enum MODES {
    SERVER = "server",
    REPLSET = "replset",
    SHARD = "shard"
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
export declare function MongoFactory(mode: string, name: string, emitter: events.EventEmitter, config: ServerConfig | ReplicaConfig | ShardConfig): ServerMongo | ReplSet | ShardMongo;
declare class ServerMongo extends MongoConnect {
    constructor(name: string, emitter: events.EventEmitter, config: ServerConfig);
}
declare class ReplSet extends MongoConnect {
    constructor(name: string, emitter: events.EventEmitter, replicaConfig: ReplicaConfig);
}
declare class ShardMongo extends MongoConnect {
    constructor(name: string, emitter: events.EventEmitter, shardConfig: ShardConfig);
}
export declare function isValidObjectId(value: string | number | ObjectId): boolean;
export declare function castToObjectId(value: string): ObjectId;
export { ObjectId } from "mongodb";
