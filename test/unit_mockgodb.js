
const Mockgodb = require('../mockgodb')
const mongodb = require('mongodb')
const MongoClient = mongodb.MongoClient
const debug = require('debug')('dply:test:unit:mockgodb:')
const expect = require('chai').expect
require('source-map-support').install()


describe('Unit::Dply::Mockgodb', function () {

  let db = null
  let collection = null

  it('opens a first connection', function(done) {
    Mockgodb.setup(MongoClient).then(res => {
      debug('mockgo url', res)
      let url = 'mongodb://localhost:27017/wakka'
      return MongoClient.connect(url)
    })
  })

  it('connects and disconnects', function(done) {
    Mockgodb.setup(MongoClient).then(res => {
      debug('mockgo url', res)
      let url = 'mongodb://localhost:27017/wakka'
      return MongoClient.connect(url)
    }).then(db => {
      debug('connected to mockgodb - %s:%s', db.serverConfig.s.host, db.serverConfig.s.port)
      return db.unmock()
    }).then(res => {
      debug('unmocked', res)
      done()
    })
    .catch(done)
  })

  it('connects and reconnects', function() {
    return Mockgodb.setup(MongoClient).then(res => {
      debug('mockgodb url', res)
      let url = 'mongodb://localhost:27017/wakka'
      return MongoClient.connect(url)
    }).then(newdb => {
      db = newdb
      debug('connected to mockgodb - %s:%s', db.serverConfig.s.host, db.serverConfig.s.port)
    })
  })
      
  it('isMocked', function() {
    expect( db.isMocked ).to.be.true
  })
  
  it('should create a db foo', function() {
    return db.createCollection('foo').then(newcollection => {
      collection = newcollection
      expect( collection ).to.be.ok
    })
  })

  it('should create a bar document', function() {
    return collection.insert({ bar: 'cat' }).then(res => {
      expect( res.result.ok ).to.be.equal( 1 )
      expect( res.result.n ).to.be.equal( 1 )
    })
  })

  it('should find a bar cat', function() {
    return collection.findOne({ bar: 'cat' }).then(doc => {
      expect( doc ).to.have.all.keys( '_id', 'bar' )
      expect( doc.bar ).to.equal( 'cat' )
    })
  })

  it('should remove cat foo', function() {
    return collection.remove({name: "foo"}).then(res => {
      expect( res.result.ok ).to.equal( 1 )
    })
  })

  it('resets the db', function() {
    return db.reset().then(() => {
      collection.findOne({ bar: 'cat' }).then(doc => expect( doc ).to.be.null)
    })
  })


  it('unmocks and reconnects', function(){
    return db.unmockAndReconnect().then(res => {
      debug('unmockAndReconnect', res)
    })
  })


})
