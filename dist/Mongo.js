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
        console.log('Gotten servers: ', servers);
        const joiner = ["mongodb://"];
        if (this.userConfig.auth) {
            const { username, password } = this.userConfig.auth;
            joiner.push(`${username}:${password}@`);
        }
        // If no active server, mock throw MongoServerSelection error
        if (servers.length == 0) {
            servers.push({ host: '127.0.0.1', port: 27017 });
            console.log('Modifying servers', servers);
        }
        joiner.push(servers.map((server) => `${server.host}:${server.port}`).join(","));
        console.log({ joiner });
        return joiner.join("");
    }
    async connect() {
        let connected = false;
        // Reconnection handler
        let attempt = 1;
        // Keep reference to old mongoClient, will need to close it later
        const oldMongoClient = this.mongoClient;
        while (!connected && attempt <= 10) {
            console.log({ action: 'connect', attempt });
            try {
                // Returns connection url with only healthy hosts
                const connectionUrl = await this.getConnectionUrl();
                console.log({ action: 'connecting', connectionUrl, attempt });
                const mongoClient = new mongodb_1.MongoClient(connectionUrl, this.config); // 10 second -> 100 seconds
                await mongoClient.connect();
                // Update this.mongoClient ONLY after a valid client has been established; else topology closed error will
                // be thrown will is not being monitored/is valid error for reconnection
                this.mongoClient = mongoClient;
                connected = true;
            }
            catch (err) {
                console.log({ err, isServerSelectionError: err instanceof mongodb_1.MongoServerSelectionError });
                if (err instanceof mongodb_1.MongoServerSelectionError) {
                    this.error(err);
                    console.log({ err, action: 'error caught, reattempting' });
                    // In case there is failure to select the server, sleep for few seconds and then retry
                    let count = 0;
                    let interval = setInterval(() => {
                        console.log({ action: 'waiting', count: count++, attempt });
                    }, 1000);
                    await new Promise(res => {
                        setTimeout(() => { res(0); clearInterval(interval); }, 2 * attempt * 1000);
                    }); //  110 seconds
                    attempt++;
                }
                else {
                    throw new Error(err);
                }
            }
        }
        if (oldMongoClient instanceof mongodb_1.MongoClient) {
            console.log('Closing older mongo client');
            await oldMongoClient.close();
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
    console.log({ action: 'handleMongoErrorInvalid, will throw', err });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTW9uZ28uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvTW9uZ28udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EscUNBUWlCO0FBMkJqQixNQUFNLFlBQVk7SUFVaEIsWUFDRSxJQUFZLEVBQ1osT0FBNEIsRUFDNUIsVUFBc0IsRUFDdEIsSUFBWTtRQUVaLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxNQUFNLEdBQUc7WUFDWixTQUFTLEVBQUUsSUFBSTtZQUNmLFFBQVEsRUFBRSxDQUFDO1lBQ1gsZ0JBQWdCLEVBQUUsS0FBSztZQUN2QixlQUFlLEVBQUUsS0FBSztZQUN0Qix3QkFBd0IsRUFBRSxLQUFLO1lBQy9CLGtCQUFrQixFQUFFLElBQUk7WUFDeEIsb0JBQW9CLEVBQUUsS0FBSztZQUMzQixjQUFjLEVBQUUsd0JBQWMsQ0FBQyxTQUFTO1NBQ3pDLENBQUM7UUFDRixJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUU7WUFDbkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUc7Z0JBQ2pCLElBQUksRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVE7Z0JBQzlCLFFBQVEsRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVE7YUFDbkMsQ0FBQztZQUNGLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1NBQ3JEO1FBQ0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDbkIsQ0FBQztJQUVELEdBQUcsQ0FBQyxPQUFlLEVBQUUsSUFBMEI7UUFDN0MsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ3ZCLE9BQU8sRUFBRSxJQUFJLENBQUMsSUFBSTtZQUNsQixPQUFPO1lBQ1AsSUFBSTtTQUNMLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLENBQUMsT0FBZSxFQUFFLElBQTBCO1FBQ2pELElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRTtZQUMzQixPQUFPLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDbEIsT0FBTztZQUNQLElBQUk7U0FDTCxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQVUsRUFBRSxJQUEwQjtRQUMxQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDekIsT0FBTyxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2xCLElBQUk7WUFDSixHQUFHO1NBQ0osQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLEtBQUssQ0FBQyxnQkFBZ0I7UUFDNUIsSUFBSSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDekMsTUFBTSxNQUFNLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUU5QixJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFO1lBQ3hCLE1BQU0sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7WUFDcEQsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLFFBQVEsSUFBSSxRQUFRLEdBQUcsQ0FBQyxDQUFDO1NBQ3pDO1FBRUQsNkRBQTZEO1FBQzdELElBQUksT0FBTyxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUU7WUFDdkIsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsQ0FBQztTQUMzQztRQUVELE1BQU0sQ0FBQyxJQUFJLENBQ1QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FDbkUsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBRXhCLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN6QixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQU87UUFDWCxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDdEIsdUJBQXVCO1FBQ3ZCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztRQUNoQixpRUFBaUU7UUFDakUsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUN4QyxPQUFNLENBQUMsU0FBUyxJQUFJLE9BQU8sSUFBSSxFQUFFLEVBQUU7WUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUM1QyxJQUFJO2dCQUNGLGlEQUFpRDtnQkFDakQsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsYUFBYSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7Z0JBQzlELE1BQU0sV0FBVyxHQUFHLElBQUkscUJBQVcsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsMkJBQTJCO2dCQUM1RixNQUFNLFdBQVcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDNUIsMEdBQTBHO2dCQUMxRyx3RUFBd0U7Z0JBQ3hFLElBQUksQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDO2dCQUMvQixTQUFTLEdBQUcsSUFBSSxDQUFDO2FBQ2xCO1lBQUMsT0FBTSxHQUFHLEVBQUU7Z0JBQ1gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxzQkFBc0IsRUFBRSxHQUFHLFlBQVksbUNBQXlCLEVBQUUsQ0FBQyxDQUFDO2dCQUN2RixJQUFJLEdBQUcsWUFBWSxtQ0FBeUIsRUFBRTtvQkFDNUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDaEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsNEJBQTRCLEVBQUUsQ0FBQyxDQUFDO29CQUMzRCxzRkFBc0Y7b0JBQ3RGLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztvQkFDZCxJQUFJLFFBQVEsR0FBRyxXQUFXLENBQUMsR0FBRyxFQUFFO3dCQUM5QixPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztvQkFDOUQsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO29CQUNULE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUU7d0JBQ3RCLFVBQVUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQTtvQkFDNUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlO29CQUNuQixPQUFPLEVBQUUsQ0FBQztpQkFDWDtxQkFBTTtvQkFDTCxNQUFNLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUN0QjthQUNGO1NBQ0Y7UUFFRCxJQUFJLGNBQWMsWUFBWSxxQkFBVyxFQUFFO1lBQ3pDLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUMxQyxNQUFNLGNBQWMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztTQUM5QjtRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsb0NBQW9DLEVBQUUsQ0FBQyxDQUFDO1FBQzlELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsT0FBTyxDQUFDLDZCQUE2QixJQUFJLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQztRQUM1RCxnQkFBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM3QixnQkFBVyxDQUFDLGdCQUFnQixDQUFDLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxFQUFFO1lBQzVDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0NBQ0Y7QUFFTSxLQUFLLFVBQVUsZ0JBQWdCLENBQUMsR0FBVSxFQUFFLEtBQVk7SUFDN0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSwyQkFBMkIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzFELElBQUksR0FBRyxZQUFZLG1DQUF5QixFQUFFO1FBQzVDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsOEJBQThCLEVBQUUsMkJBQTJCLEVBQUUsR0FBRyxZQUFZLG1DQUF5QixFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQztRQUMzSixJQUFJLEtBQUssQ0FBQyxZQUFZLEtBQUssSUFBSSxFQUFFO1lBQy9CLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUscUNBQXFDLEVBQUUsQ0FBQyxDQUFDO1lBQy9ELEtBQUssQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDLE9BQU8sRUFBRTtpQkFDakMsSUFBSSxDQUFDLEdBQUcsRUFBRTtnQkFDVCxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixDQUFDLENBQUM7Z0JBQ3hDLE9BQU8sSUFBSSxDQUFDO1lBQ2QsQ0FBQyxDQUFDO2lCQUNELEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsOEJBQThCLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1NBQy9FO1FBQ0QsTUFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLElBQUksT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFDaEQsS0FBSyxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUM7UUFDMUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxxQkFBcUIsRUFBRSxDQUFDLENBQUM7UUFDL0MsT0FBTyxJQUFJLENBQUE7S0FDWjtJQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUscUNBQXFDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUNwRSxPQUFPLEdBQUcsQ0FBQztBQUNiLENBQUM7QUFwQkQsNENBb0JDO0FBRUQsSUFBWSxLQUlYO0FBSkQsV0FBWSxLQUFLO0lBQ2YsMEJBQWlCLENBQUE7SUFDakIsNEJBQW1CLENBQUE7SUFDbkIsd0JBQWUsQ0FBQTtBQUNqQixDQUFDLEVBSlcsS0FBSyxHQUFMLGFBQUssS0FBTCxhQUFLLFFBSWhCO0FBMEJELFNBQWdCLFlBQVksQ0FDMUIsSUFBWSxFQUNaLElBQVksRUFDWixPQUE0QixFQUM1QixNQUFrRDtJQUVsRCxRQUFRLElBQUksRUFBRTtRQUNaLEtBQUssS0FBSyxDQUFDLE1BQU07WUFDZixPQUFPLElBQUksV0FBVyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsTUFBc0IsQ0FBQyxDQUFDO1FBQ2hFLEtBQUssS0FBSyxDQUFDLE9BQU87WUFDaEIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQXVCLENBQUMsQ0FBQztRQUM3RCxLQUFLLEtBQUssQ0FBQyxLQUFLO1lBQ2QsT0FBTyxJQUFJLFVBQVUsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQXFCLENBQUMsQ0FBQztRQUM5RDtZQUNFLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQztLQUMzQztBQUNILENBQUM7QUFoQkQsb0NBZ0JDO0FBRUQsTUFBTSxXQUFZLFNBQVEsWUFBWTtJQUNwQyxZQUNFLElBQVksRUFDWixPQUE0QixFQUM1QixNQUFvQjtRQUVwQixNQUFNLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsTUFBTSxDQUFDO1FBQ3hDLE1BQU0sVUFBVSxHQUFlO1lBQzdCLEVBQUU7WUFDRixVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDbkQsSUFBSTtTQUNMLENBQUM7UUFDRixLQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2pELENBQUM7Q0FDRjtBQUVELE1BQU0sT0FBUSxTQUFRLFlBQVk7SUFDaEMsWUFDRSxJQUFZLEVBQ1osT0FBNEIsRUFDNUIsYUFBNEI7UUFFNUIsTUFBTSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLEdBQUcsYUFBYSxDQUFDO1FBQzVDLE1BQU0sTUFBTSxHQUFlO1lBQ3pCLEVBQUUsRUFBRSxFQUFFO1lBQ04sVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQztZQUNsRCxJQUFJO1NBQ0wsQ0FBQztRQUNGLEtBQUssQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztJQUN4QyxDQUFDO0NBQ0Y7QUFFRCxNQUFNLFVBQVcsU0FBUSxZQUFZO0lBQ25DLFlBQ0UsSUFBWSxFQUNaLE9BQTRCLEVBQzVCLFdBQXdCO1FBRXhCLE1BQU0sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLFdBQVcsQ0FBQztRQUN4QyxLQUFLLENBQ0gsSUFBSSxFQUNKLE9BQU8sRUFDUCxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLFVBQVUsRUFBRSxJQUFJLEVBQUUsRUFDMUMsS0FBSyxDQUFDLEtBQUssQ0FDWixDQUFDO0lBQ0osQ0FBQztDQUNGO0FBRUQsU0FBZ0IsZUFBZSxDQUFDLEtBQWlDO0lBQy9ELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBQztJQUM3QixNQUFNLE9BQU8sR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNDLElBQUksQ0FBQyxPQUFPLEVBQUU7UUFDWixPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsT0FBTyxrQkFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBUkQsMENBUUM7QUFFRCxTQUFnQixjQUFjLENBQUMsS0FBYTtJQUMxQyxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsS0FBSyxLQUFLLEVBQUU7UUFDcEMsTUFBTSxJQUFJLFNBQVMsQ0FBQyw0Q0FBNEMsS0FBSyxJQUFJLENBQUMsQ0FBQztLQUM1RTtJQUNELE9BQU8sa0JBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUM3QyxDQUFDO0FBTEQsd0NBS0M7QUFFRCxtQ0FBbUM7QUFBMUIsbUdBQUEsUUFBUSxPQUFBIn0=