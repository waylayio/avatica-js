const protobuf = require('protobufjs')
const axios = require('axios')
const uuid = require('uuid/v1')

// Load all the protobuf message definitions
const root = protobuf.Root.fromJSON(require('./protobuf_bundle.json'))

/**
 * Internal client that handles protobuf encoding/decoding and HTTP communication.
 */
class ProtobufClient {
  constructor (url) {
    this._url = url
  }

  _encode (payload, messageTypeName) {
    const MessageType = root.lookup(messageTypeName)
    const verifyError = MessageType.verify(payload)
    if (verifyError) {
      throw new Error(verifyError)
    }
    return MessageType.encode(payload).finish()
  }

  _encodeAsWireMessage (payload, messageTypeName) {
    const encodedPayload = this._encode(payload, messageTypeName)
    const WireMessage = root.WireMessage
    const wireMessagePayload = {
      name: 'org.apache.calcite.avatica.proto.Requests$' + messageTypeName,
      wrappedMessage: encodedPayload
    }
    const verifyError = WireMessage.verify(wireMessagePayload)
    if (verifyError) {
      throw new Error(verifyError)
    }
    return WireMessage.encode(wireMessagePayload).finish()
  }

  _decode (payload, messageTypeName) {
    const MessageType = root.lookup(messageTypeName)
    return MessageType.decode(payload)
  }

  _decodeWireMessage (payload, messageTypeName) {
    const WireMessage = root.WireMessage
    const decodedWireMessage = WireMessage.decode(payload)
    return this._decode(decodedWireMessage.wrappedMessage, messageTypeName)
  }

  post (messageAsJson, requestMessageTypeName, responseMessageTypeName) {
    const wireMessage = this._encodeAsWireMessage(messageAsJson, requestMessageTypeName, responseMessageTypeName)
    return axios.post(
      this._url,
      wireMessage,
      { headers: { 'content-type': 'application/x-google-protobuf' }, responseType: 'arraybuffer' })
      .then(response => {
        return this._decodeWireMessage(response.data, responseMessageTypeName)
      }).catch(err => {
        const errorResponse = this._decodeWireMessage(err.response.data, 'ErrorResponse')
        throw new Error(errorResponse.errorMessage)
      })
  }
}

function _mapColumnValue (columnValue) {
  const scalarValue = columnValue.scalarValue
  if (scalarValue.type === 21) {
    return scalarValue.stringValue
  } else if (scalarValue.type === 22) {
    return scalarValue.numberValue
  } else if (scalarValue.type === 13) {
    return scalarValue.numberValue.toNumber() // Long
  } else if (scalarValue.type === 15) {
    return scalarValue.doubleValue
  } else if (scalarValue.type === 24) {
    return null
  } else {
    throw new Error("Don't know how to map type " + scalarValue.type + ' -> ' + scalarValue)
  }
}

/**
 * The return value from Connection::query
 */
class ResultSet {
  constructor (columnNames, rows) {
    this.columnNames = columnNames
    this.rows = rows
  }
}

class Connection {
  constructor (connectionId, protobufClient) {
    this._connectionId = connectionId
    this._protobufClient = protobufClient
  }

  /**
   * Close this connection.
   *
   * Should be called on a connection once it is no longer needed.
   */
  close () {
    return this._protobufClient.post({
      connectionId: this._connectionId
    }, 'CloseConnectionRequest', 'CloseConnectionResponse')
  }

  _processFrame (statementId, offset, frame, resultSet) {
    frame.rows.forEach(r => {
      const mappedRow = r.value.map(columnValue => _mapColumnValue(columnValue))
      resultSet.rows.push(mappedRow)
    })

    if (frame.done) {
      this._protobufClient.post({
        connectionId: this._connectionId,
        statementId: statementId
      }, 'CloseStatementRequest', 'CloseStatementResponse')
      return resultSet
    }

    offset = offset + frame.rows.length
    const fetchRequest = {
      connectionId: this._connectionId,
      statementId: statementId,
      offset: offset,
      fetchMaxRowCount: 100
    }

    return this._protobufClient.post(
      fetchRequest,
      'FetchRequest',
      'FetchResponse'
    ).then(fetchResponse => {
      return this._processFrame(statementId, offset, fetchResponse.frame, resultSet)
    }).catch(err => {
      throw new Error(err)
    })
  }

  /**
   * Execute a SQL query.
   *
   * Returns a Promise to the ResultSet containing the results of the query.
   *
   * @param sql query to be executed
   * @returns {PromiseLike<ResultSet>} promimse containing the ResultSet from the query
   */
  query (sql) {
    return this._protobufClient.post(
      {
        // request: "createStatement",
        connectionId: this._connectionId
      },
      'CreateStatementRequest', 'CreateStatementResponse'
    ).then(createStatementResponse => {
      const prepareAndExecuteRequest = {
        // request: "prepareAndExecute",
        connectionId: this._connectionId_connectionId,
        statementId: createStatementResponse.statementId,
        sql: sql,
        maxRowCount: 9999999
      }
      return this._protobufClient.post(
        prepareAndExecuteRequest,
        'PrepareAndExecuteRequest', 'ExecuteResponse'
      ).then(prepareAndExecuteResponse => {
        const columnNames = prepareAndExecuteResponse.results[0].signature.columns.map(col => col.label)
        return this._processFrame(createStatementResponse.statementId, 0,
          prepareAndExecuteResponse.results[0].firstFrame,
          new ResultSet(columnNames, []))
      })
    })
  }
}

/**
 * The main exported function, returns a promise to a Connection object.
 *
 * The Connection object returned in the promise should be closed after it is no longer needed.
 *
 * @param url url of the Avatica server to connect to
 * @param apiKey user api key for connecting to Avatica
 * @param apiSecret user api secret for connecting to Avatica
 * @returns {Promise<Connection | never>} a promise to a Connection object which allows querying
 */
function connect (url, apiKey, apiSecret) {
  const protobufClient = new ProtobufClient(url)
  const connectionId = uuid()
  const openConnectionPayload = {
    connectionId: connectionId,
    info: {
      user: apiKey,
      password: apiSecret
    }
  }

  return protobufClient.post(openConnectionPayload, 'OpenConnectionRequest', 'OpenConnectionResponse')
    .then(response => {
      return new Connection(connectionId, protobufClient)
    })
}

module.exports = connect
