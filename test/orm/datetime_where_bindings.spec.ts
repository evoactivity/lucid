/*
 * @adonisjs/lucid
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { test } from '@japa/runner'
import { DateTime } from 'luxon'

import { column } from '../../src/orm/decorators/index.js'
import {
  setup,
  getDb,
  cleanup,
  ormAdapter,
  resetTables,
  getBaseModel,
} from '../../test-helpers/index.js'
import { AppFactory } from '@adonisjs/core/factories/app'

/**
 * Lucid formats a DateTime when persisting it, through the column's
 * prepare function, but not when the same value is used in a where
 * clause. On SQLite that leaves no correct way to write the comparison:
 * the value is stored as text in the dialect's format, and anything the
 * caller passes has to match that format byte for byte.
 */
test.group('DateTime where clauses', (group) => {
  group.setup(async () => {
    await setup()
  })

  group.teardown(async () => {
    await cleanup()
  })

  group.each.teardown(async () => {
    await resetTables()
  })

  async function boot(fs: any) {
    const app = new AppFactory().create(fs.baseUrl, () => {})
    await app.init()
    const db = getDb()
    return { db, BaseModel: getBaseModel(ormAdapter(db)) }
  }

  function defineUser(BaseModel: any) {
    class User extends BaseModel {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare username: string

      @column()
      declare email: string

      @column.dateTime()
      declare joinedAt: DateTime
    }
    return User as any
  }

  /**
   * The same column, declared as a date rather than a datetime, so the
   * formatting is toISODate() instead of the dialect's datetime format.
   */
  function defineUserWithDateColumn(BaseModel: any) {
    class User extends BaseModel {
      @column({ isPrimary: true })
      declare id: number

      @column()
      declare username: string

      @column()
      declare email: string

      @column.date()
      declare joinedAt: DateTime
    }
    return User as any
  }

  /**
   * Six users joining on the hour from 18:00 to 23:00 UTC. Every query
   * below asks for those before 21:00, so the answer is always three.
   */
  const base = DateTime.fromISO('2026-01-01T18:00:00Z')
  const boundary = DateTime.fromISO('2026-01-01T21:00:00Z')

  async function seed(User: any) {
    for (let i = 0; i < 6; i++) {
      await User.create({
        username: `user-${i}`,
        email: `user-${i}@example.com`,
        joinedAt: base.plus({ hours: i }),
      })
    }
  }

  test('where accepts a DateTime', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUser(BaseModel)
    await seed(User)

    const rows = await User.query().where('joinedAt', '<', boundary)
    assert.lengthOf(rows, 3)
  })

  test('orWhere accepts a DateTime', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUser(BaseModel)
    await seed(User)

    const rows = await User.query().where('username', 'nobody').orWhere('joinedAt', '<', boundary)
    assert.lengthOf(rows, 3)
  })

  test('whereNot accepts a DateTime', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUser(BaseModel)
    await seed(User)

    const rows = await User.query().whereNot('joinedAt', '<', boundary)
    assert.lengthOf(rows, 3)
  })

  test('whereIn accepts DateTime values', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUser(BaseModel)
    await seed(User)

    const rows = await User.query().whereIn('joinedAt', [base, base.plus({ hours: 1 })])
    assert.lengthOf(rows, 2)
  })

  test('whereBetween accepts DateTime values', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUser(BaseModel)
    await seed(User)

    const rows = await User.query().whereBetween('joinedAt', [base, boundary])
    assert.lengthOf(rows, 4)
  })

  test('a row is found by the DateTime that saved it', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUser(BaseModel)

    await User.create({
      username: 'virk',
      email: 'virk@example.com',
      joinedAt: boundary,
    })

    const found = await User.query().where('joinedAt', boundary).first()
    assert.isNotNull(found, 'a row written with this DateTime was not found by it')
  })

  test('a date column formats as a date, not a datetime', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUserWithDateColumn(BaseModel)

    const day = DateTime.fromISO('2026-01-01')
    for (let i = 0; i < 6; i++) {
      await User.create({
        username: `user-${i}`,
        email: `user-${i}@example.com`,
        joinedAt: day.plus({ days: i }),
      })
    }

    const rows = await User.query().where('joinedAt', '<', day.plus({ days: 3 }))
    assert.lengthOf(rows, 3)
  })

  test('non-datetime values are untouched', async ({ fs, assert }) => {
    const { BaseModel } = await boot(fs)
    const User = defineUser(BaseModel)
    await seed(User)

    const rows = await User.query().where('username', 'user-0')
    assert.lengthOf(rows, 1)
  })
})
