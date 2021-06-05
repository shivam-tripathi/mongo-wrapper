"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectId = exports.castToObjectId = exports.isValidObjectId = exports.MongoFactory = exports.MODES = void 0;
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
        if (this.client) {
            return Promise.resolve(this);
        }
        const connectionUrl = await this.getConnectionUrl();
        this.mongoClient = await mongodb_1.MongoClient.connect(connectionUrl, this.config);
        this.client = this.mongoClient.db(this.userConfig.db);
        this.connected = true;
        this.success(`Successfully connected in ${this.mode} mode`);
        mongodb_1.Logger.setLevel("info");
        mongodb_1.Logger.setCurrentLogger((msg, context) => {
            this.log(msg, context);
        });
        return this;
    }
}
var MODES;
(function (MODES) {
    MODES["STANDALONE"] = "standalone";
    MODES["PSA"] = "psa";
    MODES["SHARD"] = "shard";
})(MODES = exports.MODES || (exports.MODES = {}));
function MongoFactory(mode, name, emitter, config) {
    switch (mode) {
        case MODES.STANDALONE:
            return new StandaloneMongo(name, emitter, config);
        case MODES.PSA:
            return new PsaMongo(name, emitter, config);
        case MODES.SHARD:
            return new ShardMongo(name, emitter, config);
        default:
            throw new Error("Invalid architecture");
    }
}
exports.MongoFactory = MongoFactory;
class StandaloneMongo extends MongoConnect {
    constructor(name, emitter, config) {
        const { db, host, port, auth } = config;
        const userConfig = {
            db,
            getServers: () => Promise.resolve([{ host, port }]),
            auth,
        };
        super(name, emitter, userConfig, MODES.STANDALONE);
    }
}
class PsaMongo extends MongoConnect {
    constructor(name, emitter, replicaConfig) {
        const { db, replica, auth } = replicaConfig;
        const config = {
            db: db,
            getServers: () => Promise.resolve(replica.servers),
            auth,
        };
        super(name, emitter, config, MODES.PSA);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscUNBT2lCO0FBMEJqQixNQUFNLFlBQVk7SUFVaEIsWUFDRSxJQUFZLEVBQ1osT0FBNEIsRUFDNUIsVUFBc0IsRUFDdEIsSUFBWTtRQUVaLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUc7WUFDWixTQUFTLEVBQUUsSUFBSTtZQUNmLFFBQVEsRUFBRSxDQUFDO1lBQ1gsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixlQUFlLEVBQUUsS0FBSztZQUN0QixrQkFBa0IsRUFBRSxJQUFJO1lBQ3hCLG9CQUFvQixFQUFFLEtBQUs7WUFDM0IsY0FBYyxFQUFFLHdCQUFjLENBQUMsU0FBUztTQUN6QyxDQUFDO1FBQ0YsSUFBSSxVQUFVLENBQUMsSUFBSSxFQUFFO1lBQ25CLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHO2dCQUNqQixJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRO2dCQUM5QixRQUFRLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRO2FBQ25DLENBQUM7WUFDRixJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztTQUNyRDtRQUNELElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ25CLENBQUM7SUFFRCxHQUFHLENBQUMsT0FBZSxFQUFFLElBQTBCO1FBQzdDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRTtZQUN2QixPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDbEIsT0FBTztZQUNQLElBQUk7U0FDTCxD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