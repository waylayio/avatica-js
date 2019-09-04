# Avatica JS [![Build Status](http://drone.waylay.io/api/badges/waylayio/avatica-js/status.svg)](http://drone.waylay.io/waylayio/avatica-js)


JavaScript connector to [Calcite Avatica Server](https://calcite.apache.org/avatica/)


## Building

    yarn install
    
    
## Test

    yarn test

## Generating the protobuf JSON

    ./node_modules/protobufjs/bin/pbjs -t json  \
        proto/common.proto proto/requests.proto \
        proto/responses.proto  > lib/protobuf_bundle.json      


## Example

```
const connect = require('avaticajs')

connect('http://sql-connector-staging.waylay.io/', apiKey, apiSecret)
  .then(conn => {
    return conn.query("select * from table(waylay.timeseries('151CF', 'lightAmbi')) limit 1000").then(
      resultSet => {
        conn.close()
        console.log(resultSet)
      }
    ).catch(err => {
      conn.close()
      throw err
    })
  }).catch(err => {
    console.log("Got error: ", err)
})
```
