const { _mapColumnValue } = require('../lib/avatica_client')
const protobuf = require('protobufjs')
const Long = require('long')

const root = protobuf.Root.fromJSON(require('../lib/protobuf_bundle.json'))

test('mapColumnValue string', () => {
  expect(_mapColumnValue({
    scalarValue: {
      type: root.Rep.STRING,
      stringValue: 'testValue'
    }
  })).toBe('testValue')
})

test('mapColumnValue number', () => {
  expect(_mapColumnValue({
    scalarValue: {
      type: root.Rep.NUMBER,
      numberValue: 123
    }
  })).toBe(123)
})

test('mapColumnValue long', () => {
  expect(_mapColumnValue({
    scalarValue: {
      type: root.Rep.LONG,
      numberValue: new Long(123)
    }
  })).toBe(123)
})

test('mapColumnValue double', () => {
  expect(_mapColumnValue({
    scalarValue: {
      type: root.Rep.DOUBLE,
      doubleValue: 123.45
    }
  })).toBe(123.45)
})

test('mapColumnValue null', () => {
  expect(_mapColumnValue({
    scalarValue: {
      type: root.Rep.NULL
    }
  })).toBe(null)
})

test('mapColumnValue unsupported type', () => {
  expect(() => _mapColumnValue({
    scalarValue: {
      type: root.Rep.ARRAY
    }
  })).toThrow(`Don't know how to map type ${root.Rep.ARRAY}`)
})
