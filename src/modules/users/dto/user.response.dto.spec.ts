import { UserResponseDto } from './user.response.dto.js';

describe('UserResponseDto', () => {
  it('exposes only public user fields', () => {
    const dto = UserResponseDto.fromEntity({
      id: 'user-id',
      name: 'Ana',
      email: 'ana@example.com',
      passwordHash: 'hash',
      role: 'DRIVER',
      emailVerifiedAt: null,
      stripeCustomerId: null,
      paymentMode: 'TEST',
      locationMode: 'DEMO',
      autoRefund: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(dto).toEqual({
      id: 'user-id',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'DRIVER',
      emailVerified: false,
      hasPassword: true,
      paymentMode: 'TEST',
      locationMode: 'DEMO',
      autoRefund: false,
    });
  });

  it('exposes the payment and location modes', () => {
    const dto = UserResponseDto.fromEntity({
      id: 'user-id',
      name: 'Revisor',
      email: 'review@example.com',
      passwordHash: 'hash',
      role: 'DRIVER',
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
      paymentMode: 'LIVE',
      locationMode: 'DEVICE',
      autoRefund: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(dto).toMatchObject({
      paymentMode: 'LIVE',
      locationMode: 'DEVICE',
      autoRefund: true,
    });
  });

  it('reports a verified email', () => {
    const dto = UserResponseDto.fromEntity({
      id: 'user-id',
      name: 'Ana',
      email: 'ana@example.com',
      passwordHash: 'hash',
      role: 'DRIVER',
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
      paymentMode: 'TEST',
      locationMode: 'DEMO',
      autoRefund: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(dto.emailVerified).toBe(true);
  });

  it('reports an account without a password', () => {
    const dto = UserResponseDto.fromEntity({
      id: 'user-id',
      name: 'Ana',
      email: 'ana@example.com',
      passwordHash: null,
      role: 'DRIVER',
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
      paymentMode: 'TEST',
      locationMode: 'DEMO',
      autoRefund: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(dto.hasPassword).toBe(false);
  });
});
