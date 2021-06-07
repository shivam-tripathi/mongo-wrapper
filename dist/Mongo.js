"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectId = exports.castToObjectId = exports.isValidObjectId = exports.MongoFactory = exports.MODES = exports.handleMongoError = void 0;
const mongodb_1 = require("mongodb");
class MongoConnect {
    constructor(name, emitter, userConfig, mode) {
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
            readPreference: mongodb_1.ReadPreference.SECONDARY,
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
    log(message, data) {
        this.emitter.emit("log", {
            service: this.name,
            message,
            data,
        });
    }
    success(message, data) {
        this.emitter.emit("success", {
            service: this.name,
            message,
            data,
        });
    }
    error(err, data) {
        this.emitter.emit("error", {
            service: this.name,
            data,
            err,
        });
    }
    async getConnectionUrl() {
        const servers = await this.userConfig.getServers();
        const joiner = ["mongodb://"];
        if (this.userConfig.auth) {
            const { username, password } = this.userConfig.auth;
            joiner.push(`${username}:${password}@`);
        }
        joiner.push(servers.map((server) => `${server.host}:${server.port}`).join(","));
        return joiner.join("");
    }
    async connect() {
        let connected = false;
        // Reconnection handler
        let attempt = 1;
        while (!connected && attempt <= 10) {
            console.log({ action: 'connect', attempt });
            try {
                if (this.mongoClient instanceof mongodb_1.MongoClient) {
                    console.log('Closing existing mongo client');
                    await this.mongoClient.close();
                }
                this.mongoClient = null;
                // Returns connection url with only healthy hosts
                const connectionUrl = await this.getConnectionUrl();
                console.log({ action: 'connecting', connectionUrl, attempt });
                this.mongoClient = new mongodb_1.MongoClient(connectionUrl, this.config); // 10 second -> 100 seconds
                await this.mongoClient.connect();
                await new Promise(res => setTimeout(res, 2 * attempt * 1000)); //  110 seconds
                attempt++;
                connected = true;
            }
            catch (err) {
                console.log({ err, isServerSelectionError: err instanceof mongodb_1.MongoServerSelectionError });
                if (err instanceof mongodb_1.MongoServerSelectionError) {
                    console.log({ err, action: 'error caught, reattempting' });
                    this.error(err);
                }
                else {
                    throw new Error(err);
                }
            }
        }
        console.log({ action: 'connection successful, updating db' });
        this.client = this.mongoClient.db(this.userConfig.db);
        this.success(`Successfully connected in ${this.mode} mode`);
        mongodb_1.Logger.setLevel("info");
        mongodb_1.Logger.setCurrentLogger((msg, context) => {
            this.log(msg, context);
        });
        return this;
    }
}
async function handleMongoError(err, mongo) {
    console.log({ action: 'handleMongoErrorTriggered', err });
    if (err instanceof mongodb_1.MongoServerSelectionError) {
        console.log({ action: 'handleMongoErrorReconnecting', isMongoServerSelectionError: err instanceof mongodb_1.MongoServerSelectionError, reconn: mongo.reconnecting });
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
        return null;
    }
    console.log({ action: 'handleMongoErrorInvalid, will throw' });
    return err;
}
exports.handleMongoError = handleMongoError;
var MODES;
(function (MODES) {
    MODES["SERVER"] = "server";
    MODES["REPLSET"] = "replset";
    MODES["SHARD"] = "shard";
})(MODES = exports.MODES || (exports.MODES = {}));
function MongoFactory(mode, name, emitter, config) {
    switch (mode) {
        case MODES.SERVER:
            return new ServerMongo(name, emitter, config);
        case MODES.REPLSET:
            return new ReplSet(name, emitter, config);
        case MODES.SHARD:
            return new ShardMongo(name, emitter, config);
        default:
            throw new Error("Invalid architecture");
    }
}
exports.MongoFactory = MongoFactory;
class ServerMongo extends MongoConnect {
    constructor(name, emitter, config) {
        const { db, host, port, auth } = config;
        const userConfig = {
            db,
            getServers: () => Promise.resolve([{ host, port }]),
            auth,
        };
        super(name, emitter, userConfig, MODES.SERVER);
    }
}
class ReplSet extends MongoConnect {
    constructor(name, emitter, replicaConfig) {
        const { db, replica, auth } = replicaConfig;
        const config = {
            db: db,
            getServers: () => Promise.resolve(replica.servers),
            auth,
        };
        super(name, emitter, config, MODES.REPLSET);
        this.config.replicaSet = replica.name;
    }
}
class ShardMongo extends MongoConnect {
    constructor(name, emitter, shardConfig) {
        const { db, shard, auth } = shardConfig;
        super(name, emitter, { db, getServers: shard.getServers, auth }, MODES.SHARD);
    }
}
function isValidObjectId(value) {
    const regex = /[0-9a-f]{24}/;
    const matched = String(value).match(regex);
    if (!matched) {
        return false;
    }
    return mongodb_1.ObjectId.isValid(value);
}
exports.isValidObjectId = isValidObjectId;
function castToObjectId(value) {
    if (isValidObjectId(value) === false) {
        throw new TypeError(`Value passed is not valid objectId, is [ ${value} ]`);
    }
    return mongodb_1.ObjectId.createFromHexString(value);
}
exports.castToObjectId = castToObjectId;
var mongodb_2 = require("mongodb");
Object.defineProperty(exports, "ObjectId", { enumerable: true, get: function () { return mongodb_2.ObjectId; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscUNBUWlCO0FBMkJqQixNQUFNLFlBQVk7SUFVaEIsWUFDRSxJQUFZLEVBQ1osT0FBNEIsRUFDNUIsVUFBc0IsRUFDdEIsSUFBWTtRQUVaLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUc7WUFDWixTQUFTLEVBQUUsSUFBSTtZQUNmLFFBQVEsRUFBRSxDQUFDO1lBQ1gsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixlQUFlLEVBQUUsS0FBSztZQUN0Qix3QkFBd0IsRUFBRSxLQUFLO1lBQy9CLGtCQUFrQixFQUFFLElBQUk7WUFDeEIsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixjQUFjLEVBQUUsd0JBQWMsQ0FBQyxTQUFTO1NBQ3pDLENBQUM7UUFDRixJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUU7WUFDbkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUc7Z0JBQ2pCLElBQUksRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVE7Z0JBQzlCLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVE7YUFDbkMsQ0FBQztZQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1NBQ3JEO1FBQ0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUVELEdBQUcsQ0FBQyxPQUFlLEVBQUUsSUFBMEI7UUFDN0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ3ZCLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNs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