"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectId = exports.castToObjectId = exports.isValidObjectId = exports.MongoFactory = exports.MODES = exports.handleMongoError = void 0;
const mongodb_1 = require("mongodb");
Object.defineProperty(exports, "ObjectId", { enumerable: true, get: function () { return mongodb_1.ObjectId; } });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscUNBVWlCO0FBbVNSLHlGQXhTUCxrQkFBUSxPQXdTTztBQXZRakIsTUFBTSxZQUFZO0lBV2hCLFlBQ0UsSUFBWSxFQUNaLE9BQTRCLEVBQzVCLFVBQXNCLEVBQ3RCLElBQVk7UUFFWixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztRQUM3QixJQUFJLENBQUMsTUFBTSxHQUFHO1lBQ1osU0FBUyxFQUFFLElBQUk7WUFDZixRQUFRLEVBQUUsQ0FBQztZQUNYLGdCQUFnQixFQUFFLEtBQUs7WUFDdkIsZUFBZSxFQUFFLEtBQUs7WUFDdEIsd0JBQXdCLEVBQUUsS0FBSztZQUMvQixrQkFBa0IsRUFBRSxJQUFJO1lBQ3hCLG9CQUFvQixFQUFFLEtBQUs7WUFDM0IsY0FBYyxFQUFFLHdCQUFjLENBQUMsU0FBUztTQUN6QyxDQUFDO1FBQ0YsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxJQUFJLEVBQUUsQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUM1RCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNuQixDQUFDO0lBRUQsR0FBRyxDQUFDLE9BQWUsRUFBRSxJQUEwQjtRQUM3QyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDdkIsT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2xCLE9BQU87WUFDUCxJQUFJO1NBQ0wsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU8sQ0FBQyxPQUFlLEVBQUUsSUFBMEI7UUFDakQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFO1lB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