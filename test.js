
const { EventEmitter } = require('events');
const Mongo = require('./index.js');

const emitter = new EventEmitter();
emitter.on('error', console.log.bind(console));
emitter.on('info', console.error.bind(console));
emitter.on('success', console.log.bind(console));

const mongo = new Mongo('mongo', emitter, {
  db: 'somedb',
});
mongo.init()
  .then(() => {
    console.log('Done.');
  })
  .catch(err => {
    console.error(err);
  });
