const cassandra = require('cassandra-driver');
const standardTests = require('passwordless-tokenstore-test');
const CassandraStore = require('../index');

const options = {
  contactPoints: ['localhost'],
  keyspace: 'test',
  localDataCenter: 'datacenter1'
};

function tokenStoreFactory() {
  return new CassandraStore(options);
}

function beforeEachTest(done) {
  const store = new CassandraStore(options);
  store.ready(() => store.clear(done));
}

function afterEachTest(done) {
  done();
}

it('create test keyspace', function (done) {
  const client = new cassandra.Client(options);
  client.execute(`
      CREATE KEYSPACE IF NOT EXISTS test
        WITH REPLICATION = {
         'class' : 'SimpleStrategy',
         'replication_factor' : 1
        }
    `)
    .then(() => client.execute('USE test'))
    .then(() => client.execute('DROP TABLE IF EXISTS login_token'))
    .then(() => done())
    .catch(err => done(err))
    ;
});

standardTests(tokenStoreFactory, beforeEachTest, afterEachTest, 1000);
