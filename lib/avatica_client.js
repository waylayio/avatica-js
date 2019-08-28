const protobuf = require('protobufjs')
const axios = require('axios')

// Load all the protobuf message definitions
const root = protobuf.Root.fromJSON(require('./protobuf_bundle.json'))

/**
 * Internal client that handles protobuf encoding/decoding and HTTP communication.
 */
class ProtobufClient {
  constructor (url) {
    this._url = url
  }

  static _encode (payload, messageTypeName) {
    const MessageType = root.lookup(messageTypeName)
    const verifyError = MessageType.verify(payload)
    if (verifyError) {
      throw new Error(verifyError)
    }
    return MessageType.encode(payload).finish()
  }

  static _encodeAsWireMessage (payload, messageTypeName) {
    const encodedPayload = ProtobufClient._encode(payload, messageTypeName)
    const WireMessage = root.WireMessage
    const wireMessagePayload = {
      name: `org.apache.calcite.avatica.proto.Requests$${messageTypeName}`,
      wrappedMessage: encodedPayload
    }
    const verifyError = WireMessage.verify(wireMessagePayload)
    if (verifyError) {
      throw new Error(verifyError)
    }
    return WireMessage.encode(wireMessagePayload).finish()
  }

  static _decode (payload, messageTypeName) {
    const MessageType = root.lookup(messageTypeName)
    return MessageType.decode(payload)
  }

  static _decodeWireMessage (payload, messageTypeName) {
    const WireMessage = root.WireMessage
    const decodedWireMessage = WireMessage.decode(payload)
    return ProtobufClient._decode(decodedWireMessage.wrappedMessage, messageTypeName)
  }

  post (messageAsJson, requestMessageTypeName, responseMessageTypeName) {
    const wireMessage = ProtobufClient._encodeAsWireMessage(messageAsJson, requestMessageTypeName, responseMessageTypeName)
    return axios.post(
      this._url,
      wireMessage,
      {
        headers: {
          'content-type': 'application/x-google-protobuf'
        },
        responseType: 'arraybuffer'
      })
      .then(response => {
        return ProtobufClient._decodeWireMessage(response.data, responseMessageTypeName)
      }).catch(err => {
        const errorResponse = ProtobufClient._decodeWireMessage(err.response.data, 'ErrorResponse')
        throw new Error(errorResponse.errorMessage)
      })
  }
}

function _mapColumnValue (columnValue) {
  const scalarValue = columnValue.scalarValue
  if (scalarValue.type === root.Rep.STRING) {
    return scalarValue.stringValue
  } else if (scalarValue.type === root.Rep.NUMBER) {
    return scalarValue.numberValue
  } else if (scalarValue.type === 13) {
    return scalarValue.numberValue.toNumber() // Long
  } else if (scalarValue.type === 15) {
    return scalarValue.doubleValue
  } else if (scalarValue.type === 24) {
    return null
  } else {
    throw new Error(`Don't know how to map type ${scalarValue.type} -> ${JSON.stringify(scalarValue)}`)
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
        connectionId: this._connectionId
      },
      'CreateStatementRequest', 'CreateStatementResponse'
    ).then(createStatementResponse => {
      const prepareAndExecuteRequest = {
        connectionId: this._connectionId,
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

module.exports = {
  ProtobufClient,
  Connection,
  ResultSet,
  _mapColumnValue
}
