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
        let servers = await this.userConfig.getServers();
        const joiner = ["mongodb://"];
        if (this.userConfig.auth) {
            const { username, password } = this.userConfig.auth;
            joiner.push(`${username}:${password}@`);
        }
        // If no active server, mock throw MongoServerSelection error with invalid ip
        if (servers.length == 0) {
            servers.push({ host: '255.255.255.255', port: 27017 });
        }
        joiner.push(servers.map((server) => `${server.host}:${server.port}`).join(","));
        return joiner.join("");
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
                const connectionUrl = await this.getConnectionUrl();
                const mongoClient = new mongodb_1.MongoClient(connectionUrl, this.config); // 10 second -> 100 seconds
                await mongoClient.connect();
                // Update this.mongoClient ONLY after a valid client has been established; else topology closed error will
                // be thrown will is not being monitored/is valid error for reconnection
                this.mongoClient = mongoClient;
                connected = true;
            }
            catch (err) {
                if (err instanceof mongodb_1.MongoServerSelectionError) {
                    this.error(err);
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
    if (err instanceof mongodb_1.MongoServerSelectionError) {
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
var mongodb_2 = require("mongodb");
Object.defineProperty(exports, "ObjectId", { enumerable: true, get: function () { return mongodb_2.ObjectId; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscUNBUWlCO0FBMkJqQixNQUFNLFlBQVk7SUFVaEIsWUFDRSxJQUFZLEVBQ1osT0FBNEIsRUFDNUIsVUFBc0IsRUFDdEIsSUFBWTtRQUVaLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUc7WUFDWixTQUFTLEVBQUUsSUFBSTtZQUNmLFFBQVEsRUFBRSxDQUFDO1lBQ1gsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixlQUFlLEVBQUUsS0FBSztZQUN0Qix3QkFBd0IsRUFBRSxLQUFLO1lBQy9CLGtCQUFrQixFQUFFLElBQUk7WUFDeEIsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixjQUFjLEVBQUUsd0JBQWMsQ0FBQyxTQUFTO1NBQ3pDLENBQUM7UUFDRixJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUU7WUFDbkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUc7Z0JBQ2pCLElBQUksRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVE7Z0JBQzlCLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVE7YUFDbkMsQ0FBQztZQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1NBQ3JEO1FBQ0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUVELEdBQUcsQ0FBQyxPQUFlLEVBQUUsSUFBMEI7UUFDN0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ3ZCLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNsQixPQUFPO1lBQ1AsSUFBSTtTQUNMLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLENBQUMsT0FBZSxFQUFFLElBQTBCO1FBQ2pELElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUMzQixPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDbEIsT0FBTztZQUNQLElBQUk7U0FDTCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQVUsRUFBRSxJQUEwQjtRQUMxQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDekIsT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2xCLElBQUk7WUFDSixHQUFHO1NBQ0osQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxnQkFBZ0I7UUFDNUIsSUFBSSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pELE1BQU0sTUFBTSxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFOUIsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRTtZQUN4QixNQUFNLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO1lBQ3BELE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxRQUFRLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQztTQUN6QztRQUVELDZFQUE2RTtRQUM3RSxJQUFJLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFO1lBQ3ZCLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7U0FDeEQ7UUFFRCxNQUFNLENBQUMsSUFBSSxDQUNULE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLElBQUksSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQ25FLENBQUM7UUFFRixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPO1FBQ1gsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLHVCQUF1QjtRQUN2QixJQUFJLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDaEIsaUVBQWlFO1FBQ2pFLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDeEMsT0FBTSxDQUFDLFNBQVMsSUFBSSxPQUFPLElBQUksRUFBRSxFQUFFO1lBQ2pDLElBQUk7Z0JBQ0YsaURBQWlEO2dCQUNqRCxNQUFNLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUNwRCxNQUFNLFdBQVcsR0FBRyxJQUFJLHFCQUFXLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLDJCQUEyQjtnQkFDNUYsTUFBTSxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQzVCLDBHQUEwRztnQkFDMUcsd0VBQXdFO2dCQUN4RSxJQUFJLENBQUMsV0FBVyxHQUFHLFdBQVcsQ0FBQztnQkFDL0IsU0FBUyxHQUFHLElBQUksQ0FBQzthQUNsQjtZQUFDLE9BQU0sR0FBRyxFQUFFO2dCQUNYLElBQUksR0FBRyxZQUFZLG1DQUF5QixFQUFFO29CQUM1QyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUNoQixPQUFPLEVBQUUsQ0FBQztpQkFDWDtxQkFBTTtvQkFDTCxNQUFNLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUN0QjthQUNGO1NBQ0Y7UUFDRCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyw2QkFBNkIsSUFBSSxDQUFDLElBQUksT0FBTyxDQUFDLENBQUM7UUFDNUQsZ0JBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDN0IsZ0JBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsRUFBRTtZQUM1QyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6QixDQUFDLENBQUMsQ0FBQztRQUNILElBQUksY0FBYyxZQUFZLHFCQUFXLEVBQUU7WUFDekMsdUdBQXVHO1lBQ3ZHLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUN4QjtRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztDQUNGO0FBRU0sS0FBSyxVQUFVLGdCQUFnQixDQUFDLEdBQVUsRUFBRSxLQUFZO0lBQzdELElBQUksR0FBRyxZQUFZLG1DQUF5QixFQUFFO1FBQzVDLElBQUksS0FBSyxDQUFDLFlBQVksS0FBSyxJQUFJLEVBQUU7WUFDL0IsS0FBSyxDQUFDLFlBQVksR0FBRyxLQUFLLENBQUMsT0FBTyxFQUFFO2lCQUNqQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNULE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLENBQUM7U0FDTjtRQUNELE1BQU0sQ0FBQyxLQUFLLENBQUMsWUFBWSxJQUFJLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ2hELEtBQUssQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQzFCLE9BQU8sSUFBSSxDQUFBO0tBQ1o7SUFDRCxPQUFPLEdBQUcsQ0FBQztBQUNiLENBQUM7QUFiRCw0Q0FhQztBQUVELElBQVksS0FJWDtBQUpELFdBQVksS0FBSztJQUNmLDBCQUFpQixDQUFBO0lBQ2pCLDRCQUFtQixDQUFBO0lBQ25CLHdCQUFlLENBQUE7QUFDakIsQ0FBQyxFQUpXLEtBQUssR0FBTCxhQUFLLEtBQUwsYUFBSyxRQUloQjtBQTBCRCxTQUFnQixZQUFZLENBQzFCLElBQVksRUFDWixJQUFZLEVBQ1osT0FBNEIsRUFDNUIsTUFBa0Q7SUFFbEQsUUFBUSxJQUFJLEVBQUU7UUFDWixLQUFLLEtBQUssQ0FBQyxNQUFNO1lBQ2YsT0FBTyxJQUFJLFdBQVcsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQXNCLENBQUMsQ0FBQztRQUNoRSxLQUFLLEtBQUssQ0FBQyxPQUFPO1lBQ2hCLE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUF1QixDQUFDLENBQUM7UUFDN0QsS0FBSyxLQUFLLENBQUMsS0FBSztZQUNkLE9BQU8sSUFBSSxVQUFVLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFxQixDQUFDLENBQUM7UUFDOUQ7WUFDRSxNQUFNLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7S0FDM0M7QUFDSCxDQUFDO0FBaEJELG9DQWdCQztBQUVELE1BQU0sV0FBWSxTQUFRLFlBQVk7SUFDcEMsWUFDRSxJQUFZLEVBQ1osT0FBNEIsRUFDNUIsTUFBb0I7UUFFcEIsTUFBTSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxHQUFHLE1BQU0sQ0FBQztRQUN4QyxNQUFNLFVBQVUsR0FBZTtZQUM3QixFQUFFO1lBQ0YsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ25ELElBQUk7U0FDTCxDQUFDO1FBQ0YsS0FBSyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNqRCxDQUFDO0NBQ0Y7QUFFRCxNQUFNLE9BQVEsU0FBUSxZQUFZO0lBQ2hDLFlBQ0UsSUFBWSxFQUNaLE9BQTRCLEVBQzVCLGFBQTRCO1FBRTVCLE1BQU0sRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLGFBQWEsQ0FBQztRQUM1QyxNQUFNLE1BQU0sR0FBZTtZQUN6QixFQUFFLEVBQUUsRUFBRTtZQUNOLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUM7WUFDbEQsSUFBSTtTQUNMLENBQUM7UUFDRixLQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7SUFDeEMsQ0FBQztDQUNGO0FBRUQsTUFBTSxVQUFXLFNBQVEsWUFBWTtJQUNuQyxZQUNFLElBQVksRUFDWixPQUE0QixFQUM1QixXQUF3QjtRQUV4QixNQUFNLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsR0FBRyxXQUFXLENBQUM7UUFDeEMsS0FBSyxDQUNILElBQUksRUFDSixPQUFPLEVBQ1AsRUFBRSxFQUFFLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLEVBQzFDLEtBQUssQ0FBQyxLQUFLLENBQ1osQ0FBQztJQUNKLENBQUM7Q0FDRjtBQUVELFNBQWdCLGVBQWUsQ0FBQyxLQUFpQztJQUMvRCxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUM7SUFDN0IsTUFBTSxPQUFPLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMzQyxJQUFJLENBQUMsT0FBTyxFQUFFO1FBQ1osT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE9BQU8sa0JBQVEsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQVJELDBDQVFDO0FBRUQsU0FBZ0IsY0FBYyxDQUFDLEtBQWE7SUFDMUMsSUFBSSxlQUFlLENBQUMsS0FBSyxDQUFDLEtBQUssS0FBSyxFQUFFO1FBQ3BDLE1BQU0sSUFBSSxTQUFTLENBQUMsNENBQTRDLEtBQUssSUFBSSxDQUFDLENBQUM7S0FDNUU7SUFDRCxPQUFPLGtCQUFRLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDN0MsQ0FBQztBQUxELHdDQUtDO0FBRUQsbUNBQW1DO0FBQTFCLG1HQUFBLFFBQVEsT0FBQSJ9