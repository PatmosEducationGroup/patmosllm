// Simple runner that loads .env.local and executes the TypeScript prepopulation script
require('dotenv').config({ path: '.env.local' })
require('tsx/cjs').register()
require('./prepopulate-users.ts')
