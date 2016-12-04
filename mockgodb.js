'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _mongodbPrebuilt = require('mongodb-prebuilt');

var _mongodbPrebuilt2 = _interopRequireDefault(_mongodbPrebuilt);

var _rimraf = require('rimraf');

var _rimraf2 = _interopRequireDefault(_rimraf);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _portfinder = require('portfinder');

var _portfinder2 = _interopRequireDefault(_portfinder);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var rimrafAsync = _bluebird2.default.promisify(_rimraf2.default);
_bluebird2.default.promisifyAll(_fs2.default);
_bluebird2.default.promisifyAll(_portfinder2.default);
var debug = (0, _debug2.default)('dply:mockgodb');

var Mockgo = function () {
  _createClass(Mockgo, null, [{
    key: 'setup',
    value: function setup(MongoClient, db_opts) {
      return new Mockgo(MongoClient, db_opts).setup();
    }
  }]);

  function Mockgo(MongoClient) {
    var db_opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, Mockgo);

    this.MongoClient = MongoClient;

    this.db_opts = db_opts;
    this.db_version = !db_opts.version ? _mongodbPrebuilt2.default.active_version() : db_opts.version;
    delete this.db_opts.version;

    this.db_opts.bind_ip = '127.0.0.1';
    this.db_opts.port = !db_opts.port ? 27017 : Number(db_opts.port);

    if (!db_opts.storageEngine) {
      var parsed_version = this.db_version.split('.');
      if (parsed_version[0] >= 3 && parsed_version[1] >= 2) {
        this.db_opts.storageEngine = 'ephemeralForTest';
      } else {
        this.db_opts.storageEngine = 'inMemoryExperiment';
      }
    }

    if (!db_opts.dbpath) {
      this.db_opts.dbpath = _path2.default.join(__dirname, '.mongooseTempDB');
      debug('dbpath: %s', this.db_opts.dbpath);
    } else {
      // Force a . dir so we don't rm -rf something bad. 
      this.db_opts.dbpath = _path2.default.join(this.db_opts.dbpath, '.mongooseTempDB');
    }
  }

  _createClass(Mockgo, [{
    key: 'setup',
    value: function setup() {
      var _this = this;

      return new _bluebird2.default(function (resolve, reject) {
        _this.orig_connect = _this.MongoClient.connect;
        // this.orig_createConnection = this.MongoClient.createConnection

        try {
          _fs2.default.mkdirSync(_this.db_opts.dbpath);
        } catch (e) {
          if (e.code !== 'EEXIST') return reject(e);
        }

        _this.start_server().then(function (mockgo_uri) {
          debug('Patching MongoClient.connect');

          // For now no errors
          _this.MongoClient.connect = function () {
            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
              args[_key] = arguments[_key];
            }

            _this.connect_args = args;
            _this.orig_connect_uri = args[0];
            _this.connect_args[0] = mockgo_uri;
            debug('running original connect', args);
            return _this.orig_connect.apply(_this.MongoClient, _this.connect_args).then(function (db) {
              _this.addUnmock(db);
              _this.addUnmockAndReconnect(db);
              return db;
            });
          };

          _this.MongoClient.isMocked = true;

          resolve(mockgo_uri);
        });
      });
    }
  }, {
    key: 'start_server',
    value: function start_server() {
      debug('Starting to look for available port, base: %s:%d', this.db_opts.bind_ip, this.db_opts.port);

      var db_opts = this.db_opts;

      var port_opts = {
        host: db_opts.bind_ip,
        port: db_opts.port
      };

      return _portfinder2.default.getPortAsync(port_opts).then(function (freePort) {
        db_opts.port = freePort;
        debug('attempting to start server on %s:%d', db_opts.bind_ip, db_opts.port);

        db_opts.dbpath = _path2.default.join(db_opts.dbpath, db_opts.port.toString());

        // Clean up any old prior files
        return rimrafAsync(db_opts.dbpath);
      }).then(function () {

        try {
          _fs2.default.mkdirSync(db_opts.dbpath);
        } catch (e) {
          if (e.code !== 'EEXIST') throw e;
        }

        var server_opts = {
          args: db_opts,
          auto_shutdown: true
        };

        var startResult = _mongodbPrebuilt2.default.start_server(server_opts, function () {});
        if (startResult !== 0) {
          debug('unable to start mongodb on: %d', db_opts.port);
          db_opts.port = ++db_opts.port;
          return Mockgo.start_server(db_opts);
        }

        debug('mongod.start_server up');

        var mock_uri = 'mongodb://localhost:' + db_opts.port;
        return mock_uri;
      }).catch(function (err) {
        debug('error from start_server:', err);
        throw err;
      });
    }
  }, {
    key: 'addUnmock',
    value: function addUnmock(db) {
      var _this2 = this;

      // Add unmock
      db.unmock = function (callback) {
        return db.close().then(function () {
          debug('unmock db.close');
          delete db.isMocked;
          _this2.connect_args[0] = _this2.orig_connect_uri;
          _this2.MongoClient.connect = _this2.orig_connect;
          _mongodbPrebuilt2.default.shutdown();
          if (callback) callback();
          return true;
        });
      };
    }
  }, {
    key: 'addUnmockAndReconnect',
    value: function addUnmockAndReconnect(db) {
      var _this3 = this;

      // Add unmockAndReconnect
      db.unmockAndReconnect = function (callback) {
        return db.unmock().then(function () {
          debug('unmockAndReconnect connect');
          var overloaded_callback = function overloaded_callback(err) {
            return callback(err);
          };
          // mongodb connect prototype connect(String, Object?, Function?)
          _this3.connect_args[0] = _this3.orig_connect_uri;
          if (typeof _this3.connect_args.slice(-1) === 'function') {
            overloaded_callback = function overloaded_callback(err) {
              if (callback) callback(err);
              _this3.connect_args.slice(-1)(err);
            };
          } else _this3.connect_args.push(overloaded_callback);

          return _this3.orig_connect.apply(_this3.MongoClient, _this3.connect_args);
        });
      };
    }
  }, {
    key: 'reset',
    value: function reset(done) {
      this.MongoClient.connection.db.dropDatabase(function (err) {
        if (typeof done === 'function') done(err);
      });
    }
  }]);

  return Mockgo;
}();

exports.default = Mockgo;

module.exports = Mockgo;

//# sourceMappingURL=mockgo.js.map