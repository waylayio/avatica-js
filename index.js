const uuid = require('uuid/v1')
const os = require('os')

const { ProtobufClient, Connection } = require('./lib/avatica_client')

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
  const connectionId = `${uuid()}@${os.hostname()}`
  const openConnectionPayload = {
    connectionId: connectionId,
    info: {
      user: apiKey,
      password: apiSecret
    }
  }

  return protobufClient.post(
    openConnectionPayload,
    'OpenConnectionRequest',
    'OpenConnectionResponse')
    .then(response => {
      return new Connection(connectionId, protobufClient)
    })
}

module.exports = connect
