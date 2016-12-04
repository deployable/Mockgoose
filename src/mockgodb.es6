
import Promise from 'bluebird'
import mongod from 'mongodb-prebuilt'
import rimraf from 'rimraf'
import Debug from 'debug'
import portfinder from 'portfinder'
import path from 'path'
import fs from 'fs'
import url from 'url'

const rimrafAsync = Promise.promisify(rimraf)
Promise.promisifyAll(fs)
Promise.promisifyAll(portfinder)
const debug = Debug('dply:mockgodb')


// Class var
Mockgodb.urls = {}

class Mockgodb {

  static addConnection(server, db){
    return Mockgodb.urls[server] = { db: db }
  }

  static getConnection(server){
    let murl = url.parse(server)
    let auth = (murl.auth) ? `${murl.auth}@` : ''
    if (murl.query) debug('query params', murl.query)
    let pah = `${murl.protocol}//${auth}${murl.host}`
    debug('pah', pah)
    return Mockgodb.urls[pah]
  }

  static getUrl(server){

  }

  static unmock(server){
    Mockgodb.MongoClient.connect = Mockgodb.original_connect
    let keys = ( server ) ? Array(server) : Mockgodb.urls.keys()
    let p = keys.map(key => Mockgodb.urls[key].db.close())
    return Promise.all(p).then(results => {
      debug('close results', results)
      Mockgodb.urls = {}
    })
  }

  static setup(MongoClient){
    return new Promise((resolve, reject) => {
      Mockgodb.MongoClient = MongoClient
      Mockgodb.original_connect = MongoClient.connect
      Mockgodb.unmock = () => Mockgodb.unmock()

      MongoClient.connect = (mongo_url, ...args) => {
        let mock_conn = Mockgodb.getConnection(mongo_url)
        if (mock_conn) {
          debug('Returning existing mocked connection', args)
          return Promise.resolve(mock_conn.db)
        }
        debug('running original connect', args)
        let mock_url = Mockgodb.getUrl(mongo_url)
        return Mockgodb.original_connect.apply(this.MongoClient, [ mock_url, ...args ])
          .then(db => {
            this.addUnmock(db)
            this.addUnmockAndReconnect(db)
            return db
          })
      }

      Mockgodb.startServer().then(resolve)

    })
  }


  constructor( MongoClient, db_opts = {}){
    this.MongoClient = MongoClient
    
    this.db_opts = db_opts
    this.db_version = (!db_opts.version) ? mongod.active_version() : db_opts.version
    delete this.db_opts.version
    
    this.db_opts.bind_ip = '127.0.0.1'
    this.db_opts.port = (!db_opts.port) ? 27017 : Number(db_opts.port)

    if (!db_opts.storageEngine) {
      let parsed_version = this.db_version.split('.')
      if (parsed_version[0] >= 3 && parsed_version[1] >= 2) {
        this.db_opts.storageEngine = 'ephemeralForTest'
      } else {
        this.db_opts.storageEngine = 'inMemoryExperiment'
      }
    }

    if (!db_opts.dbpath) {
      this.db_opts.dbpath = path.join(__dirname, '.mongooseTempDB')
      debug('dbpath: %s', this.db_opts.dbpath)
    } else {
      // Force a . dir so we don't rm -rf something bad. 
      this.db_opts.dbpath = path.join( this.db_opts.dbpath, '.mongooseTempDB' )
    }

  }

  setup(){
    return new Promise((resolve, reject) => {
      this.orig_connect = this.MongoClient.connect
      // this.orig_createConnection = this.MongoClient.createConnection

      try {
        fs.mkdirSync(this.db_opts.dbpath)
      } catch (e) {
        if (e.code !== 'EEXIST') return reject(e)
      }

      this.start_server()
      .then(mockgo_uri => {
        debug('Patching MongoClient.connect')

        // For now no errors
        this.MongoClient.connect = (...args) => {
          this.connect_args = args
          this.orig_connect_uri = args[0]
          this.connect_args[0] = mockgo_uri
          debug('running original connect', args)
          return this.orig_connect.apply(this.MongoClient, this.connect_args)
          .then(db => {
            this.addUnmock(db)
            this.addUnmockAndReconnect(db)
            return db
          })
        }

        this.MongoClient.isMocked = true

        resolve(mockgo_uri)
      })
    })
  }


  start_server() {
    debug('Starting to look for available port, base: %s:%d', this.db_opts.bind_ip, this.db_opts.port)
    
    let db_opts = this.db_opts

    let port_opts = {
      host: db_opts.bind_ip,
      port: db_opts.port
    }

    return portfinder.getPortAsync(port_opts)
    .then(freePort => {
      db_opts.port = freePort
      debug('attempting to start server on %s:%d', db_opts.bind_ip, db_opts.port)

      db_opts.dbpath = path.join(db_opts.dbpath, db_opts.port.toString())

      // Clean up any old prior files
      return rimrafAsync(db_opts.dbpath)
    }).then(() => {
          
      try {
        fs.mkdirSync(db_opts.dbpath)
      } catch (e) {
        if (e.code !== 'EEXIST') throw e
      }

      let server_opts = {
          args: db_opts,
          auto_shutdown: true
      }

      let startResult = mongod.start_server(server_opts, function() {})
      if (startResult !== 0) {
        debug('unable to start mongodb on: %d', db_opts.port)
        db_opts.port = ++db_opts.port
        return Mockgo.start_server(db_opts)
      }

      debug('mongod.start_server up')
      
      let mock_uri = `mongodb://localhost:${db_opts.port}`
      return mock_uri
    }).catch(err => {
      debug('error from start_server:', err)
      throw err
    })
  }


  addUnmock(db) {
    // Add unmock
    db.unmock = (callback) => {
      return db.close()
      .then(() => {
        debug('unmock db.close')
        delete db.isMocked
        this.connect_args[0] = this.orig_connect_uri
        this.MongoClient.connect = this.orig_connect
        mongod.shutdown()
        if (callback) callback()
        return true
      })
    }
  }

  addUnmockAndReconnect(db){
    // Add unmockAndReconnect
    db.unmockAndReconnect = (callback) => {
      return db.unmock().then(() => {
        debug('unmockAndReconnect connect')
        let overloaded_callback = (err) => callback(err)
        // mongodb connect prototype connect(String, Object?, Function?)
        this.connect_args[0] = this.orig_connect_uri
        if ( typeof this.connect_args.slice(-1) === 'function' ) {
          overloaded_callback = (err) => {
            if (callback) callback(err)
            this.connect_args.slice(-1)(err)
          }              
        }
        else this.connect_args.push(overloaded_callback)

        return this.orig_connect.apply(this.MongoClient, this.connect_args)
      })
    }
  }

  reset(done) {
    this.MongoClient.connection.db.dropDatabase(function(err) {
      if (typeof done === 'function') done(err)
    })
  }

}

//export default Mockgodb
module.exports = Mockgodb

