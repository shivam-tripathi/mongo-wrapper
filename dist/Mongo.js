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
            try {
                if (this.mongoClient instanceof mongodb_1.MongoClient) {
                    await this.mongoClient.close();
                }
                // Returns connection url with only healthy hosts
                const connectionUrl = await this.getConnectionUrl();
                this.mongoClient = new mongodb_1.MongoClient(connectionUrl, this.config); // 10 second -> 100 seconds
                await this.mongoClient.connect();
                await new Promise(res => setTimeout(res, 2 * attempt * 1000)); //  110 seconds
                attempt++;
                connected = true;
            }
            catch (err) {
                if (err instanceof mongodb_1.MongoServerSelectionError) {
                    this.error(err);
                }
                else {
                    throw new Error(err);
                }
            }
        }
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
    if (err instanceof mongodb_1.MongoServerSelectionError) {
        if (mongo.reconnecting === null) {
            mongo.reconnecting = mongo.connect().then(() => mongo.reconnecting = null);
        }
        await (mongo.reconnecting || Promise.resolve());
        return null;
    }
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