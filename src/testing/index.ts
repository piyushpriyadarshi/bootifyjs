/**
 * BootifyJS testing kit — exported via the `bootifyjs/testing` subpath.
 * Ships the same fakes and helpers the framework's own test suite uses.
 */
export { createTestApp } from './create-test-app'
export type { CreateTestAppOptions, TestApp } from './create-test-app'

export { FakeTokenStorage, FakeRedisClient, FakeTransport } from './fakes'
