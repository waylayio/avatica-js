# Avatica JS

JavaScript connector to [Calcite Avatica Server](https://calcite.apache.org/avatica/)


## Example

```
const connect = require('avaticajs')

connect('http://sql-connector-staging.waylay.io/', apiKey, apiSecret)
    .then(conn => {
      conn.query("select * from table(waylay.timeseries('151CF', 'lightAmbi')) limit 1000").then(
          resultSet => console.log(resultSet)
          conn.close()
      )      
    }).catch(err => {
      console.log("Got error:", err)
})
```
