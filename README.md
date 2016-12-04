[![Build Status](https://travis-ci.org/deployable/mockgodb.png?branch=master)](https://travis-ci.org/deployable/mockgodb)

## MockgoDB

MockgoDB provides test database by spinning up mongod on the back when `MongoClient.connect` call is made. By default it is using in memory store which does not have persistence.

The code is based of the excellent [Mockgoose](https://github.com/Mockgoose/Mockgoose) which does the same for a Mongoose connection.

## Install

To install the latest official version, use NPM:

    npm install mockgodb --save-dev


## Usage

You simply require `mockgodb` before your connection statement.

    const Mockgodb = require('mockgodb');
    const MongoClient = require('mongodb').MongoClient;

    Mockgodb.setup(MongoClient)
      .then(() => MongoClient.connect("mongodb://dbhost.you.com:27017/all_Data"))
      .then((db) => db.findOne({ name: "test" }))
      .then((doc) => console.log(doc))

Once mockgodb has setup any `connect()` will be intercepted so no real databases are connected to.

## Mocha

```javascript
const Mockgodb = require('mockgodb')
let app = null

before(function(done) {
  Mockgodb.setup(MongoClient)
    .then(() => {
      app = require('../app')
      done()
    }
  });
});

describe('...', function() {
  it('Retrieve a document', function(done) {
    return app.get(id).then(doc => {
      expect(doc).to.be.ok
      expect(doc).to.have.property('name').and.to.equal("Jim")
    })
  });
});
```

## Helper methods and variables

### reset(callback)
Reset method will remove **ALL** of the collections from a temporary store,
note that this method is part of **Mockgodb** object.

```javascript
Mockgodb.reset(() => done())
```

### isMocked
Returns **TRUE** from **MongoClient `db`** object if Mockgodb is applied

```javascript
if ( db.isMocked === true ) {
  // Mongo db connection is mocked
}
```

## unmock(callback)
Method that can be applied on **MongoClient `db`** to remove modifications added
by **Mockgodb**, it will perform disconnect on temporary store that was
created, and **will not reconnect**

## unmockAndReconnect(callback)
Same as **unmock**, however it will reconnect to original URI that was
passed during **connect**

### Pre-requisites

* Node.js >= 4.0.0

### Development

Mockgodb is written in ES6 using Bluebird promises. It uses Babel to compile to js. 
Mocha/Chai to test and eslint to keep itself in line. 

### Setup

```
git clone https://github.com/deployable/mockgodb.git
cd mockgodb
npm install
npm test
```
