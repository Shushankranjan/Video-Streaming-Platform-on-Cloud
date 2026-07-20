import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './index.js';

async function seed() {
  const email = 'demo@example.com';
  const password = 'password';
  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (email, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [email, passwordHash]
  );

  console.log(`Seeded user: ${email} / ${password}`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
