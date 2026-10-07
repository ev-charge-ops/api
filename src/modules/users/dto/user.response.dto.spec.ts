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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(dto).toEqual({
      id: 'user-id',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'DRIVER',
      emailVerified: false,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(dto.emailVerified).toBe(true);
  });
});
