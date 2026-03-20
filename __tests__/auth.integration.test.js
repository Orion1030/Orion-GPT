/**
 * Auth endpoint integration tests.
 * These run against the real Express app (in-memory MongoDB via global setup).
 *
 * Run: npx jest __tests__/auth.integration.test.js
 */
const request = require('supertest');
const app = require('../app');

describe('POST /api/auth/signup', () => {
  const validPayload = {
    name: `testuser_${Date.now()}`,
    password: 'SecurePass1!',
    confirmPassword: 'SecurePass1!',
    role: '1',
  };

  test('returns 201 and success message', async () => {
    const res = await request(app).post('/api/auth/signup').send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  test('returns 400 if passwords do not match', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      ...validPayload,
      name: `testuser_mismatch_${Date.now()}`,
      confirmPassword: 'DifferentPass1!',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 for duplicate username', async () => {
    const payload = { ...validPayload, name: `dup_${Date.now()}` };
    await request(app).post('/api/auth/signup').send(payload);
    const res = await request(app).post('/api/auth/signup').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      password: 'SecurePass1!',
      confirmPassword: 'SecurePass1!',
      role: '1',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/signin', () => {
  test('returns 401 for non-existent user', async () => {
    const res = await request(app).post('/api/auth/signin').send({
      name: 'doesNotExist_xyzabc',
      password: 'anyPassword1!',
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('returns 400 when name is missing', async () => {
    const res = await request(app).post('/api/auth/signin').send({
      password: 'SomePass1!',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  test('returns 400 when no refresh token provided', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('returns 401 for invalid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid.token.here' });
    expect(res.status).toBe(401);
  });
});
