import { UserResponseDto } from './user.response.dto.js';

describe('UserResponseDto', () => {
  it('exposes only public user fields', () => {
    const dto = UserResponseDto.fromEntity({
      id: 'user-id',
      name: 'Ana',
      email: 'ana@example.com',
      passwordHash: 'hash',
      role: 'DRIVER',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(dto).toEqual({
      id: 'user-id',
      name: 'Ana',
      email: 'ana@example.com',
      role: 'DRIVER',
    });
  });
});
