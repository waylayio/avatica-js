const connect = require('..')
const { ResultSet } = require('../lib/avatica_client')

beforeEach(() => {
  expect(process.env.STAGING_CLIENT_ID).toBeDefined()
  expect(process.env.STAGING_CLIENT_SECRET).toBeDefined()
})

test('test connection info query', () => {
  return expect(
    connect('http://sql-connector-staging.waylay.io/',
      process.env.STAGING_CLIENT_ID, process.env.STAGING_CLIENT_SECRET)
      .then(conn => {
        return conn.query('select engine_host eng_host_name from waylay.connection_info').then(
          resultSet => {
            conn.close()
            return resultSet
          }
        )
      })).resolves.toMatchObject(new ResultSet(['ENG_HOST_NAME'], [['staging.waylay.io']]))
})

test('test resource count query', () => {
  return expect(
    connect('http://sql-connector-staging.waylay.io/',
      process.env.STAGING_CLIENT_ID, process.env.STAGING_CLIENT_SECRET)
      .then(conn => {
        return conn.query('select count(*) from waylay.resource where id = \'abc\'').then(
          resultSet => {
            conn.close()
            return resultSet.rows[0][0]
          }
        )
      })).resolves.toBeGreaterThanOrEqual(0)
})
