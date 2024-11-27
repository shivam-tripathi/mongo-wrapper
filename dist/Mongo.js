"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Db = exports.MongoClient = exports.ObjectId = exports.castToObjectId = exports.isValidObjectId = exports.MongoFactoryAuto = exports.MongoFactory = exports.MODES = exports.handleMongoError = exports.MongoConnect = void 0;
const mongodb_1 = require("mongodb");
Object.defineProperty(exports, "Db", { enumerable: true, get: function () { return mongodb_1.Db; } });
Object.defineProperty(exports, "MongoClient", { enumerable: true, get: function () { return mongodb_1.MongoClient; } });
Object.defineProperty(exports, "ObjectId", { enumerable: true, get: function () { return mongodb_1.ObjectId; } });
class MongoConnect {
    name;
    emitter;
    mongoClient;
    client;
    userConfig;
    config;
    mode;
    reconnecting;
    healthyHosts;
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
            readPreference: mongodb_1.ReadPreference.SECONDARY_PREFERRED,
        };
        this.config.authSource = (userConfig.auth || {}).authSource;
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
    getHealthyHosts() {
        return this.healthyHosts || [];
    }
    async getConnectionUrl() {
        let servers = await this.userConfig.getServers();
        const joiner = ["mongodb://"];
        if (this.userConfig.auth) {
            const { username, password } = this.userConfig.auth;
            joiner.push(`${username}:${password}@`);
        }
        // If no active servers, retry with old servers once again
        if (servers.length == 0) {
            servers = this.getHealthyHosts();
        }
        this.healthyHosts = servers;
        joiner.push(servers.map((server) => `${server.host}:${server.port}`).join(","));
        return joiner.join("");
    }
    static isValidError(err) {
        return (err instanceof mongodb_1.MongoServerSelectionError ||
            err instanceof mongodb_1.MongoNetworkError ||
            err instanceof mongodb_1.MongoTimeoutError);
    }
    getClient() {
        return this.mongoClient;
    }
    async connect() {
        let connected = false;
        // Reconnection handler
        let attempt = 1;
        // Keep reference to old mongoClient, will need to close it later
        const oldMongoClient = this.mongoClient;
        while (!connected && attempt <= 10) {
            try {
                // Returns connection url with only healthy hosts
                const connectionUrl = await this.getConnectionUrl(); // C * 10 => 10C seconds
                const mongoClient = new mongodb_1.MongoClient(connectionUrl, this.config); // 10 * 10 => 100 seconds
                await mongoClient.connect();
                // Update this.mongoClient ONLY after a valid client has been established; else topology closed error will
                // be thrown will is not being monitored/is valid error for reconnection
                this.mongoClient = mongoClient;
                connected = true;
            }
            catch (err) {
                if (MongoConnect.isValidError(err)) {
                    this.error(err);
                    // 2 + 4 + 6 + 8 + 10 + 12 ... 20 => 2 * (1 + 2 + 3 + 4 ... 10) => 2 * ((10 * 11) / 2) => 110 seconds
                    await new Promise((res) => setTimeout(res, 2 * attempt * 1000));
                    attempt++;
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
        if (oldMongoClient instanceof mongodb_1.MongoClient) {
            // Do NOT wait. If you wait, this might block indefinitely due to the older server being out of action.
            oldMongoClient.close();
        }
        return this;
    }
}
exports.MongoConnect = MongoConnect;
async function handleMongoError(err, mongo) {
    if (MongoConnect.isValidError(err)) {
        if (mongo.reconnecting === null) {
            mongo.reconnecting = mongo.connect()
                .then(() => {
                return null;
            });
        }
        await (mongo.reconnecting || Promise.resolve());
        mongo.reconnecting = null;
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
function MongoFactoryAuto(name, emitter, config) {
    if (config.replica) {
        return MongoFactory(MODES.REPLSET, name, emitter, config);
    }
    else if (config.shard) {
        return MongoFactory(MODES.SHARD, name, emitter, config);
    }
    else {
        return MongoFactory(MODES.SERVER, name, emitter, config);
    }
}
exports.MongoFactoryAuto = MongoFactoryAuto;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscUNBVWlCO0FBcVRlLG1GQTlUOUIsWUFBRSxPQThUOEI7QUFBZiw0RkE3VGpCLHFCQUFXLE9BNlRpQjtBQUFyQix5RkExVFAsa0JBQVEsT0EwVE87QUF4UmpCLE1BQWEsWUFBWTtJQUN2QixJQUFJLENBQVM7SUFDYixPQUFPLENBQXNCO0lBQzdCLFdBQVcsQ0FBYztJQUN6QixNQUFNLENBQUs7SUFDWCxVQUFVLENBQWE7SUFDdkIsTUFBTSxDQUFxQjtJQUMzQixJQUFJLENBQVM7SUFDYixZQUFZLENBQWlCO0lBQ3JCLFlBQVksQ0FBVztJQUUvQixZQUNFLElBQVksRUFDWixPQUE0QixFQUM1QixVQUFzQixFQUN0QixJQUFZO1FBRVosSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7UUFDN0IsSUFBSSxDQUFDLE1BQU0sR0FBRztZQUNaLFNBQVMsRUFBRSxJQUFJO1lBQ2YsUUFBUSxFQUFFLENBQUM7WUFDWCxnQkFBZ0IsRUFBRSxLQUFLO1lBQ3ZCLGVBQWUsRUFBRSxLQUFLO1lBQ3RCLHdCQUF3QixFQUFFLEtBQUs7WUFDL0Isa0JBQWtCLEVBQUUsSUFBSTtZQUN4QixvQkFBb0IsRUFBRSxLQUFLO1lBQzNCLGNBQWMsRUFBRSx3QkFBYyxDQUFDLG1CQUFtQjtTQUNuRCxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUM1RCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNuQixDQUFDO0lBRUQsR0FBRyxDQUFDLE9BQWUsRUFBRSxJQUEwQjtRQUM3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