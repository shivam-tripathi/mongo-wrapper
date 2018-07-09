
const { EventEmitter } = require('events');
const { Mongo } = require('./index.js');

const emitter = new EventEmitter();
emitter.on('error', console.log.bind(console));
emitter.on('log', console.error.bind(console));
emitter.on('success', console.log.bind(console));

const mongo = new Mongo('mongo', emitter, {
  db: 'somedb',
});
mongo.init()
  .then(() => {
    console.log('Connected');
    return mongo.client.collection('inserts').insertOne({ a:1 });
  })
  .then(() => {
    return mongo.client.collection('inserts').find({}).toArray();
  })
  .then(docs => {
    console.log(docs);
  })
  .catch(err => {
    console.error(err);
  });
