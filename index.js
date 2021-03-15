
const { MongoClient, Logger: mLogger, ObjectId } = require('mongodb');

/**
 * @class Mongo
 */
class Mongo {
  /**
   * @param {string} name - unique name to this service
   * @param {EventEmitter} emitter
   * @param {Object} config - configuration object of service
   */
  constructor(name, emitter, config) {
    this.name = name;
    this.emitter = emitter;
    this.client = null;
    this.config = Object.assign({
      host: 'localhost',
      port: 27017,
    }, config, {
      auth: Object.assign({
        use: false,
      }, config.auth),
      replica: Object.assign({
        use: false,
      }, config.replica),
      options: Object.assign({
        keepAlive: true,
        autoReconnect: true,
        poolSize: 5,
        connectTimeoutMS: 30000,
        socketTimeoutMS: 30000,
        connectWithNoPrimary: false,
        readPreference: 'secondaryPreferred',
      }, config.options)
    });
  }

  log(message, data) {
    this.emitter.emit('log', {
      service: this.name,
      message,
      data,
    });
  }

  success(message, data) {
    this.emitter.emit('success', {
      service: this.name, message, data,
    });
  }

  error(err, data) {
    this.emitter.emit('error', {
      service: this.name,
      data,
      err,
    });
  }


  /**
   * Connect to server
   */
  init() {
    const { config } = this;
    const { auth, options, replica } = config;

    if (this.client) {
      return Promise.resolve(this);
    }

    const infoObj = {};

    let url = 'mongodb://';
    if (auth.use === true) {
      Object.assign(infoObj, {
        authentication: 'TRUE',
      });
      url += `${auth.username}:${auth.password}@`;
      Object.assign(options, {
        authSource: auth.authSource,
      });
    } else {
      Object.assign(infoObj, {
        authentication: 'FALSE',
      });
    }
    if (replica.use === true) {
      Object.assign(infoObj, {
        mode: 'REPLICAS',
        servers: replica.servers,
      });
      url += replica.servers.map(s => `${s.host}:${s.port}`).join(',');
      Object.assign(options, {
        replicaSet: replica.name,
      });
    } else {
      Object.assign(infoObj, {
        mode: 'SINGLE',
        host: config.host,
        port: config.port,
      });
      url += `${config.host}:${config.port}`;
    }
    Object.assign(infoObj, {
      db: config.db,
      options,
    });

    this.log(`Connecting in ${infoObj.mode} mode`, infoObj);

    return MongoClient.connect(url, options).then(client => {
      this.client = client.db(config.db);
      this.connected = true;
      this.success(`Successfully connected in ${infoObj.mode} mode`);
      mLogger.setLevel('info');
      mLogger.setCurrentLogger((msg, context) => {
        this.log(msg, context);
      });
      return this;
    });
  }
}

function isValidObjectId(value) {
  const regex = /[0-9a-f]{24}/;
  const matched = String(value).match(regex);
  if (!matched) {
    return false;
  }

  return ObjectId.isValid(value);
}

function castToObjectId(value) {
  if (isValidObjectId(value) === false) {
    throw new TypeError(`Value passed is not valid objectId, is [ ${value} ]`);
  }
  return ObjectId.createFromHexString(value);
}

module.exports = { Mongo, ObjectId, isValidObjectId, castToObjectId };
