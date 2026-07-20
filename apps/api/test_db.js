import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './src/db/index.js';

async function test() {
  try {
    const passwordHash = await bcrypt.hash('password123', 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      ['test2@example.com', passwordHash]
    );
    console.log('Inserted user:', result.rows[0]);
  } catch (err) {
    console.error('DB Error:', err);
  } finally {
    await pool.end();
  }
}

test();
